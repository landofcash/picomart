import {beforeEach,expect,it,vi} from 'vitest';
import {createTempoReceivingIdentity,tempoIdToSeed} from '@picomart/order-protocol/tempo-protocol';
import {receivingContext,PATH_USD,type CheckoutSelection} from './tempoMarket';
import {addTempoSelection,readTempoCart,removePaidSelection} from './tempoCart';
const catalogId='0x'+'01'.repeat(16),seed=tempoIdToSeed(catalogId),seller='0x'+'11'.repeat(20);
const identity=createTempoReceivingIdentity(receivingContext('seller',seller,seed),Buffer.alloc(32,8).toString('base64'));
const selection:CheckoutSelection={catalog:{catalogId,seed,seller,sellerPublicKey:'0x'+'08'.repeat(32),sellerIdentityId:identity.identityId,catalogUrl:'https://cdn.picomart.zkbytes.com/catalog.json'},
  products:[{ProductId:'one',Name:'Product',Description:'',Image:'https://cdn.picomart.zkbytes.com/image.png',PriceToken:PATH_USD,Price:'10000',quantity:2}]};
beforeEach(()=>{const store=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value)});});
it('keeps catalog groups separate and rejects invalid quantities before saving',()=>{
  addTempoSelection(selection);expect(readTempoCart()).toEqual([selection]);
  expect(()=>addTempoSelection({...selection,products:[{...selection.products[0],quantity:0}]})).toThrow();
  expect(readTempoCart()).toEqual([selection]);
});
it('removes paid quantities only once per receipt and preserves later additions',()=>{
  addTempoSelection({...selection,products:[{...selection.products[0],quantity:5}]});
  removePaidSelection(selection,'hash');expect(readTempoCart()[0].products[0].quantity).toBe(3);
  removePaidSelection(selection,'hash');expect(readTempoCart()[0].products[0].quantity).toBe(3);
});
it('collects different products and accumulates repeat scans without replacing earlier items',()=>{
  addTempoSelection(selection);
  addTempoSelection({...selection,products:[{...selection.products[0],ProductId:'two',Name:'Second product',quantity:1}]});
  addTempoSelection(selection);
  expect(readTempoCart()[0].products.map(p=>[p.ProductId,p.quantity])).toEqual([['one',4],['two',1]]);
});
it('persists the cart independently of a tab session and rejects changed receiving identities',()=>{
  addTempoSelection(selection);
  vi.stubGlobal('sessionStorage',{getItem:()=>null});
  expect(readTempoCart()).toEqual([selection]);
  expect(()=>addTempoSelection({...selection,catalog:{...selection.catalog,sellerIdentityId:'0x'+'ff'.repeat(32)}})).toThrow();
  expect(readTempoCart()).toEqual([selection]);
});
it('does not corrupt saved quantities when accumulation exceeds the checkout limit',()=>{
  addTempoSelection({...selection,products:[{...selection.products[0],quantity:1000000}]});
  expect(()=>addTempoSelection(selection)).toThrow();
  expect(readTempoCart()[0].products[0].quantity).toBe(1000000);
});
