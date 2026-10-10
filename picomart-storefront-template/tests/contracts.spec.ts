import {test, expect} from '@playwright/test';
import {formatBaseUnits, exactBaseUnits} from '../src/lib/pricing/amount';
import {parseCatalog} from '../src/lib/catalog/parse';
import {StorefrontConfigSchema} from '../src/lib/shop/schema';
import config from '../public/storefront.json' with {type: 'json'};
import pantry from '../template/fixtures/pantry.json' with {type: 'json'};

const envelope=(products:unknown[])=>({version:2,deliveryOptionsUrl:'https://cdn.picomart.zkbytes.com/moderato/v1/0x'+ '11'.repeat(20)+'/delivery-options/'+ 'a'.repeat(64)+'.json',products});

test('formats large and fractional amounts exactly', () => {
  expect(formatBaseUnits(9007199254740993123456n, 8)).toBe('90,071,992,547,409.93123456');
  expect(formatBaseUnits(1n, 8)).toBe('0.00000001');
  expect(formatBaseUnits(1250000n, 6)).toBe('1.25');
  expect(formatBaseUnits(100000000n, 8)).toBe('1.00');
  expect(formatBaseUnits(9007199254740993123456n, 8, 'de-DE')).toBe('90.071.992.547.409,93123456');
  expect(() => exactBaseUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow();
});

test('validates catalog identities and exact JSON amounts without hiding malformed prices', () => {
  const product = pantry.products[0];
  expect(parseCatalog(envelope([{...product, Price: '9007199254740993123456'}]))[0].Price).toBe(9007199254740993123456n);
  for (const Price of [1.2, Number.MAX_SAFE_INTEGER + 1, '1.2', '-1', '1e9', '']) expect(() => parseCatalog(envelope([{...product, Price}]))).toThrow();
  expect(() => parseCatalog(envelope([product, product]))).toThrow('Invalid');
  expect(() => parseCatalog(envelope([{...product, ProductId: 'invalid'}]))).toThrow();
});

test('public configuration validates identity and rejects unsafe links and asset traversal', () => {
  expect(StorefrontConfigSchema.parse(config).catalogSeed).toBe(pantry.catalogSeed);
  for (const change of [{schemaVersion: 1}, {network: 'mainnet'}, {chainId: 1}, {contractAddress: '0x' + '11'.repeat(20)}, {catalogSeed: 'AAAAAAAAAAAAAAAAAAAAAA'}]) {
    expect(() => StorefrontConfigSchema.parse({...config, ...change})).toThrow();
  }
  expect(() => parseCatalog(envelope([{...pantry.products[0], PriceToken: '0x' + '99'.repeat(20)}]))).toThrow();
  expect(() => StorefrontConfigSchema.parse({...config, catalogSeed: '../another-shop'})).toThrow();
  expect(() => StorefrontConfigSchema.parse({...config, links: [{label: 'Bad', url: 'javascript:alert(1)'}]})).toThrow();
  expect(() => StorefrontConfigSchema.parse({...config, branding: {...config.branding, logo: 'shop-assets/../secret.json'}})).toThrow();
  expect(() => StorefrontConfigSchema.parse({...config, collections: [config.collections[0], config.collections[0]]})).toThrow();
});
