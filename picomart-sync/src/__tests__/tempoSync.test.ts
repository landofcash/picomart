import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { keccak256, toUtf8Bytes, hexlify, ZeroAddress } from 'ethers';
import * as p from '@picomart/order-protocol/tempo-protocol';
import { TempoIndexer, TempoSource, TempoLog, TempoProjection, TEMPO_SYNC_DEPLOYMENT as deployment,
  tempoInterface, applyTempoLog } from '../tempoSync';
import { tempoAddress, tempoEntityId } from '../tempoIdentity';
import { createTempoRouter } from '../routes/tempo';
import { createApp } from '../server';

const start = deployment.block, buyer = '0x' + '11'.repeat(20), seller = '0x' + '22'.repeat(20), payer = '0x' + '44'.repeat(20);
const token = '0x20c0000000000000000000000000000000000000';
const cid = '0x' + '01'.repeat(16), oid = '0x' + '02'.repeat(16);
const key = '0x' + '05'.repeat(32), code = '0x6000', timestamp = 1800000000;
const blockHash = (n: number) => '0x' + n.toString(16).padStart(64, '0');
function identity(role: 'buyer' | 'seller') {
  return p.createTempoReceivingIdentity(p.createTempoReceivingContext({ version: 1, profile: 'picomart-receiving-v1',
    chainId: 42431, contractAddress: deployment.address, account: role === 'buyer' ? buyer : seller,
    ...(role === 'buyer' ? { role: 'buyer', orderSeed: p.tempoIdToSeed(oid) } : { role: 'seller', catalogSeed: p.tempoIdToSeed(cid) }),
  }), Buffer.from(key.slice(2), 'hex').toString('base64'));
}
const bi = identity('buyer'), si = identity('seller');
const context = p.TempoOrderContextSchema.parse({ version: 1, chainId: 42431, contractAddress: deployment.address,
  catalogSeed: p.tempoIdToSeed(cid), orderSeed: p.tempoIdToSeed(oid), buyerIdentity: bi, sellerIdentity: si });
function envelope(role: 'buyer' | 'seller') {
  const identity = role === 'buyer' ? bi : si;
  // Structurally valid ciphertext fixture; private decryption is intentionally outside indexing.
  return p.canonicalJson({ format: 'picomart-sealed-reference', version: 1, referenceProfile: 'picomart-sealed-reference-v1',
    context: role === 'buyer' ? 'aaaaaaaaaaaaaaaaaaaaaaaaaa' : 'bbbbbbbbbbbbbbbbbbbbbbbbba',
    recipientRole: role, recipientIdentityId: identity.identityId, recipientPublicKey: identity.publicKey,
    encryptedKey: Buffer.alloc(80, 7).toString('base64'),
    encryptedPayload: Buffer.alloc(12, 8).toString('base64') + ':' + Buffer.alloc(32, 9).toString('base64') });
}
const be = envelope('buyer'), se = envelope('seller');
function log(name: string, args: unknown[], index: number, blockNumber = start): TempoLog {
  const encoded = tempoInterface.encodeEventLog(tempoInterface.getEvent(name)!, args);
  return { ...encoded, address: deployment.address, blockNumber, blockHash: blockHash(blockNumber),
    transactionHash: '0x' + 'aa'.repeat(32), transactionIndex: 2, index };
}
function message(type: 1 | 2 | 3, index: number) {
  const messageType = ({ 1: 'buyer-order', 2: 'seller-delivery', 3: 'seller-refusal' } as const)[type];
  const binding = p.createTempoMessageBinding(context, { messageType, sequence: 1 });
  const commitment = p.tempoReferenceCommitment(binding, be, se, context, { messageType, sequence: 1 });
  return log('OrderMessage', [oid, type, type === 1 ? buyer : seller, 1, commitment, hexlify(toUtf8Bytes(be)), hexlify(toUtf8Bytes(se))], index);
}
function flow(ending: 'paid' | 'completed' | 'refused' | 'canceled' | 'buyer-refund' | 'seller-refund' = 'completed') {
  const logs = [log('CatalogCreated', [cid, seller, key, si.identityId, 'https://cdn.example.test/catalog.json'], 0),
    log('OrderCreated', [oid, buyer, seller, cid, token, 10000n, key, key, bi.identityId, si.identityId, timestamp + 432000], 1),
    message(1, 2), log('OrderPaid', [oid, payer, timestamp + 432000], 3)];
  if (ending === 'paid') return logs;
  if (ending === 'refused') return [...logs, message(3, 4), log('OrderCanceled', [oid], 5)];
  if (ending === 'canceled') return [...logs, log('OrderCanceled', [oid], 4)];
  logs.push(message(2, 4), log('OrderDelivering', [oid, timestamp + 432000], 5));
  if (ending === 'completed') logs.push(log('OrderCompleted', [oid], 6));
  else logs.push(log('OrderRefundRequested', [oid, timestamp + 432000], 6),
    log(ending === 'buyer-refund' ? 'OrderRefundedToBuyer' : 'OrderRefundedToSeller', [oid], 7));
  return logs;
}
function empty(): TempoProjection {
  return { throughBlock: start - 1, blockHash: '', catalogs: new Map(), deletedCatalogs: new Set(), orders: new Map(), seen: new Set() };
}
function fixture(logs = flow()) {
  const expected = empty(); logs.forEach(l => applyTempoLog(expected, l, timestamp));
  const control = { logs: [...logs], head: start + 5, chain: 42431n, code, failures: 0, requests: [] as number[][],
    receiptStatus: 1, receiptMissing: false, mismatch: false, anchorHash: '', balance: 10000n, escrow: logs.some(l => tempoInterface.parseLog(l)?.name === 'OrderPaid') && expected.orders.get(oid)?.status === 2 ? 10000n : 0n };
  const source: TempoSource = {
    chainId: async () => control.chain, head: async () => control.head, code: async () => control.code,
    block: async n => ({ hash: control.anchorHash || blockHash(n), timestamp }),
    logs: async (from, to) => { control.requests.push([from, to]); if (control.failures-- > 0) throw new Error('RPC'); return control.logs.filter(l => l.blockNumber >= from && l.blockNumber <= to); },
    receipt: async hash => control.receiptMissing ? null : { hash, status: control.receiptStatus, blockNumber: start,
      blockHash: blockHash(start), logs },
    order: async () => control.mismatch ? {} : expected.orders.get(oid)?.deleted ? { version: 0, status: 0 } : expected.orders.get(oid)! as unknown as Record<string, unknown>,
    catalog: async () => expected.catalogs.get(cid) as unknown as Record<string, unknown> ?? { seller: ZeroAddress },
    consumed: async () => true, escrow: async () => control.escrow, balance: async () => control.balance,
  };
  return { control, source, indexer: new TempoIndexer(source, 2, keccak256(code)), expected };
}

test('replay sorts and deduplicates logs; retains payer, encrypted references and public binding', async () => {
  const { control, indexer } = fixture();
  control.logs.reverse(); control.logs.push(control.logs[0]);
  await indexer.tick();
  const state = indexer.snapshot()!, order = state.orders.get(oid)!;
  assert.equal(order.status, 4); assert.equal(order.payer, payer); assert.equal(order.priceAmount, '10000');
  assert.equal(order.messages.length, 2); assert.equal(order.messages[0].buyerEnvelope, be);
  assert.equal(order.payment?.payer, payer); assert.equal(order.context.contractAddress, deployment.address);
  assert.equal(state.seen.size, 7); assert.equal(indexer.status().lag, 0);
  const text = JSON.stringify(order);
  for (const secret of ['downloadOrigin', 'expectedCreator', 'decryptionKey', 'zkbytesReference']) assert.equal(text.includes(secret), false);
  state.orders.clear(); assert.equal(indexer.snapshot()!.orders.size, 1);
});
test('fresh restart replays from deployment; incremental tick advances across empty ranges', async () => {
  const { indexer, source, control } = fixture(); await indexer.tick();
  control.requests.length = 0; control.head += 3; await indexer.tick();
  assert.equal(control.requests[0][0], start + 6);
  const next = new TempoIndexer(source, 2, keccak256(code)); control.requests.length = 0; await next.tick();
  assert.equal(control.requests[0][0], start); assert.deepEqual(next.snapshot(), indexer.snapshot());
});
test('overlapping ticks share one replay', async () => {
  const { indexer, control } = fixture(); const a = indexer.tick(), b = indexer.tick();
  assert.equal(a, b); await Promise.all([a, b]); assert.equal(control.requests.length, 3);
});
test('bounded retries and failed receipt hide projection; retry preserves cursor safely', async () => {
  const { indexer, control } = fixture(); control.failures = 2; await indexer.tick();
  assert.equal(control.requests.length, 5);
  control.chain = 1n; await assert.rejects(indexer.tick(), /chain/); assert.equal(indexer.snapshot(), null);
  control.chain = 42431n; await indexer.tick(); assert.equal(indexer.status().ready, true);
  const broken = fixture(); broken.control.receiptStatus = 0;
  await assert.rejects(broken.indexer.tick(), /receipt success/); assert.equal(broken.indexer.status().throughBlock, null);
});
test('missing receipt and unrelated receipt logs cannot establish payment', async () => {
  const f = fixture(); f.control.receiptMissing = true;
  await assert.rejects(f.indexer.tick(), /Receipt unavailable/);
  f.control.receiptMissing = false;
  f.source.receipt = async hash => ({ hash, status: 1, blockNumber: start, blockHash: blockHash(start), logs: [] });
  await assert.rejects(f.indexer.tick(), /missing from receipt/);
});
test('wrong runtime, wrong chain, RPC lag and state/escrow disagreement fail closed', async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.control.code = '0x6001'; },
    (f: ReturnType<typeof fixture>) => { f.control.chain = 1n; },
    (f: ReturnType<typeof fixture>) => { f.control.head = start - 1; },
    (f: ReturnType<typeof fixture>) => { f.control.mismatch = true; },
    (f: ReturnType<typeof fixture>) => { f.control.escrow = 1n; },
  ]) { const f = fixture(); change(f); await assert.rejects(f.indexer.tick()); assert.equal(f.indexer.snapshot(), null); }
  const paid = fixture(flow('paid')); paid.control.balance = 9999n; await assert.rejects(paid.indexer.tick(), /Unbacked/);
  const defaults = new TempoIndexer(fixture().source); await assert.rejects(defaults.tick(), /runtime/);
});
test('canonical hash change triggers replay; contradictory event blocks stay unavailable', async () => {
  const f = fixture(); await f.indexer.tick(); f.control.requests.length = 0;
  f.control.anchorHash = blockHash(1);
  await assert.rejects(f.indexer.tick(), /canonical event block/);
  assert.equal(f.control.requests[0][0], start); assert.equal(f.indexer.snapshot(), null);
});
test('a lagging RPC cannot replace a newer confirmed projection', async () => {
  const f = fixture(); await f.indexer.tick(); f.control.head--;
  await assert.rejects(f.indexer.tick(), /regressed/); assert.equal(f.indexer.snapshot(), null);
  assert.equal(f.indexer.status().throughBlock, start + 5);
});
test('failed final block check never publishes partially reconciled state', async () => {
  const f = fixture(); let reads = 0;
  f.source.block = async n => ({ hash: n === f.control.head && ++reads > 1 ? blockHash(1) : blockHash(n), timestamp });
  await assert.rejects(f.indexer.tick(), /stable replay head/);
  assert.equal(f.indexer.status().throughBlock, null);
});
test('retry exhaustion and out-of-range logs leave the cache unready', async () => {
  const f = fixture(); f.control.failures = 3;
  await assert.rejects(f.indexer.tick(), /three attempts/); assert.equal(f.control.requests.length, 3);
  f.source.logs = async () => [{ ...flow()[0], blockNumber: start - 1 }];
  await assert.rejects(f.indexer.tick(), /Out-of-range/);
});
test('catalog deletion is reconciled and existing orders keep historical seller identities', async () => {
  const logs = flow(); logs.push(log('CatalogDeleted', [cid], logs.length));
  const f = fixture(logs); await f.indexer.tick();
  assert.equal(f.indexer.snapshot()!.catalogs.size, 0);
  assert.equal(f.indexer.snapshot()!.orders.get(oid)!.context.sellerIdentity.identityId, si.identityId);
  f.source.catalog = async () => ({ seller }); f.control.head++;
  await assert.rejects(f.indexer.tick(), /deleted catalog/);
});
for (const ending of ['refused', 'canceled', 'buyer-refund', 'seller-refund'] as const) {
  test(`reconstruct ${ending} and preserve consumed-ID tombstone after deletion`, async () => {
    const events = flow(ending), finalState = ending === 'buyer-refund' ? 6 : ending === 'seller-refund' ? 7 : 8;
    events.push(log('OrderDeleted', [oid, finalState], events.length));
    const { indexer } = fixture(events); await indexer.tick();
    const order = indexer.snapshot()!.orders.get(oid)!;
    assert.equal(order.deleted, true); assert.equal(order.status, finalState); assert.equal(order.payment?.payer, payer);
    assert.equal(order.messages.length, ending === 'canceled' ? 1 : 2);
    const replay = indexer.snapshot()!;
    assert.throws(() => applyTempoLog(replay, log('OrderCreated', [oid, buyer, seller, cid, token, 10000n,
      key, key, bi.identityId, si.identityId, timestamp + 432000], 20), timestamp), /Consumed/);
  });
}
test('tampered envelope, emitter, identity and lifecycle fail projection', () => {
  const events = flow(); const state = empty(); events.slice(0, 2).forEach(l => applyTempoLog(state, l, timestamp));
  const bad = log('OrderMessage', [oid, 1, buyer, 1, '0x' + '00'.repeat(32), hexlify(toUtf8Bytes(be)), hexlify(toUtf8Bytes(se))], 2);
  assert.throws(() => applyTempoLog(state, bad, timestamp), /commitment/);
  assert.throws(() => applyTempoLog(empty(), { ...events[0], address: buyer }, timestamp), /emitting/);
  assert.throws(() => applyTempoLog(empty(), log('CatalogCreated', [cid, seller, key, '0x' + '00'.repeat(32), 'url'], 0), timestamp), /identity/);
  assert.throws(() => applyTempoLog(state, log('OrderCompleted', [oid], 10), timestamp), /transition/);
});
test('batch/sponsor top-level destination is not used as payer; only contract receipt events count', async () => {
  const { indexer } = fixture(flow('paid')); await indexer.tick();
  assert.equal(indexer.snapshot()!.orders.get(oid)!.payer, payer);
  assert.equal(indexer.snapshot()!.orders.get(oid)!.payment?.amount, '10000');
});
test('identity accepts canonical EVM addresses and nonzero IDs; rejects inherited aliases and zero', () => {
  assert.equal(tempoAddress(buyer), buyer); assert.equal(tempoEntityId(p.tempoIdToSeed(oid)), oid);
  for (const address of ['0.0.123', ZeroAddress, 'buyer.eth']) assert.throws(() => tempoAddress(address));
  for (const id of ['0x' + '00'.repeat(16), 'old-invalid-seed']) assert.throws(() => tempoEntityId(id));
});
test('API reports rebuild, wallet validation, public order/evidence and absent payments', async () => {
  const { indexer } = fixture();
  const app = express(); app.use(createTempoRouter(indexer));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + '/orders')).status, 503); await indexer.tick();
    assert.equal((await fetch(base + '/wallets/0.0.7')).status, 400);
    assert.equal((await fetch(base + '/orders/' + '0x' + 'ff'.repeat(16) + '/payment-evidence')).status, 404);
    const result = await (await fetch(base + '/orders/' + p.tempoIdToSeed(oid))).json() as any;
    assert.equal(result.data.chainId, 42431); assert.equal(result.data.order.status, 4);
    const evidence = await (await fetch(base + '/orders/' + oid + '/payment-evidence')).json() as any;
    assert.equal(evidence.data.payment.payer, payer); assert.equal(evidence.data.confirmation, 'receipt-and-state-verified');
    assert.equal((await fetch(base + '/orders/payer/' + payer)).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('active application disables inherited network and Circle APIs', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    for (const path of ['/api/v1/testnet/orders', '/api/mainnet/catalogs', '/api/circle/wallets']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 410);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/moderato/status`)).status, 503);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
