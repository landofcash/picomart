import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Journal, receipt} from '../src/storage/journal.ts';
import {ShopSchema, type Shop} from '../src/domain/records.ts';
import {MemoryStore, aliceId, design, seed} from './helpers.ts';

function shop() {
  const id = randomUUID(), now = '2026-09-09T13:00:00.000Z';
  return ShopSchema.parse({schemaVersion: 2, kind: 'shop', id, recordVersion: 1, network: 'moderato', ownerAccountId: aliceId, createdAt: now, updatedAt: now,
    catalogSeed: seed, selectedDraftId: null, publishedRevisionId: null, config: {...design, schemaVersion: 2, network: 'moderato', shopId: id, catalogSeed: seed}});
}
test('lost commit response recovers once with the original retry receipt; writing stops until recovery', async () => {
  const storage = new MemoryStore(), initial = shop(), request = receipt(`moderato/${aliceId}`, randomUUID(), 'create', {seed});
  let journal = await Journal.open(storage, 'trial');
  storage.afterPut = path => { if (path.endsWith('/commit.json')) throw new Error('Lost acknowledgment'); };
  await assert.rejects(journal.transact(request, async () => ({changes: [initial], result: {status: 201, data: initial}})), {code: 'storage_recovery_required'});
  assert.equal(journal.healthy, false);
  await assert.rejects(journal.transact(null, async () => { throw new Error('Must not execute'); }), {code: 'storage_recovery_required'});
  storage.afterPut = undefined;
  journal = await Journal.open(storage, 'trial');
  assert.equal(journal.get<Shop>('shop', 'moderato', aliceId, initial.id)?.id, initial.id);
  const replay = await journal.transact(request, async () => { throw new Error('Already persisted'); });
  assert.deepEqual(replay.data, initial);
  assert.equal(journal.list<Shop>('shop', () => true).length, 1);
});

test('uncommitted partial operation is ignored; previous versions and later retry survive restart', async () => {
  const storage = new MemoryStore(), initial = shop();
  let journal = await Journal.open(storage, 'trial');
  await journal.transact(null, async () => ({changes: [initial], result: {status: 201, data: initial}}));
  storage.beforePut = (path, bytes) => {
    if (path.endsWith('/operation.json')) { storage.files.set(path, Buffer.from(bytes.subarray(0, 70))); throw new Error('Interrupted upload'); }
  };
  const next = {...initial, recordVersion: 2, updatedAt: '2026-09-09T13:01:00.000Z', config: {...initial.config, branding: {...initial.config.branding, name: 'Next'}}};
  await assert.rejects(journal.transact(null, async () => ({changes: [next], result: {status: 200, data: next}})));
  storage.beforePut = undefined;
  journal = await Journal.open(storage, 'trial');
  assert.equal(journal.get<Shop>('shop', 'moderato', aliceId, initial.id)?.config.branding.name, initial.config.branding.name);
  await journal.transact(null, async () => ({changes: [next], result: {status: 200, data: next}}));
  journal = await Journal.open(storage, 'trial');
  assert.equal(journal.get<Shop>('shop', 'moderato', aliceId, initial.id)?.recordVersion, 2);
});

test('committed corruption and conflicting writers fail closed; no silent rollback of accepted work', async () => {
  const storage = new MemoryStore(), initial = shop(), journal = await Journal.open(storage, 'trial');
  await journal.transact(null, async () => ({changes: [initial], result: {status: 201, data: initial}}));
  const path = [...storage.files.keys()].find(path => path.endsWith('/operation.json'))!, original = storage.files.get(path)!;
  storage.files.set(path, Buffer.from('{}'));
  await assert.rejects(Journal.open(storage, 'trial'), /integrity failure/);
  storage.files.set(path, original);
  const conflictingPath = path.replace(/-[a-f0-9-]{36}\//, `-${randomUUID()}/`);
  storage.files.set(conflictingPath, original);
  await assert.rejects(Journal.open(storage, 'trial'), /Conflicting coordinator sequence/);
});

test('version validation and bounded scheduling reject invalid work before storage mutation', async () => {
  const storage = new MemoryStore(), initial = shop(), journal = await Journal.open(storage, 'trial', 100, 1);
  let release: () => void = () => {};
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const pending = journal.transact(null, async () => { await blocked; return {changes: [initial], result: {status: 201, data: initial}}; });
  await assert.rejects(journal.transact(null, async () => { throw new Error('Queue limit'); }), {code: 'coordinator_busy'});
  release(); await pending;
  const count = storage.files.size;
  await assert.rejects(journal.transact(null, async () => ({changes: [{...initial, recordVersion: 3}], result: {status: 200, data: {}}})), /record version/);
  assert.equal(storage.files.size, count);
  assert.equal(journal.healthy, true);
});
