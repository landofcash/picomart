import {COMPACT_LINK_CONFIG} from '@picomart/config';
import {compactCatalogLink as encode, parseCompactCatalogLink as decode} from '@picomart/order-protocol/tempo';
export const compactCatalogLink=(seed:string,productId?:string,origin=COMPACT_LINK_CONFIG.origin,network=COMPACT_LINK_CONFIG.network)=>encode(seed,productId,origin,network,COMPACT_LINK_CONFIG.profiles);
export const parseCompactCatalogLink=(value:string)=>decode(value,COMPACT_LINK_CONFIG.profiles);
