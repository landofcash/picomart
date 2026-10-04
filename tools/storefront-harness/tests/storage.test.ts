import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BunnyStorage,uploadRevision} from '../src/storage.ts';
import {selectRevision,resolveShop} from '../src/hosting.ts';
import {sha256} from '../src/files.ts';
function memoryStore() {
  const objects=new Map<string,Buffer>();let fail=false;
  const transport:typeof fetch=async(input,options)=>{
    const key=new URL(String(input)).pathname;
    assert.equal(new Headers(options?.headers).get('AccessKey'),'test-only');
    if(options?.method==='PUT') {
      if(fail)throw new Error('Interrupted connection');
      const bytes=Buffer.from(await new Response(options.body).arrayBuffer());
      assert.equal(new Headers(options.headers).get('Checksum'),sha256(bytes).toUpperCase());
      objects.set(key,bytes);return new Response('',{status:201});
    }
    return objects.has(key)?new Response(new Uint8Array(objects.get(key)!)):new Response('',{status:404});
  };
  return {objects,setFail:(value:boolean)=>{fail=value;},store:new BunnyStorage({endpoint:'https://storage.bunnycdn.com',zone:'test-zone',key:'test-only'},transport)};
}
test('storage credentials never follow arbitrary endpoints or traversal',()=>{
  assert.throws(()=>new BunnyStorage({endpoint:'https://evil.test',zone:'a',key:'test'}));
});
test('interrupted writes never complete revisions; retry repairs partial artifacts and preserves immutability',async()=>{
  const {store,objects,setFail}=memoryStore();const files=new Map([['index.html',Buffer.from('complete html')]]);
  objects.set('/test-zone/trial/index.html',Buffer.from('partial'));
  setFail(true);await assert.rejects(uploadRevision(store,'trial',files));assert.equal(objects.has('/test-zone/trial/ready.json'),false);
  setFail(false);await uploadRevision(store,'trial',files);assert.equal(objects.get('/test-zone/trial/index.html')?.toString(),'complete html');
  await assert.rejects(uploadRevision(store,'trial',new Map([['index.html',Buffer.from('different html')]])),/immutable/);
});
test('shop routes and revision switching retain identity and reject missing assets and incomplete revisions',async()=>{
  const {store}=memoryStore();
  const files=(text:string)=>new Map([['index.html',Buffer.from(text)],['storefront.json',Buffer.from('{}')],['assets/app.js',Buffer.from('void 0')]]);
  await uploadRevision(store,'phase2/shops/a/revisions/r1',files('shop a one'),{shopId:'a',base:'/s/a/'});
  await uploadRevision(store,'phase2/shops/a/revisions/r2',files('shop a two'),{shopId:'a',base:'/s/a/'});
  await uploadRevision(store,'phase2/shops/b/revisions/r1',files('shop b'),{shopId:'b',base:'/s/b/'});
  await selectRevision(store,'a','r1');await selectRevision(store,'b','r1');
  assert.equal((await resolveShop(store,'/s/a/products/AAAAAAAAAAAAAAAAAAAAAA'))?.bytes.toString(),'shop a one');
  assert.equal((await resolveShop(store,'/s/b/products'))?.bytes.toString(),'shop b');
  assert.equal(await resolveShop(store,'/s/a/assets/missing.js'),null);
  await assert.rejects(selectRevision(store,'a','incomplete'));
  await selectRevision(store,'a','r2');assert.equal((await resolveShop(store,'/s/a/'))?.bytes.toString(),'shop a two');
  await selectRevision(store,'a','r1');assert.equal((await resolveShop(store,'/s/a/'))?.bytes.toString(),'shop a one');
});
