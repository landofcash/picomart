import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {BuildAttemptSchema, RevisionManifestSchema} from '../src/domain/records.ts';
import {revisionPath, stageRevision, commitRevision} from '../src/storage/revisions.ts';
import {jsonBytes, sha256} from '../src/storage/bunny.ts';
import {loadConfig} from '../src/config.ts';
import {aliceId, bob, bobId, design, fixture, seed} from './helpers.ts';

async function setup() {
  const f = await fixture();
  const previewServer = f.previews.app().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => previewServer.once('listening', resolve));
  const address = previewServer.address(); if (!address || typeof address === 'string') throw new Error('No preview address');
  f.config.previewOrigin = `http://127.0.0.1:${address.port}`;
  const token = await f.login(), otherToken = await f.login(bobId, bob);
  const shop = (await f.request('/shops', {method: 'POST', token, requestId: randomUUID(), body: {catalogSeed: seed, design}})).body.data;
  async function build(label: string) {
    const current = (await f.request(`/shops/${shop.id}`, {token})).body.data;
    const job = (await f.request(`/shops/${shop.id}/jobs`, {method: 'POST', token, requestId: randomUUID(), body: {expectedShopVersion: current.recordVersion, brief: label}})).body.data;
    const attempt = BuildAttemptSchema.parse({schemaVersion: 2, id: randomUUID(), kind: 'attempt', recordVersion: 1, createdAt: shop.createdAt, updatedAt: shop.updatedAt,
      network: 'moderato', ownerAccountId: aliceId, shopId: shop.id, jobId: job.id, attemptNumber: 1, baseRevisionId: null, sandboxId: 'already-destroyed', state: 'ready', cleanup: 'destroyed',
      deadline: '2026-09-09T14:00:00.000Z', commandRefs: [], cancelRequested: false});
    await f.journal.transact(null, async () => ({changes: [attempt, {...job, recordVersion: 2, state: 'running', attemptIds: [attempt.id]}], result: {status: 200, data: {}}}));
    const base = `/s/${shop.id}/`;
    const files = new Map<string, Uint8Array>([['source.tar.gz', Buffer.from('private source')], ['build.log', Buffer.from('private log')], ['catalog-snapshot.json', jsonBytes([])],
      ['dist/index.html', Buffer.from(`<html><head><script type="module" src="${base}assets/main.js"></script></head><body>${label}</body></html>`)],
      ['dist/assets/main.js', Buffer.from(`const base = "${base}"; import("${base}assets/lazy.js");`)], ['dist/assets/lazy.js', Buffer.from('export default 1;')],
      ['dist/assets/main.css', Buffer.from(`body { background: url(${base}shop-assets/photo.png); }`)], ['dist/shop-assets/photo.png', Buffer.from([1, 2, 3])], ['dist/storefront.json', jsonBytes(shop.config)]]);
    const revision = RevisionManifestSchema.parse({schemaVersion: 2, kind: 'revision', id: randomUUID(), recordVersion: 1, createdAt: shop.createdAt, updatedAt: shop.updatedAt,
      network: 'moderato', ownerAccountId: aliceId, shopId: shop.id, jobId: job.id, attemptId: attempt.id, parentRevisionId: null, state: 'ready',
      templateVersion: '1.1.0', environmentVersion: 'fixture', model: 'fixture', config: shop.config,
      files: [...files].map(([path, bytes]) => ({path, size: bytes.length, sha256: sha256(bytes)})), validation: {typecheck: true, lint: true, build: true, browser: true, cleanup: 'destroyed'}});
    await stageRevision(f.journal, revision, files); await commitRevision(f.journal, revision, () => f.clock.value);
    return revision;
  }
  async function grant(revisionId: string, credential = token) { return f.request(`/shops/${shop.id}/revisions/${revisionId}/preview`, {method: 'POST', token: credential, body: {}}); }
  return {...f, token, otherToken, shop, build, grant, close: async () => { await new Promise<void>((resolve, reject) => previewServer.close(error => error ? reject(error) : resolve())); await f.close(); }};
}

test('private previews pin all pages/assets to a ready revision, rebase compiled references and exclude private files', async () => {
  const f = await setup();
  try {
    const a = await f.build('Design A'), b = await f.build('Design B');
    assert.equal((await f.grant(a.id, f.otherToken)).status, 404);
    assert.equal((await f.grant(randomUUID())).status, 404);
    const grantA = (await f.grant(a.id)).body.data, grantB = (await f.grant(b.id)).body.data;
    const base = new URL(grantA.url).pathname;
    for (const route of ['', 'products', 'products/', `products/${seed}`, 'collections/drinks', 'about']) {
      const response = await fetch(grantA.url + route); assert.equal(response.status, 200, route);
      const html = await response.text(); assert.match(html, /Design A/); assert.ok(html.includes(`${base}assets/main.js`));
      assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.match(response.headers.get('content-security-policy')!, /sandbox allow-scripts/);
      assert.match(response.headers.get('content-security-policy')!, /worker-src 'none'/);
      assert.match(response.headers.get('content-security-policy')!, /connect-src [^;]*https:\/\/cdn\.picomart\.zkbytes\.com/);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    assert.match(await (await fetch(grantB.url)).text(), /Design B/);
    for (const file of ['assets/main.js', 'assets/main.css']) assert.ok((await (await fetch(grantA.url + file)).text()).includes(base));
    assert.deepEqual(await (await fetch(grantA.url + 'storefront.json')).json(), a.config);
    assert.deepEqual(new Uint8Array(await (await fetch(grantA.url + 'shop-assets/photo.png')).arrayBuffer()), new Uint8Array([1, 2, 3]));
    for (const file of ['source.tar.gz', 'build.log', 'catalog-snapshot.json', 'prompt.json', 'assets/missing.js', '%2e%2e%2fsource.tar.gz', '%252e%252e/source.tar.gz']) assert.equal((await fetch(grantA.url + file)).status, 404, file);
    assert.equal((await fetch(grantA.url.replace(f.shop.id, randomUUID()))).status, 404);
    assert.equal((await fetch(`${f.config.previewOrigin}/s/${f.shop.id}/`)).status, 404);
    const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(grantA.url, {headers: {Host: 'seller.example'}}, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(wrongHost, 403);
    assert.equal((await fetch(grantA.url, {method: 'POST'})).status, 405);
    assert.equal((await f.request(`/shops/${f.shop.id}/revisions/${a.id}/dist/index.html`, {token: f.token})).status, 404);
    assert.equal((await fetch(grantA.url, {method: 'HEAD'})).status, 200);
    const artifact = `${revisionPath(f.journal, a)}/dist/index.html`; f.store.files.set(artifact, Buffer.from('corrupted'));
    assert.equal((await fetch(grantA.url)).status, 503);
  } finally { await f.close(); }
});

test('preview grants expire, follow session revocation/key changes and cannot be invented', async () => {
  const f = await setup();
  try {
    const revision = await f.build('Private draft');
    const a = (await f.grant(revision.id)).body.data;
    assert.equal((await fetch(a.url.replace(/\/p\/[^/]+\//, `/p/${'x'.repeat(43)}/`))).status, 401);
    f.clock.value += f.config.previewTtl;
    assert.equal((await fetch(a.url + 'assets/main.js')).status, 401);
    const b = (await f.grant(revision.id)).body.data;
    f.identity.accounts.set(`moderato/${aliceId}`, bob.address.toLowerCase());
    assert.equal((await fetch(b.url)).status, 401);
    f.identity.accounts.set(`moderato/${aliceId}`, f.auth.journal.list<any>('session', session => session.ownerAccountId === aliceId)[0].signerAddress);
    await f.request('/auth/logout', {method: 'POST', token: f.token});
    assert.equal((await fetch(b.url + 'storefront.json')).status, 401);
    assert.equal((await f.grant(revision.id)).status, 401);
  } finally { await f.close(); }
});

test('preview origin configuration rejects application origins and non-local insecure origins', () => {
  assert.throws(() => loadConfig({BUILDER_PREVIEW_ORIGIN: 'http://localhost:5173'}));
  assert.throws(() => loadConfig({BUILDER_PREVIEW_ORIGIN: 'https://app.picomart.zkbytes.com'}));
  assert.throws(() => loadConfig({BUILDER_PREVIEW_ORIGIN: 'https://promo.picomart.zkbytes.com'}));
  assert.throws(() => loadConfig({BUILDER_PREVIEW_ORIGIN: 'http://preview.example'}));
});

test('after coordinator restart a fresh grant serves the recovered private revision and old grants are invalid', async () => {
  const f = await setup();
  let revisionId: string, oldUrl: string;
  try { const revision = await f.build('Durable draft'); revisionId = revision.id; oldUrl = (await f.grant(revisionId)).body.data.url; }
  finally { await f.close(); }
  const recovered = await fixture(f.store, f.identity, f.clock);
  const server = recovered.previews.app().listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing listener');
    recovered.config.previewOrigin = `http://127.0.0.1:${address.port}`;
    const stale = recovered.config.previewOrigin + new URL(oldUrl).pathname;
    assert.equal((await fetch(stale)).status, 401);
    const grant = await recovered.request(`/shops/${f.shop.id}/revisions/${revisionId}/preview`, {method: 'POST', token: f.token, body: {}});
    assert.equal(grant.status, 201);
    assert.match(await (await fetch(grant.body.data.url)).text(), /Durable draft/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await recovered.close(); }
});
