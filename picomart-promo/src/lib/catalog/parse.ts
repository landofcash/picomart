import {assertTempoDeliveryUrl, parseTempoCatalog} from '@picomart/order-protocol/tempo-protocol';
import {ProductCatalogueSchema} from '../productSchemas';
import {exactBaseUnits} from '../pricing/amount';

export function parseCatalog(data: unknown, catalogUrl: string) {
  const catalog = parseTempoCatalog(data);
  assertTempoDeliveryUrl(catalogUrl, catalog.deliveryOptionsUrl);
  return ProductCatalogueSchema.parse(catalog.products.map(product => ({
    ...product, Price: exactBaseUnits(product.Price),
  })));
}
