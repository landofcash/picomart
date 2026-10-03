import {ArrowUpRight} from 'lucide-react';
import type {NetworkId} from '@/context/wallet/types';
import {getBuyerProductUrl} from '@/lib/buyer/links';

export function BuyerAppLink({catalogSeed, productId, network}: {catalogSeed: string; productId: string; network: NetworkId}) {
  return <a className="shop-button shop-button-primary" href={getBuyerProductUrl(catalogSeed, productId, network)}>
    Open in Picomart <ArrowUpRight size={18} aria-hidden="true"/>
  </a>;
}
