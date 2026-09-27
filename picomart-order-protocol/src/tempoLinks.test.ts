import {describe,expect,it} from 'vitest';
import {compactCatalogLink,parseCompactCatalogLink} from './tempo.js';

const seed='BAQEBAQEBAQEBAQEBAQEBA',product='AwMDAwMDAwMDAwMDAwMDAw';
describe('compact printed catalog links',()=>{
  it('uses the same short payload for links and QR values',()=>{
    const url=compactCatalogLink(seed,product);
    expect(url).toBe(`https://app.picomart.zkbytes.com/#${seed}${product}2`);
    expect(parseCompactCatalogLink(url)).toEqual({seed,productId:product,network:'moderato'});
    expect(parseCompactCatalogLink(compactCatalogLink(seed))).toEqual({seed,productId:null,network:'moderato'});
    expect(compactCatalogLink(seed,product,'http://localhost:5173')).toBe(`http://localhost:5173/#${seed}${product}2`);
  });
  it('rejects missing, unknown and unconfigured profiles without a fallback',()=>{
    for(const digit of ['','1','0','9','22'])expect(()=>parseCompactCatalogLink(`https://example.test/#${seed}${product}${digit}`)).toThrow();
    expect(()=>compactCatalogLink(seed,product,undefined,'mainnet')).toThrow();
  });
  it('rejects expanded URLs, malformed IDs and unsafe destinations',()=>{
    for(const url of [
      `https://example.test/catalog?v=1&chain=42431&catalog=${seed}&product=${product}`,
      `https://example.test/?chain=42431#${seed}${product}2`,
      `https://example.test/#${seed}${product.slice(1)}2`,
      `https://example.test/#${seed}${'!'.repeat(22)}2`,
      `javascript:alert(1)#${seed}${product}2`,
      `http://example.test/#${seed}${product}2`,
      `https://user:password@example.test/#${seed}${product}2`,
    ])expect(()=>parseCompactCatalogLink(url)).toThrow();
    expect(()=>compactCatalogLink(seed,'')).toThrow();
  });
});
