import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInput} from '../src/worker/input.ts';
import {design, seed} from './helpers.ts';
const input = {config: {...design, schemaVersion: 2, shopId: 'demo', catalogSeed: seed, network: 'moderato'}, brief: 'New shop',
  products: [{ProductId: seed, PriceToken: '0x20c0000000000000000000000000000000000000', Price: 123, Name: 'Product', Description: '', Image: ''}]};
test('live catalog numbers become exact decimal strings; unsafe numbers and fractional prices are rejected', () => {
  assert.equal(parseInput(input).products[0].Price, '123');
  for (const price of [9007199254740992, 1.1, -1, 0, '1e5', (2n ** 256n).toString()]) assert.throws(() => parseInput({...input, products: [{...input.products[0], Price: price}]}));
  assert.equal(parseInput({...input, products: [{...input.products[0], Price: '9007199254740993123456'}]}).products[0].Price, '9007199254740993123456');
});
