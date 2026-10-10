import {CATALOG_CDN} from '@/config';
import {loadTempoCatalog} from '@picomart/order-protocol/tempo-protocol';
import type {NetworkId} from '@/context/wallet/types';
import {fetchProductBySeed} from '@/lib/syncService';
import {parseCatalog} from './parse';
export async function loadCatalog(seed:string,network:NetworkId,signal?:AbortSignal){
 const metadata=await fetchProductBySeed(seed,network,signal);if(!metadata)throw new Error('Catalog not found for this seed');
 const catalog=await loadTempoCatalog(metadata.productsUrl,CATALOG_CDN,fetch,signal);
 return {metadata,products:parseCatalog({version:catalog.version,products:catalog.products,deliveryOptionsUrl:catalog.deliveryOptionsUrl}),deliveryOptions:catalog.deliveryOptions,deliveryOptionsUrl:catalog.deliveryOptionsUrl};
}
export type LoadedCatalog=Awaited<ReturnType<typeof loadCatalog>>;
