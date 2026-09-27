import test from 'node:test';
import assert from 'node:assert/strict';
import { appDb } from '../cache.js';
import type { HederaNetworkConfig } from '../hederaConfig.js';
import { normalizeWalletId, resolveWalletAliases } from '../walletIdentity.js';

test('cache lookups are case-insensitive after wallet normalization', async () => {
  await appDb.clear();

  await appDb.upsertCatalogs('0xAbCdEf0000000000000000000000000000001234', 'testnet', [
    {
      seed: 'catalog-seed',
      version: 1,
      sellerWallet: '0xAbCdEf0000000000000000000000000000001234',
      catalogUrl: 'https://example.com/catalog.json',
      sellerPubKey: 'pub',
    },
  ]);

  const lower = await appDb.getCatalogsByWallet('0xabcdef0000000000000000000000000000001234', 'testnet');
  const upper = await appDb.getCatalogsByWallet('0xABCDEF0000000000000000000000000000001234', 'testnet');

  assert.ok(lower);
  assert.ok(upper);
  assert.equal(lower?.catalogs[0]?.seed, 'catalog-seed');
  assert.equal(upper?.catalogs[0]?.seed, 'catalog-seed');
});

test('resolveWalletAliases returns Hedera account and evm aliases from mirror node', async () => {
  const net: HederaNetworkConfig = {
    network: 'testnet',
    rpcUrl: 'https://testnet.hashio.io/api',
    mirrorNodeUrl: 'https://mirror.test',
    contractAddress: '0x123',
    startBlock: 0,
    blockBatchSize: 1000,
  };

  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://mirror.test/api/v1/accounts/0.0.1234');
    return new Response(JSON.stringify({
      account: '0.0.1234',
      alias: '0xabcdef0000000000000000000000000000001234',
      evm_address: '0xAbCdEf0000000000000000000000000000001234',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof global.fetch;

  try {
    const aliases = await resolveWalletAliases(net, '0.0.1234');
    assert.deepEqual(aliases.sort(), [
      '0.0.1234',
      '0xabcdef0000000000000000000000000000001234',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('normalizeWalletId trims and lowercases wallet identifiers', () => {
  assert.equal(normalizeWalletId('  0xAbC  '), '0xabc');
});
