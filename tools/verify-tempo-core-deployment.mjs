// Read-only sync checks; website POST checks verify that static serving rejects writes.
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
if (!args.length || args.length % 2) throw new Error('Usage: node tools/verify-tempo-core-deployment.mjs --website URL [--website URL] [--sync URL]');
for (let i = 0; i < args.length; i += 2) {
  const [kind, raw] = args.slice(i, i + 2);
  if (!['--website', '--sync'].includes(kind)) throw new Error('Unknown target type');
  const base = new URL(raw);
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Provide a bare service origin');
  const request = (path, options = {}) => fetch(new URL(path, base), {
    redirect: 'manual', signal: AbortSignal.timeout(15000), ...options,
  });
  if (kind === '--sync') {
    const response = await request('/');
    assert.ok([200, 503].includes(response.status));
    const body = await response.json();
    assert.equal(body.data.chainId, 42431);
    assert.equal(body.data.address, '0x3c91183f0454eab6eff6f570ac402be278dbd6f4');
    assert.equal(response.status === 200, body.data.ready);
    assert.equal((await request('/api/v1/mainnet/catalogs')).status, 410);
    console.log(base.origin + ': sync scope verified; ready=' + body.data.ready);
    continue;
  }
  assert.equal((await request('/healthz')).status, 200);
  const root = await request('/', {headers: {accept: 'text/html'}});
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type'), /^text\/html/);
  assert.equal(root.headers.get('cache-control'), 'no-cache');
  assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
  const html = await root.text();
  for (const route of ['/orders', '/agent-orders/approve', '/storefronts', '/#'+ 'A'.repeat(22) + '2']) {
    const page = await request(route, {headers: {accept: 'text/html'}});
    assert.equal(page.status, 200);
    assert.equal(await page.text(), html);
  }
  const head = await request('/orders', {method: 'HEAD', headers: {accept: 'text/html'}});
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(html));
  assert.equal(await head.text(), '');
  const assetPath = html.match(/(?:src|href)="([^"]*\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(assetPath, 'Built JS entry missing');
  const asset = await request(assetPath);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /^text\/javascript/);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.ok((await asset.text()).length > 0);
  for (const path of ['/assets/missing.js', '/missing.png', '/api/not-a-route', '/.env', '/package.json',
    '/%2e%2e%2fpackage.json', '/%5c..%5cpackage.json']) {
    assert.equal((await request(path, {headers: {accept: 'text/html'}})).status, 404, path);
  }
  assert.equal((await request('/orders', {headers: {accept: 'application/json'}})).status, 404);
  const malformed = await request('/bad%ZZ');
  // Railway's edge rejects invalid URL escapes before the static server;
  // direct server checks still require the application's HTTP 400 response.
  if (malformed.status === 502 && /^railway-/.test(malformed.headers.get('server') || '')) {
    assert.equal((await malformed.text()).trim(), 'upstream error');
    console.log(base.origin + ': malformed URL rejected by Railway edge');
  } else assert.equal(malformed.status, 400);
  assert.equal((await request('/', {method: 'POST'})).status, 405);
  for (const path of ['/sw.js', '/manifest.webmanifest']) {
    const response = await request(path);
    if (response.status === 200) assert.equal(response.headers.get('cache-control'), 'no-cache');
    else assert.equal(response.status, 404);
  }
  console.log(base.origin + ': website health, SPA links, HEAD, asset MIME/cache and path isolation passed');
}
