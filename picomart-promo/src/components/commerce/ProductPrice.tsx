import type {Product} from '@/lib/productSchemas';
import type {NetworkId} from '@/context/wallet/types';
import {safePriceToDisplayString} from '@/lib/tokenUtils';

export function ProductPrice({product, network}: {product: Product; network: NetworkId}) {
  return <span data-testid="product-price">{safePriceToDisplayString(product.PriceToken, product.Price, true, network)}</span>;
}
