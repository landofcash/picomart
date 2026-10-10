import {beforeEach, describe, expect, it, vi} from 'vitest';
import {get} from 'idb-keyval';
import {loadCatalogueDraft, type CatalogueDraft} from './catalogueDraft';
import {newDeliverySet, publishedDeliverySet} from './deliverySets';

vi.mock('idb-keyval', () => ({get:vi.fn()}));

const localScope = 'picomart_catalog_draft_v2_moderato_local';
const walletScope = 'picomart_catalog_draft_v2_moderato_0x1111';
const currency = '0x20c0000000000000000000000000000000000000';
const draft: CatalogueDraft = {
  version:2,
  products:[{ProductId:'product-1',Name:'Prepared product',Description:'Local draft',Price:'1000000',PriceToken:currency,Image:'',LocalFile:new File(['image'], 'product.png', {type:'image/png'})}],
  currency,
  confirmed:true,
  setId:'selected-set',
  delivery:publishedDeliverySet(newDeliverySet(currency, 'digital')),
};

beforeEach(() => vi.resetAllMocks());

describe('catalogue draft handoff', () => {
  it('carries the current local products, image, currency and delivery into an empty wallet scope', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    const result = await loadCatalogueDraft(walletScope, localScope, {scope:localScope,draft});
    expect(result).toEqual(draft);
    expect(result?.products[0].LocalFile).toBe(draft.products[0].LocalFile);
    // Read only the destination; an older or pending local save cannot replace current edits.
    expect(get).toHaveBeenCalledExactlyOnceWith(walletScope);
  });

  it('keeps an existing wallet draft instead of replacing it with local work', async () => {
    const saved = {...draft,products:[],setId:'wallet-set'};
    vi.mocked(get).mockResolvedValue(saved);
    expect(await loadCatalogueDraft(walletScope, localScope, {scope:localScope,draft})).toBe(saved);
  });

  it('does not carry a wallet draft to another account or to the disconnected editor', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    const previous = {scope:walletScope,draft};
    expect(await loadCatalogueDraft('picomart_catalog_draft_v2_moderato_0x2222', localScope, previous)).toBeUndefined();
    expect(await loadCatalogueDraft(localScope, localScope, previous)).toBeUndefined();
  });

  it('does not transfer a local draft across networks', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    expect(await loadCatalogueDraft('picomart_catalog_draft_v2_other_0x1111', 'picomart_catalog_draft_v2_other_local', {scope:localScope,draft})).toBeUndefined();
  });

  it('does not replace a failed wallet read with a local draft', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Storage unavailable'));
    await expect(loadCatalogueDraft(walletScope, localScope, {scope:localScope,draft})).rejects.toThrow('Storage unavailable');
  });
});
