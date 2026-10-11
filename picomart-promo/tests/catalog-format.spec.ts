import {test, expect} from '@playwright/test';
import {parseCatalog} from '../src/lib/catalog/parse';
import {deliveryOptionsUrl, pantry, seller} from './catalogMocks';

const catalogUrl=`https://cdn.picomart.zkbytes.com/moderato/v1/${seller}/catalogs/${'bb'.repeat(32)}.json`;
const catalog={version:2,deliveryOptionsUrl,products:pantry.products};

test('v2 catalogue parsing preserves exact prices above the safe integer limit', () => {
  const price='9007199254740993';
  const products=parseCatalog({...catalog,products:[{...pantry.products[0],Price:price}]},catalogUrl);
  expect(products[0]).toEqual({...pantry.products[0],Price:9007199254740993n});
});

test('v2 catalogue parsing rejects duplicate products and mixed currencies', () => {
  expect(()=>parseCatalog({...catalog,products:[pantry.products[0],pantry.products[0]]},catalogUrl))
    .toThrow('Invalid catalogue configuration.');
  expect(()=>parseCatalog({...catalog,products:[pantry.products[0],{...pantry.products[1],PriceToken:'0x'+'22'.repeat(20)}]},catalogUrl))
    .toThrow('Invalid catalogue configuration.');
});
