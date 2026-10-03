import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BuildAttemptSchema, RevisionManifestSchema, type Revision} from '../src/domain/records.ts';
import {saveRevision} from '../src/storage/revisions.ts';
import {sha256, jsonBytes} from '../src/storage/bunny.ts';
import {Journal} from '../src/storage/journal.ts';
import {aliceId, design, fixture, seed} from './helpers.ts';

test('partial artifact writes never appear as ready; completed revisions are immutable and private', async () => {
  const f = await fixture();
  try {
    const token = await f.login();
    const shop = (await f.request('/shops', {method: 'POST', token, requestId: randomUUID(), body: {catalogSeed: seed, design}})).body.data;
    const job = (await f.request(`/shops/${shop.id}/jobs`, {method: 'POST', token, requestId: randomUUID(), body: {expectedShopVersion: 1, brief: 'Build'}})).body.data;
    const attempt = BuildAttemptSchema.parse({schemaVersion: 2, id: randomUUID(), kind: 'attempt', recordVersion: 1, createdAt: shop.createdAt, updatedAt: shop.updatedAt,
      network: 'moderato', ownerAccountId: aliceId, shopId: shop.id, jobId: job.id, attemptNumber: 1, baseRevisionId: null, sandboxId: 'test-vm', state: 'ready', cleanup: 'destroyed',
      deadline: '2026-09-09T14:00:00.000Z', commandRefs: ['typecheck', 'lint', 'build', 'browser'], cancelRequested: false});
    await f.journal.transact(null, async () => ({changes: [attempt, {...job, recordVersion: 2, state: 'running', attemptIds: [attempt.id]}], result: {status: 200, data: {}}}));
    const files = new Map<string, Uint8Array>([['source.tar.gz', Buffer.from('trusted-worker-fixture')], ['catalog-snapshot.json', jsonBytes([])], ['dist/index.html', Buffer.from('<html></html>')], ['dist/storefront.json', jsonBytes(shop.config)]]);
    const revision = RevisionManifestSchema.parse({schemaVersion: 2, kind: 'revision', id: randomUUID(), recordVersion: 1, createdAt: shop.createdAt, updatedAt: shop.updatedAt,
      network: 'moderato', ownerAccountId: aliceId, shopId: shop.id, jobId: job.id, attemptId: attempt.id, parentRevisionId: null, state: 'ready',
      templateVersion: '1.1.0', environmentVersion: 'test-clean-checkpoint', model: 'test-model', config: shop.config,
      files: [...files].map(([path, bytes]) => ({path, size: bytes.length, sha256: sha256(bytes)})), validation: {typecheck: true, lint: true, build: true, browser: true, cleanup: 'destroyed'}});
    f.store.beforePut = path => { if (path.endsWith('/dist/index.html')) throw new Error('Interrupted artifact upload'); };
    await assert.rejects(saveRevision(f.journal, revision, files), /Interrupted/);
    let recovered = await Journal.open(f.store, 'test-builder');
    assert.equal(recovered.list<Revision>('revision', () => true).length, 0);
    assert.equal((await f.request(`/shops/${shop.id}/revisions`, {token})).body.data.length, 0);
    f.store.beforePut = undefined;
    await saveRevision(recovered, revision, files);
    recovered = await Journal.open(f.store, 'test-builder');
    assert.equal(recovered.list<Revision>('revision', () => true).length, 1);
    await assert.rejects(saveRevision(recovered, revision, files), {code: 'revision_already_complete'});
    assert.ok([...f.store.files.keys()].some(path => path.includes(`/moderato/${aliceId}/shops/${shop.id}/revisions/${revision.id}/source.tar.gz`)));
    const damaged = new Map(files); damaged.set('dist/index.html', Buffer.from('modified'));
    await assert.rejects(saveRevision(recovered, {...revision, id: randomUUID()}, damaged), /mismatch/);
  } finally { await f.close(); }
});
