import {get} from 'idb-keyval';
import type {TempoDeliveryOptions} from '@picomart/order-protocol/tempo-protocol';

export interface CatalogueProduct {
  ProductId: string;
  Name: string;
  Description: string;
  Price: string;
  PriceToken: string;
  Image: string;
  LocalFile?: File;
}

export interface CatalogueDraft {
  version: number;
  products: CatalogueProduct[];
  currency: string;
  confirmed: boolean;
  setId: string;
  delivery: TempoDeliveryOptions | null;
  sourceUrl?: string;
}

export interface ScopedCatalogueDraft {
  scope: string;
  draft: CatalogueDraft;
}

export async function loadCatalogueDraft(
  scope: string,
  localScope: string,
  previous?: ScopedCatalogueDraft,
): Promise<CatalogueDraft | undefined> {
  const saved = await get<CatalogueDraft>(scope);
  if (saved) return saved;
  // Only carry an active local draft into a wallet on the same network.
  // Use the current editor snapshot because its last IndexedDB save may be pending.
  if (scope !== localScope && previous?.scope === localScope) return previous.draft;
  return undefined;
}
