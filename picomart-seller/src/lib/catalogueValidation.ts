export type CatalogueTokenProduct = {PriceToken: string};

export function validateSingleTokenCatalogue(
  products: readonly CatalogueTokenProduct[],
  supportedTokenIds: readonly string[],
): string {
  if (products.length === 0) {
    throw new Error('Catalog must contain at least one product.');
  }

  const supported = new Set(supportedTokenIds);
  const productTokens = new Set(products.map(product => product.PriceToken));
  const unsupported = [...productTokens].filter(token => !supported.has(token));
  if (unsupported.length > 0) {
    throw new Error(`Catalog contains unsupported token type(s): ${unsupported.join(', ')}`);
  }

  if (productTokens.size !== 1) {
    throw new Error('All products in a catalog must use the same payment token. Create separate catalogs for different tokens.');
  }

  return productTokens.values().next().value!;
}
