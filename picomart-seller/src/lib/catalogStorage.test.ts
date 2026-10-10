import {beforeEach,describe,it,expect,vi} from 'vitest';
import {Wallet,hexlify,verifyMessage} from 'ethers';
import {uploadCatalog,currencyAmount,sha256,CATALOG_CDN,uploadMessage,type DraftProduct} from './catalogStorage';
import type {WalletAdapter} from '@/context/wallet/types';
const state=vi.hoisted(()=>({revision:1}));
vi.mock('./internalWallet/providers/tempoInternalWalletProvider',()=>({tempoWalletRevision:()=>state.revision,assertTempoWalletRevision:(r:number)=>{if(r!==state.revision)throw new Error('Wallet changed');}}));
const key=new Wallet('0x'+'11'.repeat(32)),account=key.address.toLowerCase(); // Public test fixture.
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const file=new File([png],'old.svg',{type:'image/png'});
const product:DraftProduct={ProductId:'AwMDAwMDAwMDAwMDAwMDAw',Name:'Example',Description:'Public description',Price:'1000001',PriceToken:'0x20c0000000000000000000000000000000000000',Image:'',LocalFile:file};
const delivery=(currency=product.PriceToken)=>({version:1 as const,currency,methods:[{id:'digital',type:'digital' as const,name:'Digital delivery',description:''}]});
const wallet={chain:'tempo',getAddress:async()=>account,getNetwork:async()=> 'moderato',signMessage:async(m:string)=>new Uint8Array(Buffer.from((await key.signMessage(m)).slice(2),'hex'))} as WalletAdapter;
const api='http://localhost:3000/api/cdn';
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
let stored=new Map<string,Uint8Array>(),posts:Array<{kind:'image'|'json'|'delivery';bytes:Uint8Array;auth:Record<string,unknown>}>=[];
let corrupt=false;
beforeEach(()=>{
  state.revision=1;stored=new Map();posts=[];corrupt=false;
  vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
    if(url===api+'/status')return json({ready:true,version:1,publicBase:CATALOG_CDN});
    if(options?.method==='POST'){
      const kind=url.endsWith('/image')?'image':url.endsWith('/delivery-options')?'delivery':'json';let auth:Record<string,unknown>,bytes:Uint8Array;
      if(kind==='image'){const form=options.body as FormData;auth=Object.fromEntries(form);bytes=new Uint8Array(await (form.get('file') as File).arrayBuffer());}
      else{auth=JSON.parse(options.body as string);bytes=new TextEncoder().encode(auth.content as string);}
      const hash=await sha256(bytes);
      expect(verifyMessage(uploadMessage(account,kind,hash,Number(auth.expiresAt)),String(auth.signature)).toLowerCase()).toBe(account);
      expect(auth.path).toBeUndefined();posts.push({kind,bytes,auth});
      const published=`${CATALOG_CDN}/moderato/v1/${account}/${kind==='image'?'images':kind==='delivery'?'delivery-options':'catalogs'}/${hash}.${kind==='image'?'png':'json'}`;
      stored.set(published,bytes);return json({success:true,version:1,url:published,sha256:hash});
    }
    if(stored.has(url))return new Response(corrupt?new Uint8Array([1]):new Uint8Array(stored.get(url)!));
    throw new Error('Unexpected request');
  }));
});
describe('catalog storage browser integration',()=>{
  it('keeps existing product IDs and images when publishing edited product terms',async()=>{
    const original=await uploadCatalog(wallet,api,[product],delivery());
    posts=[];
    const edited={...original.products[0],Name:'Edited product',Price:'2000001'};
    const updated=await uploadCatalog(wallet,api,[edited],delivery());
    expect(posts.map(post=>post.kind)).toEqual(['delivery','json']);
    expect(updated.products[0]).toEqual(edited);
    expect(updated.products[0].ProductId).toBe(product.ProductId);
    expect(updated.products[0].Image).toBe(original.products[0].Image);
    expect(updated.url).not.toBe(original.url);
  });
  it('publishes a configured currency without replacing its token',async()=>{

    const alpha={...product,PriceToken:'0x20c0000000000000000000000000000000000001'};
    const result=await uploadCatalog(wallet,api,[alpha],delivery(alpha.PriceToken));
    expect(result.products[0].PriceToken).toBe(alpha.PriceToken);
    expect(JSON.parse(new TextDecoder().decode(posts[2].bytes)).products[0].PriceToken).toBe(alpha.PriceToken);
  });
  it('rejects unconfigured currencies before any storage write',async()=>{
    await expect(uploadCatalog(wallet,api,[{...product,PriceToken:'0x1111111111111111111111111111111111111111'}],delivery())).rejects.toThrow(/currency/);
    expect(posts).toHaveLength(0);
  });
  it('preserves exact six-decimal prices and rejects rounding/unsafe input',()=>{
    expect(currencyAmount('1.000001',product.PriceToken)).toBe('1000001');expect(currencyAmount('9007199254.740993',product.PriceToken)).toBe('9007199254740993');
    for(const price of ['0','-1','1.0000001','1e2','Infinity','NaN','1x'])expect(()=>currencyAmount(price,product.PriceToken)).toThrow();
  });
  it('signs and publishes exact images then JSON, verifies CDN bytes and returns the actual URL',async()=>{
    const result=await uploadCatalog(wallet,api,[product],delivery());
    expect(posts.map(p=>p.kind)).toEqual(['image','delivery','json']);
    const publicJson=JSON.parse(new TextDecoder().decode(posts[2].bytes));expect(publicJson.products[0].Price).toBe('1000001');expect(publicJson.products[0].LocalFile).toBeUndefined();expect(publicJson.products[0].Image).toBe(result.products[0].Image);
    expect(result.url.endsWith(`${await sha256(posts[2].bytes)}.json`)).toBe(true);
    const again=await uploadCatalog(wallet,api,[product],delivery());expect(again.url).toBe(result.url);
    expect(uploadMessage(account,'image',hexlify(png).slice(2),123)).toContain('\nChain ID: 42431\nContract: 0x3c91183f0454eab6eff6f570ac402be278dbd6f4\nCDN: https://cdn.picomart.zkbytes.com\n');
  });
  it('does not publish JSON after CDN corruption, and fails before writing invalid products',async()=>{
    corrupt=true;await expect(uploadCatalog(wallet,api,[product],delivery())).rejects.toThrow(/differs/);expect(posts).toHaveLength(1);
    posts=[];await expect(uploadCatalog(wallet,api,[{...product,Price:'NaN'}],delivery())).rejects.toThrow();expect(posts).toHaveLength(0);
  });
  it('stops on wallet revision changes and aborted requests',async()=>{
    const changed={...wallet,signMessage:async(m:string)=>{state.revision++;return wallet.signMessage(m);}};
    await expect(uploadCatalog(changed,api,[product],delivery())).rejects.toThrow(/Wallet changed/);expect(posts).toHaveLength(0);
    const controller=new AbortController();controller.abort();await expect(uploadCatalog(wallet,api,[product],delivery(),controller.signal)).rejects.toThrow();expect(posts).toHaveLength(0);
  });
  it('does not upload any content when the wallet unlock prompt is cancelled',async()=>{
    const cancelled={...wallet,signMessage:async()=>{throw new Error('Wallet unlock was cancelled.');}};
    await expect(uploadCatalog(cancelled,api,[product],delivery())).rejects.toThrow('Wallet unlock was cancelled.');
    expect(posts).toHaveLength(0);
    expect(stored.size).toBe(0);
  });
  it('fails closed for disabled uploads and rejects unexpected response URLs',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>json({ready:false,version:1,publicBase:CATALOG_CDN})));
    await expect(uploadCatalog(wallet,api,[product],delivery())).rejects.toThrow(/disabled/);
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/status')?json({ready:true,version:1,publicBase:CATALOG_CDN}):json({success:true,version:1,url:'https://evil.test/image.png',sha256:await sha256(png)})));
    await expect(uploadCatalog(wallet,api,[product],delivery())).rejects.toThrow(/Unexpected/);
  });
});
