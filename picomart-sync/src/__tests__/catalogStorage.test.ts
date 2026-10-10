import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import axios from 'axios';
import {Wallet} from 'ethers';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {createCatalogUploadRouter} from '../routes/api/upload-to-bunny';
import {CATALOG_CDN,IMAGE_LIMIT,storageConfig,sha256,uploadMessage,authorizeUpload,imageType,catalogBytes,deliveryBytes,storagePath,PATH_USD} from '../catalogStorage';

const wallet=new Wallet('0x'+'11'.repeat(32)),account=wallet.address.toLowerCase(); // Public test fixture only.
const png=Buffer.from('89504e470d0a1a0a00000000','hex');
const env={BUNNY_UPLOAD_ENABLED:'true',BUNNY_STORAGE_ZONE:'test-catalogs',BUNNY_STORAGE_ACCESS_KEY:'fixture-storage-password',BUNNY_STORAGE_ENDPOINT:'https://uk.storage.bunnycdn.com'};
const product={ProductId:'AwMDAwMDAwMDAwMDAwMDAw',Name:'Test item',Description:'',Price:'1000001',PriceToken:PATH_USD,Image:`${CATALOG_CDN}/${storagePath(account,'image',sha256(png),'png')}`};
const envelope=(products:unknown[])=>({version:2,deliveryOptionsUrl:`${CATALOG_CDN}/moderato/v1/${account}/delivery-options/${'a'.repeat(64)}.json`,products});
async function auth(kind:'image'|'json'|'delivery',bytes:Buffer,expiresAt=Date.now()+240_000) {
  return {account,expiresAt,signature:await wallet.signMessage(uploadMessage(account,kind,sha256(bytes),expiresAt))};
}
async function fixture(t:TestContext,customEnv:NodeJS.ProcessEnv=env,options:{corrupt?:boolean;fail?:boolean}={}) {
  const calls:Array<{url:string;bytes:Buffer;options:any}>=[];let stored=Buffer.alloc(0);
  const transport={put:async(url:string,bytes:Buffer,opts:unknown)=>{
    calls.push({url,bytes,options:opts});stored=bytes;if(options.fail)throw new Error('fixture-storage-password secret upstream details');return {status:201};
  },get:async()=>({status:200,data:options.corrupt?Buffer.from('changed'):stored})} as unknown as Pick<typeof axios,'put'|'get'>;
  const app=express();app.use(express.json({limit:'1mb'}));app.use('/api/cdn',createCatalogUploadRouter(transport,customEnv));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}/api/cdn`;
  const post=async(body:unknown,origin?:string)=>fetch(base+'/json',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  return {base,calls,post};
}
test('storage configuration uses a validated regional endpoint and explicit storage password',()=>{
  assert.equal(storageConfig(env).baseUrl,'https://uk.storage.bunnycdn.com/test-catalogs');
  for(const endpoint of ['http://storage.bunnycdn.com','https://evil.test','https://uk.storage.bunnycdn.com.evil.test','https://x:pw@storage.bunnycdn.com','https://storage.bunnycdn.com/zone','https://storage.bunnycdn.com?x'])assert.throws(()=>storageConfig({...env,BUNNY_STORAGE_ENDPOINT:endpoint}));
  assert.throws(()=>storageConfig({...env,BUNNY_STORAGE_ACCESS_KEY:'',BUNNY_API_KEY:'old-account-key'}));
  assert.throws(()=>storageConfig({...env,BUNNY_STORAGE_ZONE:'../other'}));
  assert.throws(()=>storageConfig({...env,BUNNY_PUBLIC_BASE_URL:'https://evil.test'}));
});
test('signature binds the exact public upload scope, content, wallet and deadline',async()=>{
  const now=1800000000000,expiry=now+240000,hash=sha256(png);
  const message=`Picomart public catalog upload\nVersion: 1\nChain ID: 42431\nContract: 0x3c91183f0454eab6eff6f570ac402be278dbd6f4\nCDN: https://cdn.picomart.zkbytes.com\nAccount: ${account}\nKind: image\nSHA256: ${hash}\nExpires at: ${expiry}`;
  assert.equal(uploadMessage(account,'image',hash,expiry),message);
  const proof={account,expiresAt:expiry,signature:await wallet.signMessage(message)};
  assert.equal(authorizeUpload(proof,'image',hash,now),account);
  assert.throws(()=>authorizeUpload(proof,'json',hash,now));
  assert.throws(()=>authorizeUpload(proof,'image',sha256('other'),now));
  assert.throws(()=>authorizeUpload({...proof,account:'0x'+'22'.repeat(20)},'image',hash,now));
  assert.throws(()=>authorizeUpload(proof,'image',hash,expiry));
  assert.throws(()=>authorizeUpload({...proof,expiresAt:now+300001},'image',hash,now));
});
test('catalog terms accept configured currencies and reject private/unknown fields, unsupported tokens, duplicate IDs and foreign image paths',()=>{
  for(const token of PICOMART_TEMPO_CONFIG.paymentTokens) {
    const content=JSON.stringify(envelope([{...product,PriceToken:token.tokenId}]));
    assert.deepEqual(catalogBytes(content,account),Buffer.from(content));
  }
  for(const products of [[],[product,product],[{...product,LocalFile:'private'}],[{...product,Price:'1.2'}],[{...product,PriceToken:'0x'+'99'.repeat(20)}],[{...product,Image:'https://evil.test/image.png'}],[{...product,Image:product.Image.replace(account,'0x'+'22'.repeat(20))}]])assert.throws(()=>catalogBytes(JSON.stringify(envelope(products)),account));
  assert.throws(()=>catalogBytes('x'.repeat(1000001),account));
});
test('image bytes determine the extension and SVG/empty/oversized files are rejected',()=>{
  assert.equal(imageType(png).extension,'png');
  assert.equal(imageType(Buffer.from('ffd8ff00','hex')).extension,'jpg');
  assert.equal(imageType(Buffer.from('GIF89a')).extension,'gif');
  assert.equal(imageType(Buffer.from('RIFF0000WEBP')).extension,'webp');
  for(const bytes of [Buffer.alloc(0),Buffer.from('<svg/>'),Buffer.alloc(IMAGE_LIMIT+1)])assert.throws(()=>imageType(bytes));
});
test('disabled/misconfigured uploads fail closed and status never returns storage credentials',async t=>{
  const f=await fixture(t,{...env,BUNNY_UPLOAD_ENABLED:'false'});
  assert.equal((await f.post({path:'legacy.json',content:[]})).status,503);
  const status=await (await fetch(f.base+'/status')).json();assert.equal(status.ready,false);assert.equal(JSON.stringify(status).includes(env.BUNNY_STORAGE_ACCESS_KEY),false);assert.equal(f.calls.length,0);
  const invalid=await fixture(t,{...env,BUNNY_STORAGE_ACCESS_KEY:''});assert.equal((await invalid.post({})).status,503);
});
test('signed JSON uses immutable retry paths, exact checksum and origin read-back',async t=>{
  const f=await fixture(t),bytes=Buffer.from(JSON.stringify(envelope([product]))),body={...await auth('json',bytes),content:bytes.toString()};
  const result=await f.post(body);assert.equal(result.status,200);const data=await result.json();
  assert.equal(data.url,`${CATALOG_CDN}/${storagePath(account,'json',sha256(bytes),'json')}`);
  assert.equal(f.calls[0].options.headers.AccessKey,env.BUNNY_STORAGE_ACCESS_KEY);assert.equal(f.calls[0].options.headers.Checksum,sha256(bytes).toUpperCase());assert.equal(f.calls[0].options.maxRedirects,0);
  assert.equal((await f.post(body)).status,200);assert.equal(f.calls[0].url,f.calls[1].url);
  const changed=Buffer.from(JSON.stringify(envelope([{...product,Price:'2000000'}])));await f.post({...await auth('json',changed),content:changed.toString()});assert.notEqual(f.calls[0].url,f.calls[2].url);
});
test('delivery options publish separately with their own signed scope and reject unsupported currency',async t=>{
  const f=await fixture(t),options={version:1,currency:PATH_USD,methods:[{id:'digital',type:'digital',name:'Digital delivery',description:''}]},bytes=Buffer.from(JSON.stringify(options));
  const response=await fetch(f.base+'/delivery-options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...await auth('delivery',bytes),content:bytes.toString()})});
  assert.equal(response.status,200);assert.equal((await response.json()).url,`${CATALOG_CDN}/${storagePath(account,'delivery',sha256(bytes),'json')}`);
  assert.throws(()=>deliveryBytes(JSON.stringify({...options,currency:'0x'+'99'.repeat(20)})));
  const wrong=await fetch(f.base+'/delivery-options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...await auth('json',bytes),content:bytes.toString()})});assert.equal(wrong.status,400);assert.equal(f.calls.length,1);
});
test('unsigned/tampered requests, client paths and unexpected browser origins cannot write',async t=>{
  const f=await fixture(t),bytes=Buffer.from(JSON.stringify(envelope([product]))),proof=await auth('json',bytes);
  for(const body of [{content:bytes.toString(),account},{...proof,content:bytes.toString(),path:'../other.json'},{...proof,content:JSON.stringify(envelope([{...product,Price:'2'}]))}])assert.equal((await f.post(body)).status,400);
  assert.equal((await f.post({...proof,content:bytes.toString()},'https://evil.test')).status,403);assert.equal(f.calls.length,0);
});
test('multipart image publishes under its byte hash rather than its supplied filename',async t=>{
  const f=await fixture(t),proof=await auth('image',png),form=new FormData();form.append('file',new Blob([new Uint8Array(png)],{type:'image/png'}),'../../old.svg');
  for(const [key,value] of Object.entries(proof))form.append(key,String(value));
  const response=await fetch(f.base+'/image',{method:'POST',body:form});assert.equal(response.status,200);const data=await response.json();assert.equal(data.url,product.Image);assert.equal(f.calls[0].options.headers['Content-Type'],'image/png');
});
test('read-back corruption and upstream failures do not report success or leak credentials',async t=>{
  const bytes=Buffer.from(JSON.stringify(envelope([product]))),body={...await auth('json',bytes),content:bytes.toString()};
  for(const options of [{corrupt:true},{fail:true}]){const f=await fixture(t,env,options);const response=await f.post(body);assert.equal(response.status,502);assert.equal((await response.text()).includes(env.BUNNY_STORAGE_ACCESS_KEY),false);}
});
