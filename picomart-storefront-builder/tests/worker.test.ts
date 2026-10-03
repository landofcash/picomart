import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../src/config.ts';
import {BuildAttemptSchema, GenerationJobSchema, ShopSchema, type BuildAttempt, type GenerationJob, type Revision, type Shop} from '../src/domain/records.ts';
import {Journal} from '../src/storage/journal.ts';
import {jsonBytes, sha256} from '../src/storage/bunny.ts';
import {Coordinator} from '../src/worker/coordinator.ts';
import {BuildFailure, type Machine, type Provider, type VirtualMachine} from '../src/worker/provider.ts';
import type {BuildResult, Engine, Pinned} from '../src/worker/engine.ts';
import {commitRevision} from '../src/storage/revisions.ts';
import {MemoryStore, aliceId, design, seed, fixture, bobId, bob} from './helpers.ts';

async function until(condition: () => boolean) { const end = Date.now() + 5000; while (!condition()) { if (Date.now() > end) throw new Error('Test condition timed out'); await new Promise(resolve => setImmediate(resolve)); } }
class FakeProvider implements Provider {
  owner = 'a'.repeat(64); vms = new Map<string, VirtualMachine & {attemptId: string; owner: string}>(); created: BuildAttempt[] = []; destroyed: string[] = [];
  cleanupBlocked = false; loseAllocation = false;
  async inventory() { return [...this.vms.values()]; }
  async identify(vm: VirtualMachine) { const item = this.vms.get(vm.id)!; return {owner: item.owner, attemptId: item.attemptId}; }
  async create(attempt: BuildAttempt, _checkpoint: string, _signal: AbortSignal, allocated: (id: string) => Promise<void>): Promise<Machine> {
    const id = randomUUID(); this.created.push(attempt); this.vms.set(id, {id, status: 'RUNNING', createdAt: attempt.createdAt, attemptId: attempt.id, owner: this.owner});
    if (this.loseAllocation) throw new Error('Lost creation response');
    await allocated(id);
    return {id, exec: async () => ({stdout: '', stderr: ''}), write: async () => {}, read: async () => Buffer.alloc(0), logs: () => Buffer.from('private log')};
  }
  async destroy(id: string) { this.destroyed.push(id); if (this.cleanupBlocked) return false; const vm = this.vms.get(id); if (vm) vm.status = 'DESTROYED'; return true; }
}
const fakePin = (job: GenerationJob): Pinned => ({engineVersion: 2, input: {config: job.config, products: [], brief: job.brief}, source: '', sourceDigest: 'b'.repeat(64),
  environment: {environmentId: randomUUID(), checkpointName: 'clean-v1', templateVersion: '1.1.0', sourceDigest: 'b'.repeat(64), sdkVersion: '3.11.0'},
  model: {model: 'test-model', seconds: 240, maxTokens: 16000}, prompt: {instructions: 'Pinned prompt', input: {}},
  limits: {commandSeconds: 600, sourceBytes: 10485760, artifactBytes: 52428800, fileBytes: 5242880, logBytes: 4194304}});
class FakeEngine implements Engine {
  gates = new Map<string, {resolve: () => void; reject: (error: Error) => void}>(); pins = 0; inputs: Pinned[] = []; ignoreCancel = false;
  async pin(job: GenerationJob) { this.pins++; return fakePin(job); }
  async run(job: GenerationJob, pin: Pinned, vm: Machine, signal: AbortSignal, stage: (state: GenerationJob['state']) => Promise<void>): Promise<BuildResult> {
    this.inputs.push(pin); await stage('generating');
    await new Promise<void>((resolve, reject) => { this.gates.set(vm.id, {resolve, reject}); if (!this.ignoreCancel) signal.addEventListener('abort', () => reject(signal.reason), {once: true}); });
    await stage('building'); await stage('validating');
    return {files: new Map([['source.tar.gz', Buffer.from('trusted engine fixture')], ['catalog-snapshot.json', jsonBytes([])], ['dist/index.html', Buffer.from('<html>draft</html>')], ['dist/storefront.json', jsonBytes(job.config)]]), model: 'test-model', templateVersion: '1.1.0', environmentVersion: 'clean-v1'};
  }
}
async function setup(global = 2, perShop = 1) {
  const store = new MemoryStore(), journal = await Journal.open(store, 'worker-test');
  const clock = {value: Date.parse('2026-09-09T20:00:00Z')}, provider = new FakeProvider(), engine = new FakeEngine();
  const config = loadConfig({MAX_CONCURRENT_BUILDS: String(global), MAX_CONCURRENT_BUILDS_PER_SHOP: String(perShop)});
  const worker = new Coordinator(journal, config, provider, engine, () => clock.value, () => {});
  const jobs = () => journal.list<GenerationJob>('job', () => true), attempts = () => journal.list<BuildAttempt>('attempt', () => true);
  async function shop() {
    const id = randomUUID(), now = new Date(clock.value++).toISOString();
    const value = ShopSchema.parse({schemaVersion: 2, kind: 'shop', id, recordVersion: 1, network: 'moderato', ownerAccountId: aliceId, createdAt: now, updatedAt: now,
      catalogSeed: seed, config: {...design, schemaVersion: 2, shopId: id, network: 'moderato', catalogSeed: seed}, selectedDraftId: null, publishedRevisionId: null});
    await journal.transact(null, async () => ({changes: [value], result: {status: 201, data: {}}})); return value;
  }
  async function submit(shop: Shop) {
    const current = journal.get<Shop>('shop', shop.network, shop.ownerAccountId, shop.id)!, now = new Date(clock.value++).toISOString();
    const job = GenerationJobSchema.parse({schemaVersion: 2, kind: 'job', id: randomUUID(), recordVersion: 1, createdAt: now, updatedAt: now, network: shop.network, ownerAccountId: shop.ownerAccountId,
      shopId: shop.id, catalogSeed: seed, config: shop.config, brief: 'Design a shop', baseRevisionId: null, state: 'queued', attemptIds: [], revisionId: null, selectionVersion: current.recordVersion + 1});
    await journal.transact(null, async () => ({changes: [job, {...current, recordVersion: current.recordVersion + 1, updatedAt: now}], result: {status: 202, data: {}}})); return job;
  }
  const finish = async (job: GenerationJob) => {
    const attempt = attempts().filter(attempt => attempt.jobId === job.id).at(-1)!;
    await until(() => engine.gates.has(attempts().find(value => value.id === attempt.id)?.sandboxId ?? ''));
    engine.gates.get(attempts().find(value => value.id === attempt.id)!.sandboxId!)!.resolve();
    await until(() => attempts().find(value => value.id === attempt.id)!.finalized === true); await new Promise(resolve => setImmediate(resolve));
  };
  return {store, journal, clock, provider, engine, config, worker, jobs, attempts, shop, submit, finish};
}

test('oldest eligible scheduling skips a blocked shop; slots include cleanup and capacity is configurable', async () => {
  for (const capacity of [1, 2, 3]) {
    const f = await setup(capacity);
    try {
      const a = await f.shop(), b = await f.shop(), c = await f.shop();
      const first = await f.submit(a), secondSameShop = await f.submit(a), secondShop = await f.submit(b), thirdShop = await f.submit(c);
      await f.worker.start(false); await until(() => f.provider.created.length === capacity);
      assert.deepEqual(f.provider.created.map(attempt => attempt.jobId), [first.id, secondShop.id, thirdShop.id].slice(0, capacity));
      f.provider.cleanupBlocked = true;
      await until(() => f.engine.gates.has(f.attempts()[0].sandboxId!)); f.engine.gates.get(f.attempts()[0].sandboxId!)!.resolve();
      await until(() => f.attempts()[0].cleanup === 'failed'); await f.worker.tick();
      assert.equal(f.provider.created.length, capacity); assert.equal(f.worker.metrics().activeAttempts, capacity);
      assert.equal(f.jobs().find(job => job.id === first.id)!.state, 'uploading');
      f.provider.cleanupBlocked = false; f.clock.value += 61000; await f.worker.tick();
      await until(() => f.provider.created.length === capacity + 1);
      assert.equal(f.provider.created.at(-1)!.jobId, secondSameShop.id);
    } finally { await f.worker.stop(); }
  }
});

test('parallel jobs retain their snapshots and an older completion cannot replace a newer draft', async () => {
  const f = await setup(2, 2);
  try {
    const shop = await f.shop(), old = await f.submit(shop), newer = await f.submit(shop);
    await f.worker.start(false); await until(() => f.provider.created.length === 2);
    await f.finish(newer); const selected = f.journal.get<Shop>('shop', shop.network, shop.ownerAccountId, shop.id)!.selectedDraftId;
    await f.finish(old);
    assert.equal(f.journal.get<Shop>('shop', shop.network, shop.ownerAccountId, shop.id)!.selectedDraftId, selected);
    assert.equal(f.journal.get<Shop>('shop', shop.network, shop.ownerAccountId, shop.id)!.publishedRevisionId, null);
    assert.equal(f.journal.list<Revision>('revision', () => true).length, 2);
    assert.equal(f.attempts().every(attempt => attempt.cleanup === 'destroyed'), true);
  } finally { await f.worker.stop(); }
});

test('validation repair uses one new VM and the same pinned input, then stops at its attempt budget', async () => {
  const f = await setup(1);
  try {
    const job = await f.submit(await f.shop()); await f.worker.start(false);
    for (let index = 0; index < 2; index++) {
      await until(() => f.engine.gates.size === index + 1);
      [...f.engine.gates.values()][index].reject(new BuildFailure('check_typecheck_failed', true, 'Fix the type error'));
      await until(() => f.attempts()[index].finalized === true); await new Promise(resolve => setImmediate(resolve)); await f.worker.tick();
    }
    assert.equal(f.provider.created.length, 2); assert.notEqual(f.attempts()[0].sandboxId, f.attempts()[1].sandboxId);
    assert.equal(f.engine.pins, 1); assert.deepEqual(f.engine.inputs[0], f.engine.inputs[1]);
    assert.equal(f.jobs().find(value => value.id === job.id)!.state, 'failed');
  } finally { await f.worker.stop(); }
});

test('upload failure and attempt timeout clean the VM and never create a revision', async () => {
  for (const mode of ['upload', 'timeout']) {
    const f = await setup();
    try {
      const job = await f.submit(await f.shop()); await f.worker.start(false); await until(() => f.engine.gates.size === 1);
      if (mode === 'upload') { f.store.beforePut = path => { if (path.endsWith('/dist/index.html')) throw new Error('Interrupted upload'); }; [...f.engine.gates.values()][0].resolve(); }
      else { f.clock.value += f.config.attemptMs; await f.worker.tick(); }
      await until(() => f.attempts()[0].finalized === true);
      assert.equal(f.jobs().find(value => value.id === job.id)!.state, 'failed'); assert.equal(f.attempts()[0].cleanup, 'destroyed');
      assert.equal(f.journal.list<Revision>('revision', () => true).length, 0);
    } finally { await f.worker.stop(); }
  }
});

test('lost sandbox allocation is recovered from its atomic marker; unrelated VMs are untouched', async () => {
  const f = await setup();
  try {
    f.provider.loseAllocation = true;
    const unrelated = randomUUID(); f.provider.vms.set(unrelated, {id: unrelated, status: 'RUNNING', createdAt: new Date(f.clock.value).toISOString(), attemptId: randomUUID(), owner: 'other-builder'});
    await f.submit(await f.shop()); await f.worker.start(false); await until(() => f.attempts()[0]?.finalized === true);
    assert.equal(f.attempts()[0].cleanup, 'destroyed'); assert.ok(f.attempts()[0].sandboxId); assert.equal(f.provider.destroyed.includes(unrelated), false);
  } finally { await f.worker.stop(); }
});

test('restart completes a fully staged draft only after recovered cleanup, even with a reduced limit', async () => {
  const f = await setup(2); let recovered: Coordinator | undefined;
  try {
    const one = await f.submit(await f.shop()), two = await f.submit(await f.shop()), waiting = await f.submit(await f.shop());
    f.provider.cleanupBlocked = true; await f.worker.start(false); await until(() => f.engine.gates.size === 2);
    for (const gate of f.engine.gates.values()) gate.resolve(); await until(() => f.attempts().every(attempt => attempt.cleanup === 'failed'));
    await f.worker.stop();
    const journal = await Journal.open(f.store, 'worker-test'), config = {...f.config, maxConcurrentBuilds: 1};
    recovered = new Coordinator(journal, config, f.provider, f.engine, () => f.clock.value, () => {});
    await recovered.start(false); assert.equal(f.provider.created.length, 2); assert.equal(recovered.metrics().activeAttempts, 2);
    f.provider.cleanupBlocked = false; f.clock.value += 61000; await recovered.tick(); await until(() => f.provider.created.length === 3);
    for (const job of [one, two]) assert.equal(journal.get<GenerationJob>('job', job.network, job.ownerAccountId, job.id)!.state, 'ready');
    assert.equal(f.provider.created.at(-1)!.jobId, waiting.id);
  } finally { await recovered?.stop(); await f.worker.stop(); }
});

test('startup fences interrupted work, reuses pinned input, and rejects obsolete completion', async () => {
  const f = await setup(); let recovered: Coordinator | undefined;
  try {
    const job = await f.submit(await f.shop());
    const now = new Date(f.clock.value).toISOString(), id = randomUUID();
    const attempt = BuildAttemptSchema.parse({schemaVersion: 2, kind: 'attempt', id, recordVersion: 1, createdAt: now, updatedAt: now, network: job.network, ownerAccountId: job.ownerAccountId,
      jobId: job.id, shopId: job.shopId, attemptNumber: 1, baseRevisionId: null, sandboxId: null, creationRequestedAt: now, state: 'running', cleanup: 'pending', deadline: new Date(f.clock.value + 1800000).toISOString(), commandRefs: ['remote-session'], cancelRequested: false});
    const pin = jsonBytes(fakePin(job)), hash = sha256(pin); await f.store.putVerified(`worker-test/inputs/${hash}.json`, pin);
    await f.journal.transact(null, async () => ({changes: [attempt, {...job, recordVersion: 2, state: 'building', inputHash: hash, currentAttemptId: id, attemptIds: [id]}], result: {status: 200, data: {}}}));
    const vmId = randomUUID(); f.provider.vms.set(vmId, {id: vmId, status: 'RUNNING', createdAt: now, attemptId: id, owner: f.provider.owner});
    const journal = await Journal.open(f.store, 'worker-test'); recovered = new Coordinator(journal, f.config, f.provider, f.engine, () => f.clock.value, () => {});
    await recovered.start(false); await until(() => f.provider.created.length === 1);
    assert.equal(f.provider.vms.get(vmId)!.status, 'DESTROYED'); assert.equal(f.engine.pins, 0);
    assert.equal(journal.get<GenerationJob>('job', job.network, job.ownerAccountId, job.id)!.attemptIds.length, 2);
    const stale = {schemaVersion: 2, kind: 'revision', id: randomUUID(), recordVersion: 1, createdAt: now, updatedAt: now, network: job.network, ownerAccountId: job.ownerAccountId,
      jobId: job.id, shopId: job.shopId, attemptId: id, parentRevisionId: null, state: 'ready', templateVersion: '1.1.0', environmentVersion: 'old', model: 'old', config: job.config,
      files: [{path: 'dist/index.html', size: 0, sha256: sha256('')}], validation: {typecheck: true, lint: true, build: true, browser: true, cleanup: 'destroyed'}};
    await assert.rejects(commitRevision(journal, stale as Revision), /approved build attempt/);
  } finally { await recovered?.stop(); }
});

test('owner-only cancellation is durable and idempotent; attempt metadata omits private feedback', async () => {
  const f = await fixture();
  try {
    const token = await f.login(), other = await f.login(bobId, bob);
    const shop = (await f.request('/shops', {method: 'POST', token, requestId: randomUUID(), body: {catalogSeed: seed, design}})).body.data;
    const job = (await f.request(`/shops/${shop.id}/jobs`, {method: 'POST', token, requestId: randomUUID(), body: {expectedShopVersion: 1, brief: 'New design'}})).body.data;
    const attempt = BuildAttemptSchema.parse({schemaVersion: 2, kind: 'attempt', id: randomUUID(), recordVersion: 1, createdAt: shop.createdAt, updatedAt: shop.updatedAt,
      network: 'moderato', ownerAccountId: aliceId, shopId: shop.id, jobId: job.id, attemptNumber: 1, baseRevisionId: null, sandboxId: null, state: 'running', cleanup: 'pending',
      deadline: new Date(f.clock.value + 1800000).toISOString(), commandRefs: [], cancelRequested: false, feedback: 'Private raw compiler log'});
    await f.journal.transact(null, async () => ({changes: [attempt, {...job, recordVersion: 2, state: 'generating', currentAttemptId: attempt.id, attemptIds: [attempt.id]}], result: {status: 200, data: {}}}));
    const metadata = await f.request(`/shops/${shop.id}/jobs/${job.id}/attempts`, {token});
    assert.equal(metadata.body.data[0].id, attempt.id); assert.equal('feedback' in metadata.body.data[0], false);
    const path = `/shops/${shop.id}/jobs/${job.id}/cancel`, options = {method: 'POST', token, requestId: randomUUID(), body: {}};
    assert.equal((await f.request(path, {...options, token: other})).status, 404);
    assert.equal((await f.request(path, options)).body.data.state, 'canceled'); assert.equal((await f.request(path, options)).status, 202);
    assert.equal((await f.request(`/shops/${shop.id}/jobs/${job.id}/attempts`, {token: other})).status, 404);
    const journal = await Journal.open(f.store, 'test-builder'); assert.equal(journal.get<GenerationJob>('job', 'moderato', aliceId, job.id)!.cancelRequested, true);
  } finally { await f.close(); }
});

test('cancellation during generation fences even a late model result and prevents revision selection', async () => {
  const f = await setup();
  try {
    f.engine.ignoreCancel = true; const job = await f.submit(await f.shop()); await f.worker.start(false); await until(() => f.engine.gates.size === 1);
    await f.journal.transact(null, async () => {
      const current = f.jobs()[0]; return {changes: [{...current, recordVersion: current.recordVersion + 1, updatedAt: new Date(f.clock.value).toISOString(), cancelRequested: true, state: 'canceled'}], result: {status: 202, data: {}}};
    });
    await f.worker.tick(); [...f.engine.gates.values()][0].resolve(); await until(() => f.attempts()[0].finalized === true);
    assert.equal(f.jobs().find(value => value.id === job.id)!.state, 'canceled'); assert.equal(f.attempts()[0].cleanup, 'destroyed');
    assert.equal(f.journal.list<Revision>('revision', () => true).length, 0);
  } finally { await f.worker.stop(); }
});

test('metadata write uncertainty stops the worker and destroys the already allocated VM', async () => {
  const f = await setup();
  try {
    await f.submit(await f.shop()); await f.worker.start(false); await until(() => f.engine.gates.size === 1);
    f.store.afterPut = path => { if (path.endsWith('/commit.json')) throw new Error('Lost commit acknowledgment'); };
    [...f.engine.gates.values()][0].resolve(); await until(() => !f.journal.healthy); await f.worker.stop();
    assert.equal([...f.provider.vms.values()][0].status, 'DESTROYED');
    f.store.afterPut = undefined;
    const journal = await Journal.open(f.store, 'worker-test'); assert.equal(journal.list<Revision>('revision', () => true).length, 0);
  } finally { await f.worker.stop(); }
});
