import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Read-only deployment checks. This script needs no wallet or provider secrets.
const target = JSON.parse(await fs.readFile(new URL('../deployment.json', import.meta.url), 'utf8'));
const {apiOrigin, sellerOrigin} = target;
async function check(name, url, status, options = {}) {
  const response = await fetch(url, {...options, redirect: 'error', signal: AbortSignal.timeout(20000)});
  assert.equal(response.status, status, `${name}: unexpected HTTP status`);
  console.log(`${name}: HTTP ${status}`);
  return response;
}
const health = await check('API readiness', `${apiOrigin}/healthz`, 200);
assert.equal((await health.json()).data.status, 'ok');
assert.equal(health.headers.get('cache-control'), 'no-store');
const preflight = await check('Seller CORS', `${apiOrigin}/api/v1/moderato/shops`, 204, {method: 'OPTIONS', headers: {Origin: sellerOrigin, 'Access-Control-Request-Method': 'GET'}});
assert.equal(preflight.headers.get('access-control-allow-origin'), sellerOrigin);
await check('Missing authentication', `${apiOrigin}/api/v1/moderato/shops`, 401, {headers: {Origin: sellerOrigin}});
const rejected = await check('Untrusted origin', `${apiOrigin}/api/v1/moderato/shops`, 403, {headers: {Origin: 'https://untrusted.example'}});
assert.equal(rejected.headers.get('access-control-allow-origin'), null);
await check('Unsupported network', `${apiOrigin}/api/v1/mainnet/shops`, 400, {headers: {Origin: sellerOrigin}});
const seller = await check('Seller direct route', `${sellerOrigin}/storefronts`, 200);
const html = await seller.text();
assert.match(html, /<div id="root"><\/div>/);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => new URL(match[1], sellerOrigin));
assert.ok(scripts.length, 'Seller HTML must reference its built JavaScript');
let configured = false;
for (const url of scripts) {
  assert.equal(url.origin, sellerOrigin);
  const response = await check('Seller JavaScript', url, 200);
  configured ||= (await response.text()).includes(apiOrigin);
}
assert.ok(configured, 'Seller bundle must contain the hosted builder origin');
if (process.argv.includes('--delivery')) {
  await check('Private preview listener', `${target.variables.BUILDER_PREVIEW_ORIGIN}/healthz`, 200);
  await check('Public shop listener', `${target.variables.BUILDER_PUBLIC_ORIGIN}/healthz`, 200);
  await check('Unknown public shop', `${target.variables.BUILDER_PUBLIC_ORIGIN}/s/00000000-0000-4000-8000-000000000000/`, 404);
}
console.log('Deployment checks passed. Authenticated generation, publication and checkout require merchant acceptance.');
