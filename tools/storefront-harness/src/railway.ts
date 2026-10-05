import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Sandbox, SandboxNotFoundError, type CreateOptions, type ExecHandle} from 'railway';
import {HARNESS_ROOT, REMOTE_ROOT, SDK_VERSION, limits, writeJson, safeError} from './config.ts';
import {safeRelative, sha256, sourcePath, type FileSet} from './files.ts';

export interface AttemptRecord {
  id: string; kind: string; environmentId: string; sdkVersion: string; startedAt: string;
  status: string; cleanup: 'pending' | 'destroyed' | 'failed'; sandboxId?: string; checkpoint?: string;
  commands: Array<{name: string; sessionName?: string; exitCode?: number | null; timedOut?: boolean; truncated?: boolean; durationMs?: number}>;
  timings: Record<string, number>; error?: string; finishedAt?: string; artifactBytes?: number; sourceDigest?: string;
}
export class Attempt {
  record: AttemptRecord;
  directory: string;
  sandbox?: Sandbox;
  options: CreateOptions;
  deadline: number;
  active?: ExecHandle;
  canceled = false;
  expired = false;
  private cleaning = false;
  private controller = new AbortController();
  get signal() {return this.controller.signal;}
  cancel() {this.canceled=true;this.controller.abort();void this.active?.kill('KILL').catch(()=>{});}
  expire() {this.expired=true;this.controller.abort();void this.active?.kill('KILL').catch(()=>{});}
  logBytes = 0;
  private logQueue = Promise.resolve();
  private persistQueue = Promise.resolve();
  constructor(kind: string, options: CreateOptions) {
    const id = `${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
    this.directory = path.join(HARNESS_ROOT, 'artifacts', id);
    this.record = {id, kind, environmentId: options.environmentId!, sdkVersion: SDK_VERSION, startedAt: new Date().toISOString(), status:'provisioning', cleanup:'pending', commands:[], timings:{}};
    this.deadline = Date.now() + limits().attemptSeconds * 1000;
    this.options={...options,fetch:async(input,init)=>{
      if(!this.cleaning)this.checkDeadline();
      const response=await (options.fetch||fetch)(input,{...init,signal:this.cleaning?init?.signal:AbortSignal.any([this.signal,...(init?.signal?[init.signal]:[])])});
      // Persist the allocated ID before SDK readiness polling, so a provisioning failure can be cleaned up.
      if(typeof init?.body==='string'&&init.body.includes('sandboxCreate')&&response.ok) {
        const data=await response.clone().json();const id=data.data?.sandboxCreate?.id;
        if(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)){this.record.sandboxId=id;await this.persist();}
      }
      return response;
    }};
  }
  async persist() {
    const snapshot = structuredClone(this.record);
    this.persistQueue = this.persistQueue.then(()=>writeJson(path.join(this.directory, 'result.json'), snapshot));
    await this.persistQueue;
  }
  async create(checkpoint?: string) {
    await this.persist();
    const start = Date.now();
    const options = {...this.options, env: {PICOMART_ATTEMPT_ID: this.record.id}};
    this.sandbox = checkpoint ? await Sandbox.create(checkpoint, options) : await Sandbox.create(options);
    this.record.sandboxId = this.sandbox.id;
    this.record.checkpoint = checkpoint;
    this.record.timings.provisionMs = Date.now() - start;
    await this.persist();
    await this.sandbox.files.write('/picomart-attempt.json', JSON.stringify({attemptId:this.record.id, environmentId:this.record.environmentId}));
    const connectedAt=Date.now();
    this.sandbox=await Sandbox.connect(this.record.sandboxId,this.options);
    this.record.timings.connectMs=Date.now()-connectedAt;
    await this.persist();
    this.checkDeadline();
  }
  checkDeadline() { if (this.canceled || this.expired || Date.now() >= this.deadline) throw new Error(this.canceled ? 'Attempt canceled' : 'Attempt deadline exceeded'); }
  async exec(name: string, command: string, cwd = REMOTE_ROOT, maxSeconds = limits().commandSeconds) {
    this.checkDeadline();
    if (!this.sandbox) throw new Error('Sandbox unavailable');
    this.record.status = name;
    const item: AttemptRecord['commands'][number] = {name};
    this.record.commands.push(item);
    await this.persist();
    const start = Date.now();
    const onOutput = (chunk: string) => {
      this.logBytes += Buffer.byteLength(chunk);
      if (this.logBytes > limits().logBytes) { void this.active?.kill('KILL').catch(()=>{}); throw new Error('Build log limit exceeded'); }
      // Remote tools never receive credentials. Strip terminal control characters from their logs.
      const text = chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');
      process.stdout.write(text);
      this.logQueue = this.logQueue.then(()=>fs.appendFile(path.join(this.directory,'build.log'), text));
    };
    // SDK 3.11 wraps commands in bash -lc. Set PATH after that login shell has sourced its profile.
    const handle = this.sandbox.exec(`export PATH=/usr/local/bin:/usr/bin:/bin\n${command}`, {cwd, timeoutSec: Math.max(1, Math.min(maxSeconds, Math.floor((this.deadline-Date.now())/1000))), onStdout:onOutput, onStderr:onOutput});
    this.active = handle;
    void handle.sessionName.then(async name=>{item.sessionName=name; await this.persist();}).catch(()=>{});
    try {
      const result = await handle;
      Object.assign(item, {exitCode:result.exitCode, timedOut:result.timedOut, truncated:result.truncated, durationMs:Date.now()-start});
      await this.logQueue;
      await this.persist();
      if (result.exitCode !== 0 || result.timedOut || result.truncated) throw new Error(`${name} failed (exit ${result.exitCode}, timeout ${result.timedOut}, truncated ${result.truncated})`);
      this.checkDeadline();
      return result;
    } finally { this.active = undefined; }
  }
  async upload(files: FileSet) {
    const start = Date.now();
    const entries=[...files];
    for(let offset=0;offset<entries.length;offset+=4) {
      this.checkDeadline();
      const results=await Promise.allSettled(entries.slice(offset,offset+4).map(([name,bytes])=>this.sandbox!.files.write(`${REMOTE_ROOT}/${safeRelative(name)}`,bytes)));
      for(const result of results) if(result.status==='rejected') throw result.reason;
    }
    this.record.timings.uploadMs = Date.now()-start;
    await this.persist();
  }
  async destroy() {
    this.cleaning=true;
    if (!this.sandbox&&!this.record.sandboxId) return;
    const start = Date.now();
    try {
      if(!this.sandbox)this.sandbox=await Sandbox.connect(this.record.sandboxId!,this.options);
      await this.sandbox.destroy();
      for (let i=0;i<15;i++) {
        try {await this.sandbox.refresh();} catch(error) {if(error instanceof SandboxNotFoundError) {this.record.cleanup='destroyed'; break;} throw error;}
        if (this.sandbox.status === 'DESTROYED') {this.record.cleanup='destroyed'; break;}
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      if(this.record.cleanup !== 'destroyed') throw new Error('Sandbox destruction has not been confirmed');
    } catch(error) {if(error instanceof SandboxNotFoundError)this.record.cleanup='destroyed';else{this.record.cleanup='failed'; this.record.error=[this.record.error,safeError(error)].filter(Boolean).join('; ');}}
    this.record.timings.cleanupMs=Date.now()-start;
    await this.persist();
  }
}

export function shellQuote(value: string) {return `'${value.replaceAll("'", "'\\''")}'`;}

/** Inventory is a fixed coordinator-owned program; it does not import merchant code. */
export async function collect(attempt: Attempt, kind: 'source' | 'dist'): Promise<FileSet> {
  const root = kind === 'source' ? REMOTE_ROOT : `${REMOTE_ROOT}/dist`;
  const budget = kind === 'source' ? limits().sourceBytes : limits().artifactBytes;
  const program = `import os,stat,json,hashlib\nroot=${JSON.stringify(root)}\nitems=[]\ntotal=0\nfor directory,dirs,files in os.walk(root,followlinks=False):\n if directory==root and ${JSON.stringify(kind)}=='source':\n  dirs[:]=[d for d in dirs if d in ['src','public','tests','template','tooling','vendor']]\n  files=[f for f in files if f in ['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','eslint.config.js','playwright.config.ts','.nvmrc','README.md','.gitignore']]\n for name in dirs+files:\n  p=os.path.join(directory,name)\n  s=os.lstat(p)\n  if stat.S_ISLNK(s.st_mode): raise Exception('Artifact symlink rejected')\n  if name in files:\n   if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1: raise Exception('Not a regular file')\n   total+=s.st_size\n   if s.st_size>${limits().fileBytes} or total>${budget} or len(items)>=2000: raise Exception('Artifact limits exceeded')\n   with open(p,'rb') as f: h=hashlib.sha256(f.read()).hexdigest()\n   items.append({'path':os.path.relpath(p,root),'size':s.st_size,'sha256':h})\nprint(json.dumps(items))`;
  const result = await attempt.exec(`inventory-${kind}`, `python3 -I -c ${shellQuote(program)}`);
  const entries: Array<{path:string;size:number;sha256:string}> = JSON.parse(result.stdout);
  if(!Array.isArray(entries) || entries.length > 2000) throw new Error('Invalid artifact inventory');
  const files: FileSet = new Map(); let total=0;
  for(const entry of entries) {
    safeRelative(entry.path);
    if(files.has(entry.path) || !Number.isSafeInteger(entry.size) || entry.size<0 || entry.size>limits().fileBytes || (total+=entry.size)>budget || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid artifact entry');
    if(kind==='source' && !sourcePath(entry.path)) throw new Error('Unexpected source artifact');
    attempt.checkDeadline();
    const bytes=Buffer.from(await attempt.sandbox!.files.read(`${root}/${entry.path}`, {format:'bytes', length:entry.size+1}));
    if(bytes.length!==entry.size || sha256(bytes)!==entry.sha256) throw new Error(`Artifact verification failed: ${entry.path}`);
    files.set(entry.path,bytes);
  }
  if(kind==='dist' && (!files.has('index.html') || !files.has('storefront.json'))) throw new Error('Incomplete website output');
  return files;
}
