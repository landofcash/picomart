import test from 'node:test';
import assert from 'node:assert/strict';

import { bytes32ToSeedString, seedStringToBytes32 } from '../seed.js';

test('seedStringToBytes32 pads with zeros and bytes32ToSeedString strips trailing zeros', () => {
  const seed = 'hello';
  const b32 = seedStringToBytes32(seed);
  assert.equal(b32.length, 66);
  assert.equal(bytes32ToSeedString(b32), seed);
});

test('seedStringToBytes32 truncates to 32 bytes', () => {
  const seed = 'a'.repeat(40);
  const b32 = seedStringToBytes32(seed);
  assert.equal(bytes32ToSeedString(b32), 'a'.repeat(32));
});
