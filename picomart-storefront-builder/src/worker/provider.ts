import {Sandbox, SandboxNotFoundError, type CreateOptions, type ExecHandle} from 'railway';
import {z} from 'zod';
import {sha256} from '../storage/bunny.ts';
import type {BuildAttempt} from '../domain/records.ts';
import {REMOTE_ROOT, limits, sandboxEnvironmentId} from './config.ts';

export interface VirtualMachine {id: string; status: string; createdAt: string;}
export interface Machine {
  id: string;
  exec(name: string, command: string, cwd?: string): Promise<{stdout: string; stderr: string}>;
  write(path: string, bytes: Uint8Array | string): Promise<void>;
  read(path: string, length: number): Promise<Buffer>;
  logs(): Buffer;
}
export interface Provider {
  inventory(): Promise<VirtualMachine[]>;
  identify(vm: VirtualMachine): Promise<{owner: string; attemptId: string} | null>;
  create(attempt: BuildAttempt, checkpoint: string, signal: AbortSignal, allocated: (id: string) => Promise<void>, command: (ref: string) => Promise<void>): Promise<Machine>;
  destroy(id: string): Promise<boolean>;
  owner: string;
}
export class BuildFailure extends Error {
  code: string; repairable: boolean; feedback: string;
  constructor(code: string, repairable = false, feedback = '') { super(code); this.code = code; this.repairable = repairable; this.feedback = feedback.slice(-24000); }
}
export class RailwayProvider implements Provider {
  readonly owner: string;
  #options: CreateOptions;
  #env: string;
  #transport: typeof fetch;
  constructor(prefix: string, env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch) {
    const token = env.RAILWAY_API_TOKEN;
    if (!token) throw new Error('RAILWAY_API_TOKEN is required');
    // The template checkpoint and sandbox credential have their own scope,
    // independent of the environment hosting the permanent builder service.
    this.#env = sandboxEnvironmentId(env);
    this.owner = sha256(`${this.#env}/${prefix}`);
    this.#transport = async (input, init) => transport(input, {...init, signal: AbortSignal.any([AbortSignal.timeout(120000), ...(init?.signal ? [init.signal] : [])])});
    this.#options = {token, authType: z.enum(['bearer', 'project-token']).parse(env.RAILWAY_AUTH_TYPE || 'project-token'),
      environmentId: this.#env, networkIsolation: 'ISOLATED', idleTimeoutMinutes: 30, fetch: this.#transport};
  }
  async inventory(): Promise<VirtualMachine[]> {
    // SDK list omits pageInfo; explicitly paginate the same GraphQL connection.
    const result: VirtualMachine[] = []; let after: string | null = null;
    for (let page = 0; page < 100; page++) {
      const response: Response = await this.#transport('https://backboard.railway.com/graphql/v2', {method: 'POST', redirect: 'error',
        headers: {'Content-Type': 'application/json', ...(this.#options.authType === 'project-token' ? {'Project-Access-Token': this.#options.token!} : {Authorization: `Bearer ${this.#options.token}`})},
        body: JSON.stringify({query: 'query($environmentId:String!,$after:String){sandboxes(environmentId:$environmentId,first:100,after:$after){pageInfo{hasNextPage endCursor}edges{node{id status createdAt environmentId}}}}', variables: {environmentId: this.#env, after}})});
      if (!response.ok) { await response.body?.cancel(); throw new Error('Sandbox inventory unavailable'); }
      const data: {pageInfo: {hasNextPage: boolean; endCursor: string | null}; edges: {node: VirtualMachine}[]} = z.object({data: z.object({sandboxes: z.object({pageInfo: z.object({hasNextPage: z.boolean(), endCursor: z.string().nullable()}), edges: z.array(z.object({node: z.object({id: z.string().uuid(), status: z.string(), createdAt: z.string(), environmentId: z.literal(this.#env)})})).max(100)})})}).parse(await response.json()).data.sandboxes;
      result.push(...data.edges.map(edge => edge.node));
      if (!data.pageInfo.hasNextPage) return result;
      if (!data.pageInfo.endCursor || data.pageInfo.endCursor === after) throw new Error('Invalid sandbox pagination');
      after = data.pageInfo.endCursor;
    }
    throw new Error('Sandbox inventory limit exceeded');
  }
  async identify(vm: VirtualMachine) {
    if (vm.status !== 'RUNNING') return null;
    const sandbox = await Sandbox.connect(vm.id, this.#options);
    // Fixed command reads only our nonsecret ownership markers, never the whole environment.
    const result = await sandbox.exec('printf "%s\\n%s" "$PICOMART_BUILDER_OWNER" "$PICOMART_ATTEMPT_ID"', {cwd: '/', timeoutSec: 10});
    if (result.exitCode !== 0 || result.timedOut || result.truncated || result.stdout.length > 200) throw new Error('Cannot identify sandbox');
    const [owner, attemptId] = result.stdout.trim().split('\n');
    return /^[a-f0-9]{64}$/.test(owner || '') && z.string().uuid().safeParse(attemptId).success ? {owner, attemptId} : null;
  }
  async create(attempt: BuildAttempt, checkpoint: string, signal: AbortSignal, allocated: (id: string) => Promise<void>, command: (ref: string) => Promise<void>): Promise<Machine> {
    // Creation is never retried here. A lost response is reconciled via markers that are
    // attached atomically at creation, including a crash before the ID can be journaled.
    let allocatedId: string | undefined;
    const options: CreateOptions = {...this.#options, env: {PICOMART_BUILDER_OWNER: this.owner, PICOMART_ATTEMPT_ID: attempt.id}, fetch: async (input, init) => {
      const response = await this.#transport(input, {...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])])});
      if (typeof init?.body === 'string' && init.body.includes('sandboxCreate') && response.ok) {
        const body = await response.clone().json(); const id = body.data?.sandboxCreate?.id;
        if (z.string().uuid().safeParse(id).success) { allocatedId = id; await allocated(id); }
      }
      return response;
    }};
    let sandbox: Sandbox;
    try { sandbox = await Sandbox.create(checkpoint, options); allocatedId = sandbox.id; await allocated(sandbox.id); }
    catch (error) {
      // Even if the journal becomes unhealthy while persisting the allocated ID, cleanup
      // can use the ID observed in this process. Lost responses remain marker-recoverable.
      if (allocatedId) try { await this.destroy(allocatedId); } catch { /* Reconciler retries. */ }
      throw error;
    }
    const chunks: Buffer[] = []; let logBytes = 0;
    return {
      id: sandbox.id,
      logs: () => Buffer.concat(chunks),
      write: async (path, bytes) => { signal.throwIfAborted(); await sandbox.files.write(path, bytes); signal.throwIfAborted(); },
      read: async (path, length) => { signal.throwIfAborted(); const bytes = Buffer.from(await sandbox.files.read(path, {format: 'bytes', length})); signal.throwIfAborted(); return bytes; },
      exec: async (name, text, cwd = REMOTE_ROOT) => {
        signal.throwIfAborted(); let overflow = false; let handle: ExecHandle | undefined;
        const log = (chunk: string) => { const bytes = Buffer.from(chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')); logBytes += bytes.length;
          if (logBytes > limits().logBytes) { overflow = true; void handle?.kill('KILL').catch(() => {}); } else chunks.push(bytes); };
        handle = sandbox.exec(`export PATH=/usr/local/bin:/usr/bin:/bin\n${text}`, {cwd, timeoutSec: Math.max(1, Math.min(limits().commandSeconds, Math.floor((Date.parse(attempt.deadline) - Date.now()) / 1000))), onStdout: log, onStderr: log});
        const abort = () => { void handle!.kill('KILL').catch(() => {}); }; signal.addEventListener('abort', abort, {once: true});
        const persisted = handle.sessionName.then(ref => command(ref));
        // Immediately attach rejection handlers: a journal failure also kills the command.
        void persisted.catch(abort);
        try {
          const result = await handle; await persisted; signal.throwIfAborted();
          if (overflow || result.truncated) throw new BuildFailure('build_output_limit');
          if (result.timedOut) throw new BuildFailure('command_timeout');
          if (result.exitCode !== 0) throw new BuildFailure(`check_${name}_failed`, ['typecheck', 'lint', 'build', 'browser'].includes(name), Buffer.concat(chunks).toString());
          return result;
        } finally { signal.removeEventListener('abort', abort); }
      },
    };
  }
  async destroy(id: string): Promise<boolean> {
    try {
      const sandbox = await Sandbox.connect(id, this.#options);
      if (sandbox.status === 'DESTROYED') return true;
      await sandbox.destroy(); await sandbox.refresh(); return sandbox.toJSON().status === 'DESTROYED';
    } catch (error) { if (error instanceof SandboxNotFoundError) return true; throw error; }
  }
}
export const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
