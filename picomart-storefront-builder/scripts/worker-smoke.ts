import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../src/config.ts';
import {BunnyStorage} from '../src/storage/bunny.ts';
import {Journal} from '../src/storage/journal.ts';
import {GenerationJobSchema, ShopSchema, type BuildAttempt, type GenerationJob, type Revision} from '../src/domain/records.ts';
import {Coordinator} from '../src/worker/coordinator.ts';
import {RailwayProvider} from '../src/worker/provider.ts';
import {GenerationEngine} from '../src/worker/engine.ts';
import {parseInput} from '../src/worker/input.ts';

// Deliberately creates synthetic management records under a fresh private test prefix.
// It does not sign in as the demo seller or write any public zone/published pointer.
const prefix = `builder-phase4-${randomUUID()}`;
const config = loadConfig({...process.env, BUILDER_STORAGE_PREFIX: prefix, MAX_CONCURRENT_BUILDS: '2', MAX_CONCURRENT_BUILDS_PER_SHOP: '1'});
const provider = new RailwayProvider(prefix), store = new BunnyStorage(config.storage);
const journal = await Journal.open(store, prefix);
const baseline = (await provider.inventory()).filter(vm => vm.status !== 'DESTROYED');
console.log(JSON.stringify({event: 'smoke_start', prefix, existingActiveSandboxes: baseline.length}));
const jobIds: string[] = [], events: object[] = [];
const fixture = JSON.parse(await fs.readFile(new URL('../../picomart-storefront-template/public/storefront.json', import.meta.url), 'utf8'));
const catalogFixture = JSON.parse(await fs.readFile(new URL('../../picomart-storefront-template/template/fixtures/pantry.json', import.meta.url), 'utf8'));
for (let index = 0; index < 3; index++) {
  const id = randomUUID(), now = new Date().toISOString();
  const shop = ShopSchema.parse({schemaVersion: 2, kind: 'shop', id, recordVersion: 1, createdAt: now, updatedAt: now, ownerAccountId: '0x1111111111111111111111111111111111111111', network: 'moderato',
    catalogSeed: 'AQEBAQEBAQEBAQEBAQEBAQ', selectedDraftId: null, publishedRevisionId: null, config: {...fixture, shopId: id}});
  const job = GenerationJobSchema.parse({schemaVersion: 2, kind: 'job', id: randomUUID(), recordVersion: 1, createdAt: now, updatedAt: now,
    network: shop.network, ownerAccountId: shop.ownerAccountId, shopId: id, catalogSeed: shop.catalogSeed, config: shop.config, state: 'queued',
    brief: `Give this independent Portuguese pantry a ${['warm terracotta', 'deep green', 'navy blue'][index]} theme and a visibly refreshed editorial home page. Keep current catalog facts and the existing product, search, navigation and buyer handoff behavior.`,
    baseRevisionId: null, attemptIds: [], revisionId: null, currentAttemptId: null, selectionVersion: 1});
  await journal.transact(null, async () => ({changes: [shop, job], result: {status: 201, data: {}}})); jobIds.push(job.id);
}
// This isolated infrastructure smoke uses public fixture products, not a live seller catalog.
const engine = new GenerationEngine(journal, config, async job => parseInput({config: job.config, brief: job.brief, products: catalogFixture.products}));
const worker = new Coordinator(journal, config, provider, engine, Date.now, event => { events.push(event); console.log(JSON.stringify(event)); });
let maxActive = 0, observedWaiting = false;
const started = Date.now(); let failure: unknown;
let interrupted = false;
const stop = () => { interrupted = true; void worker.stop(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  await worker.start();
  while (!interrupted && Date.now() - started < 30 * 60 * 1000) {
    const jobs = journal.list<GenerationJob>('job', () => true), attempts = journal.list<BuildAttempt>('attempt', () => true), active = attempts.filter(attempt => attempt.cleanup !== 'destroyed').length;
    maxActive = Math.max(maxActive, active); if (active === 2 && jobs.some(job => job.state === 'queued')) observedWaiting = true;
    if (jobs.every(job => ['ready', 'failed', 'canceled'].includes(job.state)) && attempts.every(attempt => attempt.finalized)) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
} catch (error) { failure = error; }
finally { await worker.stop(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
const recovered = await Journal.open(store, prefix), attempts = recovered.list<BuildAttempt>('attempt', () => true), jobs = recovered.list<GenerationJob>('job', () => true);
const finalInventory = await provider.inventory(), remaining = finalInventory.filter(vm => vm.status !== 'DESTROYED' && attempts.some(attempt => attempt.sandboxId === vm.id));
const evidence = {checkedAt: new Date().toISOString(), prefix, elapsedMs: Date.now() - started, maxActive, observedWaiting,
  jobs: jobs.map(job => ({id: job.id, state: job.state, revisionId: job.revisionId, errorCode: job.errorCode})), attempts,
  revisionsRecovered: recovered.list<Revision>('revision', () => true).length, remainingOwnedSandboxes: remaining.map(vm => vm.id), events};
await fs.mkdir(new URL('../artifacts/', import.meta.url), {recursive: true});
await fs.writeFile(new URL('../artifacts/worker-smoke.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({event: 'smoke_result', prefix, maxActive, observedWaiting, revisionsRecovered: evidence.revisionsRecovered, remainingOwnedSandboxes: remaining.length, states: jobs.map(job => job.state)}));
if (failure || maxActive !== 2 || !observedWaiting || jobs.some(job => job.state !== 'ready') || remaining.length || evidence.revisionsRecovered !== 3) throw new Error('Worker smoke acceptance failed; inspect private local artifacts/worker-smoke.json');
