import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {TEMPLATE_ROOT,writeJson} from '../src/config.ts';
import {verifiedArtifact} from '../src/artifacts.ts';
import {readInput} from '../src/input.ts';
import {startPreview} from '../src/preview.ts';
const {chromium}=createRequire(path.join(TEMPLATE_ROOT,'package.json'))('@playwright/test');
const {tempoSeedToId,createTempoReceivingContext,createTempoReceivingIdentity}=createRequire(path.join(TEMPLATE_ROOT,'package.json'))('@picomart/order-protocol/tempo-protocol');
const artifact=await verifiedArtifact(process.argv[2]);
const saved=JSON.parse(await fs.readFile(path.join(artifact.directory,'input.json'),'utf8'));
const input=saved.products?saved:await readInput(undefined,'pantry');
const hosted=process.argv.includes('--hosted'),liveCatalog=process.argv.includes('--live-catalog');
let origin;
if(hosted){origin=new URL(process.env.STOREFRONT_RESOLVER_BASE_URL);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('Set an HTTPS STOREFRONT_RESOLVER_BASE_URL origin');}
const preview=hosted?{url:new URL(artifact.manifest.base,origin).toString(),close:async()=>{}}:await startPreview(artifact.files,0,artifact.manifest.base);
const label=hosted?(liveCatalog?'hosted-live':'hosted'):'collected';
let browser;
try {
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  const results=[];
  for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
    const context=await browser.newContext({viewport});const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    if(!liveCatalog){
    const seller='0x'+'11'.repeat(20),key='0x'+'05'.repeat(32),deployment='0x3c91183f0454eab6eff6f570ac402be278dbd6f4',seed=input.config.catalogSeed;
    const identity=createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:42431,contractAddress:deployment,role:'seller',account:seller,catalogSeed:seed}),Buffer.from(key.slice(2),'hex').toString('base64'));
    await page.route('https://sync.picomart.zkbytes.com/api/v1/moderato/catalogs/**',route=>route.fulfill(route.request().url().endsWith('/'+seed)?{json:{success:true,data:{chainId:42431,address:deployment,throughBlock:37694566,catalog:{seed,catalogId:tempoSeedToId(seed),catalogUrl:'https://cdn.picomart.zkbytes.com/fixture.json',seller,sellerPublicKey:key,sellerIdentityId:identity.identityId}}}}:{status:404,json:{success:false}}));
    await page.route('https://cdn.picomart.zkbytes.com/fixture.json',route=>route.fulfill({json:input.products}));
    await page.route('https://fixtures.picomart.test/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#e7e4d7"/><rect x="95" y="65" width="110" height="180" rx="15" fill="#536955"/></svg>'}));
    }
    const root=await page.goto(preview.url);await page.getByRole('heading',{level:1}).waitFor();
    if(hosted){assert.equal(root.status(),200);assert.equal(root.headers()['x-picomart-revision'],artifact.result.id);}
    const embedded=JSON.parse(await page.locator('#picomart-storefront-config').textContent());assert.equal(embedded.shopId,input.config.shopId);assert.equal(embedded.catalogSeed,input.config.catalogSeed);
    let product=input.products[0];
    if(liveCatalog){await page.goto(preview.url+'products');const card=page.getByTestId('product-card').first();await card.waitFor();const href=await card.getByRole('link').first().getAttribute('href');const match=/\/products\/([A-Za-z0-9_-]{22})\/?$/.exec(new URL(href,preview.url).pathname);assert.ok(match);product={ProductId:match[1]};await page.goto(preview.url);await page.getByRole('heading',{level:1}).waitFor();}
    await page.getByTestId('product-card').first().waitFor();
    // Scroll through lazy images before taking a full-page screenshot.
    for(const img of await page.locator('img[loading="lazy"]').all())await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>Array.from(document.images).every(img=>img.complete));
    await page.evaluate(()=>window.scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(artifact.directory,`${label}-${name}.png`),fullPage:true});
    await page.goto(`${preview.url}products/${product.ProductId}`);const refreshed=await page.reload();
    if(hosted){assert.equal(refreshed.status(),200);assert.equal(refreshed.headers()['x-picomart-revision'],artifact.result.id);}
    const link=page.getByRole('link',{name:'Open in Picomart',exact:true});await link.waitFor();
    const buyerUrl=`https://app.picomart.zkbytes.com/#${input.config.catalogSeed}${product.ProductId}2`;
    assert.equal(await link.getAttribute('href'),buyerUrl);
    await page.getByRole('button',{name:'Show product QR code'}).click();assert.equal(await page.getByRole('img',{name:'Product QR code'}).getAttribute('data-buyer-url'),buyerUrl);await page.keyboard.press('Escape');
    assert.equal((await page.request.get(preview.url+'assets/missing.js')).status(),404);
    assert.deepEqual(errors,[]);
    results.push({viewport:name,width:viewport.width,height:viewport.height,root:true,directProductRefresh:true,productId:product.ProductId,buyerLink:true,qr:true,missingAsset404:true});await context.close();
  }
  await writeJson(path.join(artifact.directory,`${label}-browser-check.json`),{checkedAt:new Date().toISOString(),url:preview.url,sandboxCleanup:artifact.result.cleanup,catalog:liveCatalog?'live Picomart Sync; no network mocks':'deterministic browser fixture',results});
  console.log(`${label} website passed desktop/mobile browser checks after confirmed VM destruction.`);
}finally{await browser?.close();await preview.close();}
