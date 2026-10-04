import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {tempoSeedToId,createTempoReceivingContext,createTempoReceivingIdentity} from '@picomart/order-protocol/tempo-protocol';
import {formatBaseUnits} from '../src/lib/pricing/amount.ts';
const input=JSON.parse(fs.readFileSync(new URL('./input.json',import.meta.url),'utf8'));
const {config,products:original,base}=input;
const url=route=>`${base}${route}`;
async function mock(page,{products=()=>original,fail=()=>false}={}) {
  const seller='0x'+'11'.repeat(20),key='0x'+'05'.repeat(32),deployment='0x3c91183f0454eab6eff6f570ac402be278dbd6f4';
  const identity=createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:42431,contractAddress:deployment,role:'seller',account:seller,catalogSeed:config.catalogSeed}),Buffer.from(key.slice(2),'hex').toString('base64'));
  await page.route('https://sync.picomart.zkbytes.com/api/v1/moderato/catalogs/**',route=>route.fulfill(fail()?{status:503,json:{success:false}}:route.request().url().endsWith('/'+config.catalogSeed)?{json:{success:true,data:{chainId:42431,address:deployment,throughBlock:37694566,catalog:{seed:config.catalogSeed,catalogId:tempoSeedToId(config.catalogSeed),catalogUrl:'https://cdn.picomart.zkbytes.com/fixture.json',seller,sellerPublicKey:key,sellerIdentityId:identity.identityId}}}}:{status:404,json:{success:false}}));
  await page.route('https://cdn.picomart.zkbytes.com/fixture.json',route=>route.fulfill({json:products()}));
  await page.route('https://fixtures.picomart.test/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#ddd9ca"/><rect x="90" y="70" width="120" height="160" rx="15" fill="#506053"/></svg>'}));
}
test('compiled homepage, search, collection, direct refresh and buyer handoff',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await mock(page);await page.goto(url(''));
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.harness/${info.project.name}.png`,fullPage:true});
  await page.goto(url('products'));await expect(page.getByTestId('product-card')).toHaveCount(original.length);
  await page.getByRole('searchbox',{name:'Search products'}).fill(original[0].Name);
  await expect(page.getByTestId('product-card')).toHaveCount(original.filter(p=>`${p.Name} ${p.Description}`.toLocaleLowerCase().includes(original[0].Name.toLocaleLowerCase())).length);await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue(original[0].Name);
  await page.getByRole('searchbox').fill('zzzz-no-matching-product');await expect(page.getByRole('heading',{name:'No matching products'})).toBeVisible();
  await page.getByRole('button',{name:'Clear search'}).click();
  if(config.collections.length) {const c=config.collections[0];await page.getByRole('combobox',{name:'Collection',exact:true}).selectOption(c.id);await expect(page.getByTestId('product-card')).toHaveCount(original.filter(p=>c.productIds.includes(p.ProductId)).length);}
  const p=original[0];await page.addInitScript(()=>localStorage.setItem('PicomartPromo-network','mainnet'));
  await page.goto(url(`products/${p.ProductId}?seed=wrong&network=mainnet`));await page.reload();
  await expect(page.getByRole('heading',{level:1})).toHaveText(p.Name);
  const expected=`https://app.picomart.zkbytes.com/#${config.catalogSeed}${p.ProductId}2`;
  await expect(page.getByRole('link',{name:'Open in Picomart',exact:true})).toHaveAttribute('href',expected);
  await page.getByRole('button',{name:'Show product QR code'}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('img',{name:'Product QR code'})).toHaveAttribute('data-buyer-url',expected);
  await expect(dialog.getByRole('textbox',{name:'Product link'})).toHaveValue(expected);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Show product QR code'})).toBeFocused();
  expect(errors).toEqual([]);
});
test('current products replace snapshots; empty, missing and retry states remain usable',async({page})=>{
  let failure=true,products=original;
  await mock(page,{fail:()=>failure,products:()=>products});await page.goto(url('products'));
  await expect(page.getByRole('alert')).toBeVisible();failure=false;await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.getByTestId('product-card')).toHaveCount(original.length);
  const id='FFFFFFFFFFFFFFFFFFFFFF';products=[{...original[0],ProductId:id,Name:'New live catalog product',Image:''}];
  await page.getByRole('button',{name:'Refresh products'}).click();await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByText('New live catalog product',{exact:true})).toBeVisible();
  await page.goto(url(`products/${id}`));await expect(page.getByRole('img',{name:'Image unavailable for New live catalog product'})).toBeVisible();
  await page.goto(url(`products/${original[0].ProductId}`));await expect(page.getByRole('heading',{name:'Product unavailable'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open in Picomart',exact:true})).toHaveCount(0);
  products=[];await page.goto(url('products'));await expect(page.getByRole('heading',{name:'No products here yet'})).toBeVisible();
  await page.goto(url('collections/missing'));await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();
});
test('mobile navigation is reachable and keyboard dismissible',async({page},info)=>{
  test.skip(info.project.name!=='mobile');await mock(page);await page.goto(url(''));
  const trigger=page.getByRole('button',{name:'Open navigation'});await trigger.click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await trigger.click();
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link').first().click();await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('maintained exact-price formatter preserves large and fractional values',()=>{
  expect(formatBaseUnits(9007199254740993123456n,8)).toBe('90,071,992,547,409.93123456');
  expect(formatBaseUnits(1n,8)).toBe('0.00000001');
});
