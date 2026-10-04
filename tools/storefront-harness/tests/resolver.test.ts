import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BunnyStorage,uploadRevision} from '../src/storage.ts';
import {selectRevision} from '../src/hosting.ts';
import {resolveShop,serveHosting} from '../resolver/src/server.ts';
import {publicSource} from '../resolver/src/source.ts';
import {assetReferenceKey} from '../resolver/src/contracts.ts';

function fixture() {
  const objects=new Map<string,Buffer>();
  const transport:typeof fetch=async(input,options)=>{
    const key=new URL(String(input)).pathname.replace('/test-zone/','');
    if(options?.method==='PUT'){objects.set(key,Buffer.from(await new Response(options.body).arrayBuffer()));return new Response('',{status:201});}
    return objects.has(key)?new Response(new Uint8Array(objects.get(key)!)):new Response('',{status:404});
  };
  const store=new BunnyStorage({endpoint:'https://storage.bunnycdn.com',zone:'test-zone',key:'test-only'},transport);
  const files=(revision:string)=>new Map([['index.html',Buffer.from(`<h1>${revision}</h1>`)],['storefront.json',Buffer.from(JSON.stringify({revision}))],[`assets/${revision}.js`,Buffer.from(`console.log('${revision}')`)],['shop-assets/icon.svg',Buffer.from('<svg/>')]]);
  return {objects,store,files};
}

test('public resolver serves the selected shop, preserves old assets, and controls HTTP caching',async()=>{
  const {store,files}=fixture();
  for(const revision of ['a','b'])await uploadRevision(store,`phase2/shops/shop/revisions/${revision}`,files(revision),{shopId:'shop',base:'/s/shop/'});
  await selectRevision(store,'shop','a');const server=await serveHosting(store,0);
  try {
    const root=await fetch(server.url+'/s/shop/');assert.equal(await root.text(),'<h1>a</h1>');assert.equal(root.headers.get('cache-control'),'no-store');
    await selectRevision(store,'shop','b');
    const product=await fetch(server.url+'/s/shop/products/AAAAAAAAAAAAAAAAAAAAAA');assert.equal(await product.text(),'<h1>b</h1>');assert.equal(product.headers.get('x-picomart-revision'),'b');
    assert.deepEqual(await (await fetch(server.url+'/s/shop/storefront.json')).json(),{revision:'b'});
    const old=await fetch(server.url+'/s/shop/assets/a.js');assert.equal(await old.text(),"console.log('a')");assert.match(old.headers.get('cache-control')!,/immutable/);assert.equal(old.headers.get('content-type'),'text/javascript; charset=utf-8');
    const missing=await fetch(server.url+'/s/shop/assets/missing.js');assert.equal(missing.status,404);assert.equal(missing.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(server.url+'/s/other/')).status,404);
    const canonical=await fetch(server.url+'/s/shop?ref=one',{redirect:'manual'});assert.equal(canonical.status,308);assert.equal(canonical.headers.get('location'),'/s/shop/?ref=one');
    const head=await fetch(server.url+'/s/shop/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal((await fetch(server.url+'/s/shop/',{method:'POST'})).status,405);
    await selectRevision(store,'shop','a');assert.equal(await (await fetch(server.url+'/s/shop/')).text(),'<h1>a</h1>');
    assert.equal(await (await fetch(server.url+'/healthz')).text(),'ok');
  }finally{await server.close();}
});

test('changed bytes at an existing asset name cannot change the live selection',async()=>{
  const {store,files,objects}=fixture();
  await uploadRevision(store,'phase2/shops/shop/revisions/a',files('a'),{shopId:'shop',base:'/s/shop/'});await selectRevision(store,'shop','a');
  const next=files('b');next.set('shop-assets/icon.svg',Buffer.from('<svg>different</svg>'));
  await uploadRevision(store,'phase2/shops/shop/revisions/b',next,{shopId:'shop',base:'/s/shop/'});
  await assert.rejects(selectRevision(store,'shop','b'),/Immutable asset name collision/);
  assert.equal(JSON.parse(objects.get('phase2/shops/shop/current.json')!.toString()).revision,'a');
  assert.equal(objects.has(assetReferenceKey('shop','assets/b.js')),false);
});

test('malformed routes cannot read storage and cross-shop or corrupted artifacts fail closed',async()=>{
  let reads=0;const empty={get:async()=>{reads++;throw new Error('Should not read');}};
  for(const route of ['/s/shop/../private.json','/s/shop/%2e%2e/x.js','/s/shop/assets/a%2f.js','/s/shop/.env','/phase2/attempts/a/source/package.json','/s/shop/source/package.json'])assert.equal(await resolveShop(empty,route),null);
  assert.equal(reads,0);
  const {store,files,objects}=fixture();
  await uploadRevision(store,'phase2/shops/shop/revisions/a',files('a'),{shopId:'shop',base:'/s/shop/'});await selectRevision(store,'shop','a');
  const referenceKey=assetReferenceKey('shop','assets/a.js'),reference=JSON.parse(objects.get(referenceKey)!.toString());
  objects.set(referenceKey,Buffer.from(JSON.stringify({...reference,shopId:'other'})));
  await assert.rejects(resolveShop(store,'/s/shop/assets/a.js'),/another shop/);
  objects.set('phase2/shops/shop/revisions/a/index.html',Buffer.from('corrupt'));
  const server=await serveHosting(store,0);
  try {const response=await fetch(server.url+'/s/shop/');assert.equal(response.status,502);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'Shop storage is unavailable');}finally{await server.close();}
});

test('public source sends its storage key only to the primary endpoint and bounds CDN reads',async()=>{
  const env={BUNNY_PUBLIC_STORAGE_ENDPOINT:'https://storage.bunnycdn.com',BUNNY_PUBLIC_STORAGE_ZONE:'public-zone',BUNNY_PUBLIC_STORAGE_KEY:'test-only-secret',BUNNY_PUBLIC_BASE_URL:'https://test.b-cdn.net/'};
  const requests:Array<{url:string;key:string|null}>=[];
  const source=publicSource(env,async(input,init)=>{requests.push({url:String(input),key:new Headers(init?.headers).get('AccessKey')});assert.equal(init?.redirect,'error');return new Response('1234');});
  await source.get('phase2/pointer.json');await source.getArtifact!('phase2/file.js',4);
  assert.deepEqual(requests.map(r=>r.key),['test-only-secret',null]);assert.match(requests[0].url,/storage\.bunnycdn\.com\/public-zone\//);assert.match(requests[1].url,/test\.b-cdn\.net\//);
  await assert.rejects(source.getArtifact!('phase2/file.js',3),/read limit/);
  assert.throws(()=>publicSource({...env,BUNNY_PUBLIC_STORAGE_ENDPOINT:'https://unrelated.test'}));
  assert.throws(()=>publicSource({...env,BUNNY_PUBLIC_BASE_URL:'https://user:password@test.b-cdn.net'}));
});
