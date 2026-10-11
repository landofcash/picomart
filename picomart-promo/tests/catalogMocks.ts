import {tempoSeedToId,createTempoReceivingContext,createTempoReceivingIdentity} from '@picomart/order-protocol/tempo-protocol';
import type {Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import pantry from './fixtures/pantry.json' with {type: 'json'};

export {pantry};
export const seller='0x'+'11'.repeat(20);
export const deliveryOptionsUrl=`https://cdn.picomart.zkbytes.com/moderato/v1/${seller}/delivery-options/${'aa'.repeat(32)}.json`;
export async function mockCatalog(page: Page, options: {seed?: string; getProducts?: () => unknown; getCatalog?: () => unknown; failMetadata?: () => boolean} = {}) {
  let metadataRequests = 0;
  const revisions = new Map<string, string>();
  const seed = options.seed || pantry.catalogSeed;
  await page.route('https://sync.picomart.zkbytes.com/api/v1/moderato/catalogs/**', route => {
    metadataRequests++;
    if (!route.request().url().endsWith('/' + seed)) return route.fulfill({status: 404, json: {success: false}});
    if (options.failMetadata?.()) return route.fulfill({status: 503, json: {success: false}});
    const body=JSON.stringify(options.getCatalog?.() ?? {version:2,deliveryOptionsUrl,products:options.getProducts?.() ?? pantry.products});
    const digest=createHash('sha256').update(body).digest('hex');
    const catalogUrl=`https://cdn.picomart.zkbytes.com/moderato/v1/${seller}/catalogs/${digest}.json`;
    revisions.set(catalogUrl, body);
    const key='0x'+'05'.repeat(32),deployment='0x3c91183f0454eab6eff6f570ac402be278dbd6f4';
    const identity=createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:42431,contractAddress:deployment,role:'seller',account:seller,catalogSeed:seed}),Buffer.from(key.slice(2),'hex').toString('base64'));
    return route.fulfill({json:{success:true,data:{chainId:42431,address:deployment,throughBlock:37694566,catalog:{seed,catalogId:tempoSeedToId(seed),catalogUrl,seller,sellerPublicKey:key,sellerIdentityId:identity.identityId}}}});
  });
  await page.route('https://cdn.picomart.zkbytes.com/moderato/v1/*/catalogs/*.json', route => {
    const body=revisions.get(route.request().url());
    return body ? route.fulfill({contentType:'application/json',body}) : route.fulfill({status:404});
  });
  await page.route('https://fixtures.picomart.test/*.svg', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#eeeadf"/><rect x="112" y="65" width="76" height="180" rx="12" fill="#7f9170"/><rect x="125" y="35" width="50" height="45" rx="4" fill="#29483a"/><rect x="119" y="140" width="62" height="60" fill="#faf5e4"/></svg>'}));
  return {get metadataRequests() { return metadataRequests; }};
}
