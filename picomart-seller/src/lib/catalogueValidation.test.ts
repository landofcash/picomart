import {describe, expect, it} from 'vitest';
import {validateSingleTokenCatalogue} from './catalogueValidation.ts';

describe('validateSingleTokenCatalogue', () => {
  const supported = ['0.0.0', '0.0.429274'];

  it('returns the single supported catalog token', () => {
    expect(validateSingleTokenCatalogue([
      {PriceToken: '0.0.429274'},
      {PriceToken: '0.0.429274'},
    ], supported)).toBe('0.0.429274');
  });

  it('rejects empty, unsupported, and mixed-token catalogs', () => {
    expect(() => validateSingleTokenCatalogue([], supported)).toThrow('at least one product');
    expect(() => validateSingleTokenCatalogue([{PriceToken: '0.0.404'}], supported)).toThrow('unsupported');
    expect(() => validateSingleTokenCatalogue([
      {PriceToken: '0.0.0'},
      {PriceToken: '0.0.429274'},
    ], supported)).toThrow('same payment token');
  });
});
