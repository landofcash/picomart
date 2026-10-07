import {test,expect} from '@playwright/test';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {createProductSchema,ProductSchema} from '../src/lib/productSchemas';

const alpha=PICOMART_TEMPO_CONFIG.tokens.find(token=>token.key==='alphaUSD')!;
const product={ProductId:'AQEBAQEBAQEBAQEBAQEBAQ',PriceToken:alpha.tokenId,Price:1000001n,Name:'Example',Description:'',Image:''};

test('catalog schema accepts an extra configured payment currency and retains exact terms',()=>{
  const schema=createProductSchema([alpha]);
  expect(schema.parse(product)).toMatchObject({PriceToken:alpha.tokenId,Price:1000001n});
  expect(schema.safeParse({...product,PriceToken:'0x'+'99'.repeat(20)}).success).toBe(false);
});

test('current catalog schema accepts configured payment currencies and rejects unknown currencies',()=>{
  for(const token of PICOMART_TEMPO_CONFIG.paymentTokens) {
    expect(ProductSchema.parse({...product,PriceToken:token.tokenId})).toMatchObject({PriceToken:token.tokenId,Price:1000001n});
  }
  expect(ProductSchema.safeParse({...product,PriceToken:'0x'+'99'.repeat(20)}).success).toBe(false);
});
