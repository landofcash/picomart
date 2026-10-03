import {z} from 'zod';
import {ProductCatalogueSchema} from '../productSchemas';
import {exactBaseUnits} from '../pricing/amount';

const InputProduct = z.object({Price: z.union([z.string(), z.number(), z.bigint()])}).passthrough();

export function parseCatalog(data: unknown) {
  const products = ProductCatalogueSchema.parse(z.array(InputProduct).parse(data).map(product => ({
    ...product, Price: exactBaseUnits(product.Price),
  })));
  if (new Set(products.map(product => product.ProductId)).size !== products.length) {
    throw new Error('Catalog contains duplicate product IDs');
  }
  return products;
}
