import {beforeEach, describe, expect, it, vi} from 'vitest';
import {catalogDraftScope, editableCatalogDraft, checkCatalogUpdate} from './catalogEditor';
import {catalogs, fetchCatalogDocument, marketContract} from './tempoMarket';
import {tempoIdToSeed} from '@picomart/order-protocol/tempo-protocol';
import {defaultDeliveryOptions} from './deliverySets';

vi.mock('./tempoMarket',()=>({catalogs:vi.fn(),fetchCatalogDocument:vi.fn(),marketAddress:(address:string)=>address.toLowerCase(),marketContract:{catalogs:vi.fn()}}));
const account='0x'+'11'.repeat(20), seed=tempoIdToSeed('0x'+'03'.repeat(16));
const currency='0x20c0000000000000000000000000000000000000';
const source={seed,catalogId:'0x'+'03'.repeat(16),seller:account,sellerPublicKey:'0x'+'04'.repeat(32),sellerIdentityId:'0x'+'05'.repeat(32),catalogUrl:'https://cdn.picomart.zkbytes.com/current.json'};
const product={ProductId:tempoIdToSeed('0x'+'06'.repeat(16)),Name:'Existing product',Description:'Original',Price:'1000000',PriceToken:currency,Image:'https://cdn.picomart.zkbytes.com/image.png'};
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(catalogs).mockResolvedValue([source]);
 vi.mocked(marketContract.catalogs).mockResolvedValue(source);
 vi.mocked(fetchCatalogDocument).mockResolvedValue({products:[product],deliveryOptions:defaultDeliveryOptions('default-digital-free',currency)!} as Awaited<ReturnType<typeof fetchCatalogDocument>>);
});
describe('catalog create and edit isolation',()=>{
 it('gives each create session, edited catalog, wallet and network a different draft scope',()=>{
  const keys=[catalogDraftScope('moderato',account,'new-a'),catalogDraftScope('moderato',account,'new-b'),catalogDraftScope('moderato',account,`edit_${seed}`),catalogDraftScope('moderato',null,'new-a'),catalogDraftScope('other',account,'new-a')];
  expect(new Set(keys).size).toBe(keys.length);
  expect(catalogDraftScope('moderato',account.toUpperCase(),'new-a')).toBe(keys[0]);
 });
 it('loads an owned catalog with unchanged product IDs, images, currency and delivery terms',async()=>{
  const draft=await editableCatalogDraft(seed,account);
  expect(draft.products).toEqual([product]);expect(draft.products[0]).not.toBe(product);
  expect(draft.sourceUrl).toBe(source.catalogUrl);expect(draft.setId).toBe('catalog-current');
  expect(draft.delivery?.currency).toBe(currency);expect(draft.confirmed).toBe(true);
  draft.products[0].Name='Edited';expect(product.Name).toBe('Existing product');
 });
 it('rejects another seller and missing catalogs before fetching their content',async()=>{
  await expect(editableCatalogDraft(seed,'0x'+'22'.repeat(20))).rejects.toThrow('does not belong');
  vi.mocked(catalogs).mockResolvedValue([]);
  await expect(editableCatalogDraft(seed,account)).rejects.toThrow('no longer available');
  expect(fetchCatalogDocument).not.toHaveBeenCalled();
 });
 it('rejects invalid catalog references before requesting history',async()=>{
  await expect(editableCatalogDraft('invalid',account)).rejects.toThrow();expect(catalogs).not.toHaveBeenCalled();
 });
 it('blocks a stale edit instead of overwriting a newer published revision',async()=>{
  expect(await checkCatalogUpdate(seed,account,source.catalogUrl)).toEqual(source);
  await expect(checkCatalogUpdate(seed,account,'https://cdn.picomart.zkbytes.com/previous.json')).rejects.toThrow('changed after');
 });
 it('blocks an update already changed on chain even when the projection is stale',async()=>{
  vi.mocked(marketContract.catalogs).mockResolvedValue({...source,catalogUrl:'https://cdn.picomart.zkbytes.com/newer.json'});
  await expect(checkCatalogUpdate(seed,account,source.catalogUrl)).rejects.toThrow('changed after');
 });
 it('rejects delivery terms from a different currency',async()=>{
  vi.mocked(fetchCatalogDocument).mockResolvedValue({products:[product],deliveryOptions:defaultDeliveryOptions('default-digital-free','0x20c0000000000000000000000000000000000001')!} as Awaited<ReturnType<typeof fetchCatalogDocument>>);
  await expect(editableCatalogDraft(seed,account)).rejects.toThrow('same currency');
 });
});
