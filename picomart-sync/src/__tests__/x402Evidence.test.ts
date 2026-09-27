import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHcsEnvelope, encodeHcsReferenceEnvelope, HCS_MESSAGE_ROLE, HCS_MESSAGE_TYPE } from '../hcsEnvelope';
import { resolveAtomicBatchEvidence } from '../hedera';
import type { HederaNetworkConfig } from '../hederaConfig';

const seed = 'AAAAAAAAAAAAAAAAAAAAAA';
const contractResultHash = '0x' + 'ab'.repeat(32);
const contractTimestamp = '1700000001.000000003';
const parentTimestamp = '1700000001.000000002';
const net: HederaNetworkConfig = {
  network: 'testnet',
  rpcUrl: 'https://rpc.example.test',
  mirrorNodeUrl: 'https://mirror.example.test',
  contractAddress: '0x01b6d4a28bf0300ce1dbe039a762bf28278f199b',
  contractId: '0.0.7565091',
  startBlock: 0,
  blockBatchSize: 100,
};

function contractResult(overrides: Record<string, unknown> = {}) {
  return {
    hash: contractResultHash,
    timestamp: contractTimestamp,
    contract_id: net.contractId,
    result: 'SUCCESS',
    ...overrides,
  };
}

function innerTransaction(overrides: Record<string, unknown> = {}) {
  return {
    transaction_id: '0.0.7-1700000000-000000001',
    consensus_timestamp: contractTimestamp,
    parent_consensus_timestamp: parentTimestamp,
    entity_id: net.contractId,
    name: 'CONTRACTCALL',
    result: 'SUCCESS',
    ...overrides,
  };
}

function outerTransaction(overrides: Record<string, unknown> = {}) {
  return {
    transaction_id: '0.0.7-1700000000-000000000',
    transaction_hash: Buffer.alloc(48, 5).toString('base64'),
    consensus_timestamp: parentTimestamp,
    name: 'ATOMICBATCH',
    result: 'SUCCESS',
    ...overrides,
  };
}

async function resolveWithResponses(responses: unknown[], expectedPayer = '0.0.7') {
  const originalFetch = global.fetch;
  const requests: string[] = [];
  global.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    const response = responses.shift();
    if (response === undefined) throw new Error('Unexpected Mirror Node request');
    return Response.json(response);
  }) as typeof fetch;
  try {
    return {
      evidence: await resolveAtomicBatchEvidence(net, contractResultHash, expectedPayer),
      requests,
    };
  } finally {
    global.fetch = originalFetch;
  }
}

test('shared HCS codec preserves v1 and indexes frontend-compatible v2 references', () => {
  const legacy = Buffer.concat([Buffer.from([1]), Buffer.from(seed), Buffer.from([1, 1]), Buffer.from('cipher')]);
  assert.deepEqual(decodeHcsEnvelope(legacy), {
    version: 1, seed, role: 1, type: 1, payloadKind: 'legacyText', encryptedPayload: 'cipher',
  });
  const v2 = encodeHcsReferenceEnvelope(seed, HCS_MESSAGE_ROLE.buyer, HCS_MESSAGE_TYPE.buyerInitialOrder, {
    fileId: '0.0.123', total: '100', token: '0.0.0', payloadHash: Buffer.alloc(32, 4).toString('base64'),
  });
  assert.deepEqual(decodeHcsEnvelope(v2), {
    version: 2, seed, role: 1, type: 1, payloadKind: 'reference',
    reference: { fileId: '0.0.123', total: '100', token: '0.0.0', payloadHash: Buffer.alloc(32, 4).toString('base64') },
  });
});

test('contract result correlates through the inner record to its successful parent atomic batch', async () => {
  const responses = [
    contractResult(),
    { transactions: [innerTransaction()] },
    { transactions: [outerTransaction()] },
  ];
  const { evidence, requests } = await resolveWithResponses(responses);
  assert.deepEqual(evidence, {
    innerTransactionId: '0.0.7@1700000000.000000001',
    innerTransactionHash: contractResultHash,
    outerTransactionId: '0.0.7@1700000000.000000000',
    outerTransactionHash: Buffer.alloc(48, 5).toString('base64url'),
    outerConsensusTimestamp: parentTimestamp,
    outerPayerAccountId: '0.0.7',
    outerTransactionType: 'ATOMICBATCH',
    outerResult: 'SUCCESS',
  });
  assert.deepEqual(requests, [
    `${net.mirrorNodeUrl}/api/v1/contracts/results/${contractResultHash}`,
    `${net.mirrorNodeUrl}/api/v1/transactions?timestamp=eq:${contractTimestamp}`,
    `${net.mirrorNodeUrl}/api/v1/transactions?timestamp=eq:${parentTimestamp}`,
  ]);
});

test('incomplete or mismatched Mirror Node records remain proof pending', async () => {
  const scenarios = [
    {
      name: 'missing contract result timestamp',
      responses: [contractResult({ timestamp: undefined })],
    },
    {
      name: 'wrong contract result',
      responses: [contractResult({ contract_id: '0.0.999' })],
    },
    {
      name: 'wrong inner contract',
      responses: [contractResult(), { transactions: [innerTransaction({ entity_id: '0.0.999' })] }],
    },
    {
      name: 'missing parent timestamp',
      responses: [contractResult(), { transactions: [innerTransaction({ parent_consensus_timestamp: null })] }],
    },
    {
      name: 'failed parent',
      responses: [
        contractResult(),
        { transactions: [innerTransaction()] },
        { transactions: [outerTransaction({ result: 'FAIL_INVALID' })] },
      ],
    },
    {
      name: 'non-batch parent',
      responses: [
        contractResult(),
        { transactions: [innerTransaction()] },
        { transactions: [outerTransaction({ name: 'CONTRACTCALL' })] },
      ],
    },
    {
      name: 'payer mismatch',
      responses: [
        contractResult(),
        { transactions: [innerTransaction()] },
        { transactions: [outerTransaction({ transaction_id: '0.0.8-1700000000-000000000' })] },
      ],
    },
  ];

  for (const scenario of scenarios) {
    const { evidence } = await resolveWithResponses([...scenario.responses]);
    assert.equal(evidence, null, scenario.name);
  }
});
