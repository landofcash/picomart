import {parseTempoCatalog} from '@picomart/order-protocol/tempo-protocol';
import {ProductCatalogueSchema} from '../productSchemas';
import {exactBaseUnits} from '../pricing/amount';

export function parseCatalog(data: unknown) {
  const products = ProductCatalogueSchema.parse(parseTempoCatalog(data).products.map(product => ({
    ...product, Price: exactBaseUnits(product.Price),
  })));
  if (new Set(products.map(product => product.ProductId)).size !== products.length) {
    throw new Error('Catalog contains duplicate product IDs');
  }
  return products;
}
