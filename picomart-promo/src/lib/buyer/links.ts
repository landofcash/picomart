import {COMPACT_LINK_CONFIG} from '@picomart/config';
import {BASE_APP_URL,getConfig} from '@/config';
import {compactCatalogLink} from '@picomart/order-protocol/tempo';
import {tempoSeedToId} from '@picomart/order-protocol/tempo-protocol';
import type {NetworkId} from '@/context/wallet/types';
export function getBuyerProductUrl(catalogSeed:string,productId:string,network:NetworkId):string {
  getConfig(network);tempoSeedToId(catalogSeed);
  return compactCatalogLink(catalogSeed,productId,BASE_APP_URL,network,COMPACT_LINK_CONFIG.profiles);
}
