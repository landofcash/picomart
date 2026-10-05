import fs from 'node:fs/promises';
import {z} from 'zod';
import type {Config} from '../config.ts';
import type {GenerationJob, Revision} from '../domain/records.ts';
import {Journal, canonical} from '../storage/journal.ts';
import {jsonBytes, sha256} from '../storage/bunny.ts';
import {assertProtected, sourceDigest, safeRelative, sourcePath, validateEdits, type FileSet} from './files.ts';
import {packSource, unpackSource} from './archive.ts';
import {catalogInput, configureSource, parseInput, type GenerationInput} from './input.ts';
import {generationPrompt, modelSettings, requestEdits} from './model.ts';
import {limits, REMOTE_ROOT, sandboxEnvironmentId} from './config.ts';
import {BuildFailure, shellQuote, type Machine} from './provider.ts';

const Environment = z.object({environmentId: z.string().uuid(), checkpointName: z.string().min(1), templateVersion: z.string(), sourceDigest: z.string(), sdkVersion: z.literal('3.11.0')}).passthrough();
export async function loadCheckpoint(env: NodeJS.ProcessEnv = process.env, metadata?: unknown) {
  const environmentId = sandboxEnvironmentId(env);
  const value = metadata ?? JSON.parse(await fs.readFile(new URL('../../build-assets/environment.json', import.meta.url), 'utf8'));
  if (value && typeof value === 'object' && 'checkpointName' in value && value.checkpointName === null) throw new BuildFailure('checkpoint_not_prepared');
  const checkpoint = Environment.parse(value);
  if (checkpoint.environmentId !== environmentId) throw new BuildFailure('checkpoint_environment_mismatch');
  return checkpoint;
}
export const PinnedSchema = z.object({engineVersion: z.literal(2), input: z.unknown(), source: z.string(), sourceDigest: z.string(),
  environment: Environment, model: z.object({model: z.string(), seconds: z.number().positive(), maxTokens: z.number().int().positive()}),
  prompt: z.object({instructions: z.string(), input: z.unknown()}), limits: z.object({commandSeconds: z.number(), sourceBytes: z.number(), artifactBytes: z.number(), fileBytes: z.number(), logBytes: z.number()})}).strict();
export type Pinned = z.infer<typeof PinnedSchema>;
export interface BuildResult {files: FileSet; model: string; templateVersion: string; environmentVersion: string;}
export interface Engine {
  pin(job: GenerationJob, signal: AbortSignal): Promise<Pinned>;
  run(job: GenerationJob, pin: Pinned, vm: Machine, signal: AbortSignal, stage: (value: GenerationJob['state']) => Promise<void>, feedback: string): Promise<BuildResult>;
}
export const revisionPrefix = (journal: Journal, revision: Revision) => `${journal.prefix}/${revision.network}/${revision.ownerAccountId}/shops/${revision.shopId}/revisions/${revision.id}`;
export class GenerationEngine implements Engine {
  #journal: Journal;
  #catalog: (job: GenerationJob, signal: AbortSignal) => Promise<GenerationInput>;
  #checkpoint: () => ReturnType<typeof loadCheckpoint>;
  constructor(journal: Journal, config: Config, catalog = (job: GenerationJob, signal: AbortSignal) => catalogInput(config, job, signal), checkpoint = loadCheckpoint) {
    this.#journal = journal; this.#catalog = catalog; this.#checkpoint = checkpoint;
  }
  async pin(job: GenerationJob, signal: AbortSignal): Promise<Pinned> {
    const settings = modelSettings();
    const environment = await this.#checkpoint();
    const template = unpackSource(await fs.readFile(new URL('../../build-assets/template.tar.gz', import.meta.url)));
    if (sourceDigest(template) !== environment.sourceDigest) throw new BuildFailure('template_checkpoint_mismatch');
    let source = template;
    if (job.baseRevisionId) {
      const revision = this.#journal.get<Revision>('revision', job.network, job.ownerAccountId, job.baseRevisionId);
      if (!revision || revision.shopId !== job.shopId || revision.templateVersion !== environment.templateVersion) throw new BuildFailure('base_revision_incompatible');
      const entry = revision.files.find(entry => entry.path === 'source.tar.gz');
      const bytes = await this.#journal.store.get(`${revisionPrefix(this.#journal, revision)}/source.tar.gz`, limits().sourceBytes);
      if (!bytes || !entry || sha256(bytes) !== entry.sha256 || bytes.length !== entry.size) throw new BuildFailure('base_revision_integrity');
      source = unpackSource(bytes);
      const expected = new Map(template); expected.set('public/storefront.json', source.get('public/storefront.json')!);
      assertProtected(expected, source);
    }
    signal.throwIfAborted(); const input = parseInput(await this.#catalog(job, signal));
    if (canonical(input.config) !== canonical(job.config) || input.brief !== job.brief) throw new BuildFailure('input_identity_mismatch');
    source = configureSource(source, input);
    return {engineVersion: 2, input, source: packSource(source).toString('base64'), sourceDigest: sourceDigest(source), environment,
      model: {model: settings.model, seconds: settings.seconds, maxTokens: settings.maxTokens}, prompt: generationPrompt(source, input), limits: limits()};
  }
  async run(_job: GenerationJob, pin: Pinned, vm: Machine, signal: AbortSignal, stage: (value: GenerationJob['state']) => Promise<void>, feedback: string): Promise<BuildResult> {
    const input = parseInput(pin.input), source = unpackSource(Buffer.from(pin.source, 'base64'));
    if (sourceDigest(source) !== pin.sourceDigest || canonical(pin.limits) !== canonical(limits())) throw new BuildFailure('pinned_environment_incompatible');
    await stage('generating');
    const prompt = {...pin.prompt, input: {...pin.prompt.input as object, validationFeedback: feedback}};
    const result = await requestEdits(source, input, feedback, signal, fetch, pin.model, prompt);
    signal.throwIfAborted(); let candidate: FileSet;
    try { candidate = validateEdits(source, result.edits); }
    catch { throw new BuildFailure('generated_edits_rejected', true, 'Returned files violated the editable-path, import, or source-size contract. Correct the edits.'); }
    // Clear the previous checkpoint source; never retain a page deleted from a selected base.
    // This fixed remote command is run only inside the disposable VM.
    await vm.exec('reset-source', 'find src public tests template tooling -type f -delete');
    for (const [name, bytes] of candidate) { signal.throwIfAborted(); await vm.write(`${REMOTE_ROOT}/${safeRelative(name)}`, bytes); }
    for (const name of ['acceptance.spec.mjs', 'playwright.config.mjs']) await vm.write(`${REMOTE_ROOT}/.harness/${name}`, await fs.readFile(new URL(`../../build-assets/validation/${name}`, import.meta.url)));
    const base = `/s/${input.config.shopId}/`;
    await vm.write(`${REMOTE_ROOT}/.harness/input.json`, JSON.stringify({...input, base}));
    await stage('building');
    await vm.exec('typecheck', 'npm run typecheck'); await vm.exec('lint', 'npm run lint');
    await vm.exec('build', `npm run build -- --base=${base}`);
    await stage('validating');
    await vm.exec('browser', 'npx --no-install playwright test --config=.harness/playwright.config.mjs');
    const collectedSource = await collect(vm, 'source', signal); assertProtected(candidate, collectedSource);
    if (sourceDigest(candidate) !== sourceDigest(collectedSource)) throw new BuildFailure('source_changed_during_build');
    const dist = await collect(vm, 'dist', signal);
    if (canonical(JSON.parse(dist.get('storefront.json')!.toString())) !== canonical(input.config)) throw new BuildFailure('output_configuration_mismatch');
    const files: FileSet = new Map([...dist].map(([name, bytes]) => [`dist/${name}`, bytes]));
    files.set('source.tar.gz', packSource(collectedSource)); files.set('catalog-snapshot.json', jsonBytes(input.products));
    files.set('prompt.json', jsonBytes(prompt)); files.set('model.json', jsonBytes(result)); files.set('build.log', vm.logs());
    for (const name of ['desktop.png', 'mobile.png']) {
      const bytes = await vm.read(`${REMOTE_ROOT}/.harness/${name}`, limits().fileBytes + 1);
      if (bytes.length > limits().fileBytes) throw new BuildFailure('screenshot_limit'); files.set(name, bytes);
    }
    return {files, model: result.model, templateVersion: pin.environment.templateVersion, environmentVersion: pin.environment.checkpointName};
  }
}

async function collect(vm: Machine, kind: 'source' | 'dist', signal: AbortSignal): Promise<FileSet> {
  const root = kind === 'source' ? REMOTE_ROOT : `${REMOTE_ROOT}/dist`, budget = kind === 'source' ? limits().sourceBytes : limits().artifactBytes;
  // Fixed inventory code: lstat rejects links/devices before reading, including directories.
  const program = `import os,stat,json,hashlib\nroot=${JSON.stringify(root)}\nitems=[]\ntotal=0\nfor directory,dirs,files in os.walk(root,followlinks=False):\n if directory==root and ${JSON.stringify(kind)}=='source':\n  dirs[:]=[d for d in dirs if d in ['src','public','tests','template','tooling','vendor']]\n  files=[f for f in files if f in ['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','eslint.config.js','playwright.config.ts','.nvmrc','README.md','.gitignore']]\n for name in dirs+files:\n  p=os.path.join(directory,name)\n  s=os.lstat(p)\n  if stat.S_ISLNK(s.st_mode) or not (stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode)): raise Exception('unsafe artifact')\n for name in files:\n  p=os.path.join(directory,name);s=os.lstat(p)\n  if s.st_nlink!=1 or s.st_size>${limits().fileBytes}: raise Exception('file limit')\n  total+=s.st_size\n  if total>${budget} or len(items)>=2000: raise Exception('artifact limit')\n  items.append({'path':os.path.relpath(p,root),'size':s.st_size,'sha256':hashlib.sha256(open(p,'rb').read()).hexdigest()})\nprint(json.dumps(items))`;
  const result = await vm.exec(`inventory-${kind}`, `python3 -c ${shellQuote(program)}`);
  if (Buffer.byteLength(result.stdout) > 1024 * 1024) throw new BuildFailure('inventory_limit');
  const entries = z.array(z.object({path: z.string(), size: z.number().int().min(0).max(limits().fileBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(2000).parse(JSON.parse(result.stdout));
  if (entries.reduce((sum, entry) => sum + entry.size, 0) > budget) throw new BuildFailure('artifact_limit');
  const files: FileSet = new Map();
  for (const entry of entries) {
    signal.throwIfAborted(); safeRelative(entry.path);
    if (files.has(entry.path) || kind === 'source' && !sourcePath(entry.path)) throw new BuildFailure('unsafe_artifact');
    const bytes = await vm.read(`${root}/${entry.path}`, entry.size + 1);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new BuildFailure('artifact_integrity'); files.set(entry.path, bytes);
  }
  if (kind === 'dist' && (!files.has('index.html') || !files.has('storefront.json'))) throw new BuildFailure('incomplete_output');
  return files;
}
