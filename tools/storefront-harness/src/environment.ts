import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Sandbox, type CreateOptions} from 'railway';
import {HARNESS_ROOT, TEMPLATE_ROOT, REMOTE_ROOT, SDK_VERSION, writeJson} from './config.ts';
import {readSource, sha256, sourceDigest, type FileSet} from './files.ts';
import {Attempt, shellQuote} from './railway.ts';

export interface CleanEnvironment {environmentId:string; checkpointId:string; checkpointName:string; sdkVersion:string; templateVersion:string; sourceDigest:string; lockfileSha256:string; node:string; npm:string; createdAt:string;}
const RECORD = path.join(HARNESS_ROOT,'.state/environment.json');
export async function templateSource() {
  const source=await readSource(TEMPLATE_ROOT);
  const manifest=JSON.parse(source.get('template/template-manifest.json')!.toString());
  const actual=sha256(source.get('package-lock.json')!.toString().replaceAll('\r\n','\n'));
  if(actual!==manifest.buildEnvironment.lockfileSha256) throw new Error('Template lockfile hash does not match its manifest');
  if(!/^\d+\.\d+\.\d+$/.test(manifest.buildEnvironment.node) || !/^\d+\.\d+\.\d+$/.test(manifest.buildEnvironment.npm)) throw new Error('Invalid template toolchain version');
  return {source,manifest,actual};
}
export async function loadEnvironment(source: FileSet, options: CreateOptions): Promise<CleanEnvironment> {
  let record: CleanEnvironment;
  try {record=JSON.parse(await fs.readFile(RECORD,'utf8'));} catch {throw new Error('Run npm run sandbox:prepare first.');}
  if(record.environmentId!==options.environmentId || record.sdkVersion!==SDK_VERSION || record.sourceDigest!==sourceDigest(source)) throw new Error('The clean checkpoint is out of date. Run sandbox:prepare for this template version.');
  if(!(await Sandbox.checkpoints(options)).some(c=>c.id===record.checkpointId && c.key===record.checkpointName)) throw new Error('Recorded checkpoint is no longer available. Run sandbox:prepare.');
  return record;
}
export async function prepare(attempt: Attempt): Promise<CleanEnvironment> {
  const {source,manifest,actual}=await templateSource();
  await attempt.create();
  await attempt.exec('install-system-tools', 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl xz-utils python3', '/');
  const version=manifest.buildEnvironment.node;
  const install = `set -eu\narch=$(uname -m)\ncase "$arch" in x86_64) arch=x64;; aarch64) arch=arm64;; *) exit 1;; esac\nmkdir -p /tmp/picomart-node\ncd /tmp/picomart-node\nfile=node-v${version}-linux-$arch.tar.xz\ncurl --fail --silent --show-error --retry 3 -O https://nodejs.org/dist/v${version}/$file\ncurl --fail --silent --show-error --retry 3 -O https://nodejs.org/dist/v${version}/SHASUMS256.txt\ngrep " $file$" SHASUMS256.txt | sha256sum -c -\ntar -xJf "$file" -C /usr/local --strip-components=1\nnpm install --global npm@${manifest.buildEnvironment.npm} --no-audit --no-fund\nnode --version\nnpm --version`;
  await attempt.exec('install-node', `sh -c ${shellQuote(install)}`, '/');
  await attempt.exec('check-node',`test "$(node --version)" = v${version} && test "$(npm --version)" = ${manifest.buildEnvironment.npm}`,'/');
  await attempt.upload(source);
  await attempt.exec('install-dependencies','npm ci --no-audit --no-fund');
  await attempt.exec('install-browser','npx --no-install playwright install --with-deps chromium');
  await attempt.exec('check-toolchain', `test "$(node --version)" = v${version} && test "$(npm --version)" = ${manifest.buildEnvironment.npm} && node -e ${shellQuote(`const {chromium}=require('@playwright/test'); require('node:fs').accessSync(chromium.executablePath()); console.log('Toolchain ready')`)}`);
  const name=`picomart-template-${manifest.templateVersion.replaceAll('.','-')}-${actual.slice(0,10)}-${randomUUID().slice(0,8)}`;
  const start=Date.now();
  // Remove attempt-local markers from the clean disk image. Runtime env is not inherited by checkpoints.
  await attempt.sandbox!.files.remove('/picomart-attempt.json');
  const checkpoint=await attempt.sandbox!.checkpoint(name);
  attempt.record.timings.checkpointMs=Date.now()-start;
  attempt.record.checkpoint=name;
  await attempt.persist();
  const record: CleanEnvironment={environmentId:attempt.options.environmentId!, checkpointId:checkpoint.id, checkpointName:name,sdkVersion:SDK_VERSION,templateVersion:manifest.templateVersion,sourceDigest:sourceDigest(source),lockfileSha256:actual,node:version,npm:manifest.buildEnvironment.npm,createdAt:new Date().toISOString()};
  await writeJson(RECORD,record);
  await writeJson(path.join(attempt.directory,'environment.json'),record);
  console.log(`Clean checkpoint: ${name}; workspace: ${REMOTE_ROOT}`);
  return record;
}
