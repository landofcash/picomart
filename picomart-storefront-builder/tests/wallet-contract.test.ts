import test from 'node:test';
import assert from 'node:assert/strict';
import {bytesToHex, hexToBytes} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {aliceId, fixture} from './helpers.ts';

test('the operational internal-wallet raw UTF-8 signing contract establishes a builder session', async () => {
  const f = await fixture();
  try {
    const challenge = (await f.request('/auth/challenge', {method: 'POST', body: {accountId: aliceId}})).body.data;
    const signer = privateKeyToAccount(('0x' + '11'.repeat(32)) as `0x${string}`);
    // Same viem version and raw UTF-8 signing operation as the seller built-in Tempo wallet.
    const raw = bytesToHex(new TextEncoder().encode(challenge.message));
    const signatureBytes = hexToBytes(await signer.signMessage({message: {raw}}));
    const verified = await f.request('/auth/verify', {method: 'POST', body: {accountId: aliceId, challengeId: challenge.challengeId, signature: bytesToHex(signatureBytes)}});
    assert.equal(verified.status, 200);
    assert.equal((await f.request('/auth/session', {token: verified.body.data.token})).body.data.accountId, aliceId);
  } finally { await f.close(); }
});
