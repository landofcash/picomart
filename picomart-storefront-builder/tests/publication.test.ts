import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {RevisionManifestSchema, type Publication, type Revision, type Shop} from '../src/domain/records.ts';
import {revisionPath} from '../src/storage/revisions.ts';
import {jsonBytes, sha256} from '../src/storage/bunny.ts';
import {selectionPath} from '../src/publishing/delivery.ts';
import {loadConfig} from '../src/config.ts';
import {aliceId, bobId, bob, design, fixture, MemoryStore, seed, otherSeed, TestIdentity} from './helpers.ts';

async function setup(store = new MemoryStore(), publicStore = new MemoryStore(), identity = new TestIdentity()) {
  const f = await fixture(store, identity, undefined, undefined, publicStore), service = f.publications!;
  const faults = {badHttp: false};
  const app = express();
  app.use((_req, res, next) => { if (faults.badHttp) res.status(503).end(); else next(); });
  app.use(service.delivery.app());
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No public listener');
  f.config.publicOrigin = `http://127.0.0.1:${address.port}`;
  const token = await f.login(), otherToken = await f.login(bobId, bob);
  const shop = (await f.request('/shops', {method: 'POST', token, requestId: randomUUID(), body: {catalogSeed: seed, design}})).body.data;
  async function build(label: string, fileName = `main-${label}.js`, targetShop: Shop = shop) {
    const shop = targetShop;
    f.clock.value += 1000;
    const time = new Date(f.clock.value).toISOString(), base = `/s/${shop.id}/`;
    const files = new Map<string, Buffer>([
      ['dist/index.html', Buffer.from(`<html><head><script id="picomart-storefront-config" type="application/json">${JSON.stringify(shop.config)}</script><script type="module" src="${base}assets/${fileName}"></script></head><body>${label}</body></html>`)],
      [`dist/assets/${fileName}`, Buffer.from(`export default '${label}';`)], ['dist/storefront.json', jsonBytes(shop.config)],
      ['source.tar.gz', Buffer.from('private source')], ['build.log', Buffer.from('private logs')], ['catalog-snapshot.json', jsonBytes([])],
    ]);
    const revision = RevisionManifestSchema.parse({schemaVersion: 2, kind: 'revision', id: randomUUID(), recordVersion: 1, createdAt: time, updatedAt: time,
      network: shop.network, ownerAccountId: shop.ownerAccountId, shopId: shop.id, jobId: randomUUID(), attemptId: randomUUID(), parentRevisionId: null, state: 'ready',
      templateVersion: '1.1.0', environmentVersion: 'test', model: 'test', config: shop.config,
      files: [...files].map(([path, bytes]) => ({path, size: bytes.length, sha256: sha256(bytes)})), validation: {typecheck: true, lint: true, build: true, browser: true, cleanup: 'destroyed'}});
    for (const [path, bytes] of files) await f.store.putVerified(`${revisionPath(f.journal, revision)}/${path}`, bytes);
    await f.journal.transact(null, async () => ({changes: [revision], result: {status: 201, data: {}}}));
    return revision;
  }
  const state = () => f.journal.list<Publication>('publication', item => item.shopId === shop.id);
  const publish = (revision: Revision, previous: string | null = null, intent = 'publish', requestId = randomUUID(), credential = token) =>
    f.request(`/shops/${shop.id}/publications`, {method: 'POST', token: credential, requestId, body: {revisionId: revision.id, expectedPublishedRevisionId: previous, intent}});
  async function run(revision: Revision, previous: string | null = null, intent = 'publish') {
    const result = await publish(revision, previous, intent); assert.equal(result.status, 202, JSON.stringify(result.body));
    await service.tick(); return state().find(item => item.id === result.body.data.id)!;
  }
  return {...f, service, shop, token, otherToken, publicStore, faults, build, state, publish, run,
    url: service.delivery.url(shop.id), close: async () => { await service.stop(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await f.close(); }};
}

test('publish A, keep A live during draft B, publish B and roll back with pinned assets and private files excluded', async () => {
  const f = await setup();
  try {
    assert.equal((await fetch(f.url)).status, 404);
    const a = await f.build('A'); assert.equal((await f.run(a)).state, 'completed');
    const b = await f.build('B'); assert.match(await (await fetch(f.url)).text(), /<body>A/);
    assert.equal((await f.run(b, a.id)).state, 'completed');
    for (const route of ['', 'products', `products/${seed}`, 'about', 'collections/drinks']) {
      const response = await fetch(f.url + route); assert.equal(response.status, 200); assert.equal(response.headers.get('x-picomart-revision'), b.id);
      assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(await response.text(), /<body>B/);
      assert.match(response.headers.get('content-security-policy')!, /connect-src [^;]*https:\/\/cdn\.picomart\.zkbytes\.com/);
    }
    const oldAsset = await fetch(f.url + 'assets/main-A.js'); assert.match(await oldAsset.text(), /'A'/); assert.match(oldAsset.headers.get('cache-control')!, /immutable/);
    assert.deepEqual(await (await fetch(f.url + 'storefront.json')).json(), b.config);
    for (const file of ['source.tar.gz', 'build.log', 'catalog-snapshot.json', 'ready.json', 'assets/missing.js', '%2e%2e%2fsource.tar.gz']) assert.equal((await fetch(f.url + file)).status, 404);
    assert.ok([...f.publicStore.files.keys()].every(path => !/source|build\.log|catalog-snapshot|ready\.json|current\.json/.test(path)));
    const response = await fetch(f.url.slice(0, -1), {redirect: 'manual'}); assert.equal(response.status, 308);
    assert.equal((await fetch(f.url, {method: 'HEAD'})).status, 200);
    assert.equal((await fetch(f.url, {method: 'POST'})).status, 405);
    const writes = f.publicStore.files.size;
    assert.equal((await f.run(a, b.id, 'rollback')).state, 'completed');
    assert.equal(f.publicStore.files.size, writes); assert.match(await (await fetch(f.url)).text(), /<body>A/);
    assert.match(await (await fetch(f.url + 'assets/main-B.js')).text(), /'B'/);
    const status = (await f.request(`/shops/${f.shop.id}/publications`, {token: f.token})).body.data;
    assert.equal(status.liveUrl, f.url); assert.equal(status.operations.length, 3);
  } finally { await f.close(); }
});

test('publication authenticates owners, checks optimistic selection, serializes a shop and deduplicates accepted requests', async () => {
  const f = await setup();
  try {
    const a = await f.build('A'), key = randomUUID();
    assert.equal((await f.publish(a, null, 'publish', randomUUID(), f.otherToken)).status, 404);
    assert.equal((await f.publish(a, null, 'rollback')).status, 409);
    const first = await f.publish(a, null, 'publish', key), duplicate = await f.publish(a, null, 'publish', key);
    assert.equal(first.status, 202); assert.equal(duplicate.body.data.id, first.body.data.id);
    assert.equal((await f.publish(a)).status, 409);
    await f.service.tick();
    assert.equal((await f.publish(a, null, 'publish', key)).body.data.id, first.body.data.id);
    const b = await f.build('B'); assert.equal((await f.publish(b)).status, 409);
    assert.equal((await f.publish(b, a.id, 'publish', key)).status, 409);
    assert.equal((await f.request(`/shops/${f.shop.id}/publications`, {token: f.otherToken})).status, 404);
    assert.equal(f.state().length, 1);
  } finally { await f.close(); }
});

test('upload failure preserves A and retry resumes the same publication operation', async () => {
  const f = await setup();
  try {
    const a = await f.build('A'); await f.run(a);
    const b = await f.build('B');
    f.publicStore.beforePut = () => { throw new Error('Disconnected'); };
    const failed = await f.run(b, a.id); assert.equal(failed.state, 'failed');
    assert.match(await (await fetch(f.url)).text(), /<body>A/);
    f.publicStore.beforePut = undefined;
    const key = randomUUID(), retry = () => f.request(`/shops/${f.shop.id}/publications/${failed.id}/retry`, {method: 'POST', token: f.token, requestId: key, body: {}});
    assert.equal((await retry()).body.data.id, failed.id); assert.equal((await retry()).body.data.id, failed.id);
    await f.service.tick(); assert.equal(f.state().length, 2); assert.equal(f.state()[1].state, 'completed');
    assert.match(await (await fetch(f.url)).text(), /<body>B/);
  } finally { await f.close(); }
});

test('route verification failure compensates selection and failed restoration is recovered before another publish', async () => {
  const f = await setup();
  try {
    const a = await f.build('A'); await f.run(a);
    const b = await f.build('B'); f.faults.badHttp = true;
    const failed = await f.run(b, a.id); assert.equal(failed.state, 'failed');
    assert.equal(await f.service.delivery.selection(f.shop.id), a.id);
    f.faults.badHttp = false;
    const c = await f.build('C'); f.faults.badHttp = true;
    f.store.beforePut = (path, bytes) => { if (path === selectionPath(f.journal.prefix, f.shop.id) && JSON.parse(Buffer.from(bytes).toString()).revisionId === a.id) throw new Error('Restore unavailable'); };
    assert.equal((await f.publish(c, a.id)).status, 202); await assert.rejects(f.service.tick());
    assert.equal(f.state().at(-1)!.state, 'restoring'); assert.equal((await f.publish(b, a.id)).status, 409);
    f.store.beforePut = undefined; f.faults.badHttp = false; await f.service.tick();
    assert.equal(f.state().at(-1)!.state, 'failed'); assert.match(await (await fetch(f.url)).text(), /<body>A/);
  } finally { await f.close(); }
});

test('missing artifacts, changed immutable assets and changed wallet ownership cannot replace the live shop', async () => {
  const f = await setup();
  try {
    const a = await f.build('A'); await f.run(a);
    const collision = await f.build('Changed', 'main-A.js'); assert.equal((await f.run(collision, a.id)).errorCode, 'immutable_asset_conflict');
    const incomplete = await f.build('Missing'); f.store.files.delete(`${revisionPath(f.journal, incomplete)}/dist/index.html`);
    assert.equal((await f.run(incomplete, a.id)).errorCode, 'revision_incomplete');
    const b = await f.build('B'); await f.publish(b, a.id);
    f.identity.accounts.set(`moderato/${aliceId}`, bob.address.toLowerCase()); await f.service.tick();
    assert.equal(f.state().at(-1)!.errorCode, 'account_key_changed'); assert.match(await (await fetch(f.url)).text(), /<body>A/);
  } finally { await f.close(); }
});

test('uncertain switching or completion commits reconcile after restart without duplicating publication', async () => {
  for (const interruptState of ['switching', 'completed']) {
    const f = await setup(); let shopId: string, revisionId: string, operationId: string;
    try {
      const a = await f.build('A'); revisionId = a.id; shopId = f.shop.id;
      const result = await f.publish(a); operationId = result.body.data.id;
      f.store.afterPut = path => {
        if (!path.endsWith('/commit.json')) return;
        const operation = JSON.parse(f.store.files.get(path.replace('/commit.json', '/operation.json'))!.toString());
        if (operation.changes.some((record: Publication) => record.kind === 'publication' && record.state === interruptState)) throw new Error('Lost durable commit acknowledgement');
      };
      await assert.rejects(f.service.tick()); assert.equal(f.journal.healthy, false);
    } finally { f.store.afterPut = undefined; await f.close(); }
    const recovered = await setup(f.store, f.publicStore, f.identity);
    try {
      await recovered.service.tick();
      const operation = recovered.journal.get<Publication>('publication', 'moderato', aliceId, operationId)!;
      assert.equal(operation.state, 'completed'); assert.equal(operation.requestedRevisionId, revisionId);
      const url = recovered.service.delivery.url(shopId);
      assert.match(await (await fetch(url)).text(), /<body>A/);
    } finally { await recovered.close(); }
  }
});

test('public origin must be separate from management and preview applications', () => {
  assert.throws(() => loadConfig({BUILDER_PUBLIC_ORIGIN: 'http://localhost:5173'}));
  assert.throws(() => loadConfig({BUILDER_PUBLIC_ORIGIN: 'http://127.0.0.1:4181'}));
  assert.throws(() => loadConfig({BUILDER_PUBLIC_ORIGIN: 'https://app.picomart.zkbytes.com'}));
  assert.equal(loadConfig({BUNNY_PUBLIC_BASE_URL: 'https://fixture.b-cdn.net/'}).publicBaseUrl, 'https://fixture.b-cdn.net');
  assert.throws(() => loadConfig({BUNNY_PUBLIC_BASE_URL: 'https://fixture.b-cdn.net/subpath'}));
});

test('two independently owned shops keep private previews, publications and rollback history isolated', async () => {
  const f = await setup();
  try {
    const otherShop = (await f.request('/shops', {method: 'POST', token: f.otherToken, requestId: randomUUID(), body: {catalogSeed: otherSeed,
      design: {...design, branding: {...design.branding, name: 'Other merchant'}}}})).body.data as Shop;
    const a = await f.build('Alice-A'), b = await f.build('Bob-B', 'main-B.js', otherShop);
    const route = `/shops/${otherShop.id}/publications`;
    const body = {revisionId: b.id, expectedPublishedRevisionId: null, intent: 'publish'};
    assert.equal((await f.publish(a)).status, 202);
    assert.equal((await f.request(route, {method: 'POST', token: f.token, requestId: randomUUID(), body})).status, 404);
    assert.equal((await f.request(route, {method: 'POST', token: f.otherToken, requestId: randomUUID(), body: {...body, revisionId: a.id}})).status, 404);
    assert.equal((await f.request(route, {method: 'POST', token: f.otherToken, requestId: randomUUID(), body})).status, 202);
    await f.service.tick(); await f.service.tick();
    const otherUrl = f.service.delivery.url(otherShop.id);
    assert.match(await (await fetch(f.url)).text(), /Alice-A/);
    assert.match(await (await fetch(otherUrl)).text(), /Bob-B/);
    assert.deepEqual(await (await fetch(otherUrl + 'storefront.json')).json(), otherShop.config);
    assert.equal((await fetch(f.url + 'assets/main-B.js')).status, 404);
    assert.equal((await f.request(`/shops/${otherShop.id}/revisions/${b.id}/preview`, {method: 'POST', token: f.token, body: {}})).status, 404);
    assert.equal((await f.request(`/shops/${otherShop.id}/revisions/${b.id}/preview`, {method: 'POST', token: f.otherToken, body: {}})).status, 201);
    const newer = await f.build('Alice-new'); await f.run(newer, a.id); await f.run(a, newer.id, 'rollback');
    assert.match(await (await fetch(otherUrl)).text(), /Bob-B/);
    const history = (await f.request(route, {token: f.otherToken})).body.data;
    assert.equal(history.operations.length, 1); assert.equal(history.operations[0].requestedRevisionId, b.id);
  } finally { await f.close(); }
});
