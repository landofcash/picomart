import {TempoSeedSchema} from '@picomart/order-protocol/tempo-protocol';
import {catalogs, fetchCatalogDocument, marketAddress, marketContract} from './tempoMarket';
import {validateSingleTokenCatalogue} from './catalogueValidation';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import type {CatalogueDraft} from './catalogueDraft';

export function catalogDraftScope(network: string, account: string | null | undefined, editorId: string) {
  return `picomart_catalog_draft_v2_${network}_${account?.toLowerCase() ?? 'local'}_${editorId}`;
}

export async function ownedCatalog(seed: string, account: string, signal?: AbortSignal) {
  TempoSeedSchema.parse(seed);
  const owner = marketAddress(account);
  const catalog = (await catalogs(owner, signal)).find(item => item.seed === seed);
  if (!catalog || marketAddress(catalog.seller) !== owner) throw new Error('This catalog does not belong to the selected account or is no longer available.');
  return catalog;
}

export async function editableCatalogDraft(seed: string, account: string, signal?: AbortSignal) {
  const catalog = await ownedCatalog(seed, account, signal);
  const document = await fetchCatalogDocument(catalog.catalogUrl, signal);
  const currency = validateSingleTokenCatalogue(document.products, PICOMART_TEMPO_CONFIG.paymentTokens.map(token => token.tokenId));
  if (document.deliveryOptions.currency !== currency) throw new Error('Catalog products and delivery options must use the same currency.');
  const draft: CatalogueDraft = {
    version: 2, products: structuredClone(document.products), currency, confirmed: true,
    setId: 'catalog-current', delivery: structuredClone(document.deliveryOptions), sourceUrl: catalog.catalogUrl,
  };
  return draft;
}

export async function checkCatalogUpdate(seed: string, account: string, sourceUrl: string, signal?: AbortSignal) {
  const catalog = await ownedCatalog(seed, account, signal);
  if (catalog.catalogUrl !== sourceUrl) throw new Error('This catalog changed after you opened it. Reopen Edit catalog before publishing your update.');
  // The projection may be behind the chain; check the current contract before an update.
  signal?.throwIfAborted();
  const current = await marketContract.catalogs(catalog.catalogId);
  signal?.throwIfAborted();
  if (marketAddress(current.seller) !== marketAddress(account) || current.catalogUrl !== sourceUrl ||
      current.sellerPublicKey.toLowerCase() !== catalog.sellerPublicKey.toLowerCase()) {
    throw new Error('This catalog changed after you opened it. Reopen Edit catalog before publishing your update.');
  }
  return catalog;
}
