import { Contract, Interface, JsonRpcProvider, ZeroAddress, keccak256, toUtf8String } from 'ethers';
import { PICOMART_TEMPO_CONFIG } from '@picomart/order-protocol/tempo';
import { PICOMART_TEMPO_ABI, PICOMART_TEMPO_BUILD } from '@picomart/order-protocol/tempo-contract';
import * as protocol from '@picomart/order-protocol/tempo-protocol';
import { tempoAddress, tempoEntityId } from './tempoIdentity';

// Independently verified deployment. Does not enable frontend checkout.
export const TEMPO_SYNC_DEPLOYMENT = Object.freeze({
  chainId: 42431, address: '0x3c91183f0454eab6eff6f570ac402be278dbd6f4', block: 37694566,
});
export const tempoInterface = new Interface(PICOMART_TEMPO_ABI);
const zeroHash = '0x' + '00'.repeat(32);
type Context = ReturnType<typeof protocol.TempoOrderContextSchema.parse>;
export interface TempoCatalog {
  catalogId: string; seed: string; seller: string; sellerPublicKey: string;
  sellerIdentityId: string; catalogUrl: string;
}
export interface TempoMessage {
  messageType: number; sequence: number; author: string; commitment: string;
  buyerEnvelope: string; sellerEnvelope: string;
  transactionHash: string; blockNumber: number; transactionIndex: number; logIndex: number;
}
export interface TempoOrder {
  orderId: string; seed: string; version: number; catalogId: string; status: number;
  priceAmount: string; priceToken: string; seller: string; buyer: string; payer: string;
  buyerPublicKey: string; sellerPublicKey: string; buyerIdentityId: string; sellerIdentityId: string;
  buyerCommitment: string; sellerCommitment: string; createdTs: number; updatedTs: number;
  deadline: number; deleted: boolean; context: Context; messages: TempoMessage[];
  payment?: { transactionHash: string; blockNumber: number; payer: string; amount: string; token: string };
}
export interface TempoLog {
  address: string; blockNumber: number; blockHash: string; transactionHash: string;
  transactionIndex: number; index: number; data: string; topics: readonly string[]; removed?: boolean;
}
export interface TempoBlock { hash: string | null; timestamp: number }
export interface TempoReceipt {
  status: number | null; blockNumber: number; blockHash: string; hash: string;
  logs: readonly TempoLog[];
}
export interface TempoSource {
  chainId(): Promise<bigint>;
  head(): Promise<number>;
  code(block: number): Promise<string>;
  block(number: number): Promise<TempoBlock | null>;
  logs(from: number, to: number): Promise<TempoLog[]>;
  receipt(hash: string): Promise<TempoReceipt | null>;
  order(id: string, block: number): Promise<Record<string, unknown>>;
  catalog(id: string, block: number): Promise<Record<string, unknown>>;
  consumed(id: string, block: number): Promise<boolean>;
  escrow(token: string, block: number): Promise<bigint>;
  balance(token: string, block: number): Promise<bigint>;
}
export interface TempoProjection {
  throughBlock: number; blockHash: string;
  catalogs: Map<string, TempoCatalog>; deletedCatalogs: Set<string>; orders: Map<string, TempoOrder>; seen: Set<string>;
}
function equal(actual: unknown, expected: unknown, field: string): void {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) throw new Error(`Tempo evidence mismatch: ${field}`);
}
function identity(role: 'buyer' | 'seller', account: string, id: string, key: string) {
  return protocol.createTempoReceivingIdentity(protocol.createTempoReceivingContext({
    version: 1, profile: 'picomart-receiving-v1', chainId: 42431,
    contractAddress: TEMPO_SYNC_DEPLOYMENT.address, account: tempoAddress(account),
    ...(role === 'buyer' ? { role: 'buyer', orderSeed: protocol.tempoIdToSeed(id) } : { role: 'seller', catalogSeed: protocol.tempoIdToSeed(id) }),
  }), Buffer.from(key.slice(2), 'hex').toString('base64'));
}
const terminal = new Set([4, 6, 7, 8]);

/** Pure event projection; caller verifies receipt and canonical block first. */
export function applyTempoLog(state: TempoProjection, log: TempoLog, timestamp: number): void {
  equal(log.address, TEMPO_SYNC_DEPLOYMENT.address, 'emitting contract');
  if (log.removed) throw new Error('Removed Tempo event');
  const key = `${TEMPO_SYNC_DEPLOYMENT.chainId}:${TEMPO_SYNC_DEPLOYMENT.address}:${log.transactionHash}:${log.index}`;
  if (state.seen.has(key)) return;
  const event = tempoInterface.parseLog({ data: log.data, topics: [...log.topics] });
  if (!event) throw new Error('Unknown Tempo event');
  const a = event.args;
  if (event.name === 'CatalogCreated' || event.name === 'CatalogUpdated') {
    const catalogId = tempoEntityId(a.catalogId);
    const previous = state.catalogs.get(catalogId);
    if (event.name === 'CatalogCreated' && previous) throw new Error('Duplicate catalog creation');
    const seller = event.name === 'CatalogCreated' ? tempoAddress(a.seller) : previous?.seller;
    if (!seller) throw new Error('Catalog update without creation');
    equal(identity('seller', seller, catalogId, a.publicKey).identityId, a.identityId, 'catalog identity');
    state.catalogs.set(catalogId, { catalogId, seed: protocol.tempoIdToSeed(catalogId), seller,
      sellerPublicKey: a.publicKey, sellerIdentityId: a.identityId, catalogUrl: a.url });
    state.deletedCatalogs.delete(catalogId);
  } else if (event.name === 'CatalogDeleted') {
    const id = tempoEntityId(a.catalogId);
    if (!state.catalogs.delete(id)) throw new Error('Catalog deletion without creation');
    state.deletedCatalogs.add(id);
  } else if (event.name === 'OrderCreated') {
    const id = tempoEntityId(a.orderId), catalogId = tempoEntityId(a.catalogId);
    if (state.orders.has(id)) throw new Error('Consumed order ID reused');
    const catalog = state.catalogs.get(catalogId);
    if (!catalog) throw new Error('Order without catalog');
    equal(a.seller, catalog.seller, 'seller'); equal(a.sellerPublicKey, catalog.sellerPublicKey, 'seller snapshot key');
    equal(a.sellerIdentityId, catalog.sellerIdentityId, 'seller snapshot identity');
    const buyer = tempoAddress(a.buyer), seller = tempoAddress(a.seller);
    const buyerIdentity = identity('buyer', buyer, id, a.buyerPublicKey);
    const sellerIdentity = identity('seller', seller, catalogId, a.sellerPublicKey);
    equal(a.buyerIdentityId, buyerIdentity.identityId, 'buyer identity');
    equal(a.deadline, timestamp + 432000, 'creation deadline');
    if (BigInt(a.amount) <= 0n) throw new Error('Invalid order amount');
    state.orders.set(id, { orderId: id, seed: protocol.tempoIdToSeed(id), version: 1, catalogId,
      status: 1, priceAmount: String(a.amount), priceToken: tempoAddress(a.token), seller, buyer,
      payer: ZeroAddress, buyerPublicKey: a.buyerPublicKey, sellerPublicKey: a.sellerPublicKey,
      buyerIdentityId: a.buyerIdentityId, sellerIdentityId: a.sellerIdentityId,
      buyerCommitment: zeroHash, sellerCommitment: zeroHash, createdTs: timestamp, updatedTs: timestamp,
      deadline: Number(a.deadline), deleted: false, messages: [],
      context: protocol.TempoOrderContextSchema.parse({ version: 1, chainId: 42431,
        contractAddress: TEMPO_SYNC_DEPLOYMENT.address, catalogSeed: protocol.tempoIdToSeed(catalogId),
        orderSeed: protocol.tempoIdToSeed(id), buyerIdentity, sellerIdentity }),
    });
  } else if (event.name === 'OrderMessage') {
    const order = state.orders.get(tempoEntityId(a.orderId));
    if (!order || order.deleted) throw new Error('Message without active order');
    const messageType = Number(a.messageType), sequence = Number(a.sequence);
    const type = ({ 1: 'buyer-order', 2: 'seller-delivery', 3: 'seller-refusal' } as const)[messageType as 1 | 2 | 3];
    if (!type || sequence !== 1 || order.messages.some(m => m.messageType === messageType || (messageType !== 1 && m.messageType !== 1))) throw new Error('Invalid message sequence/type');
    if (order.status !== (messageType === 1 ? 1 : 2)) throw new Error('Message in invalid order state');
    const expected = { messageType: type, sequence };
    const binding = protocol.createTempoMessageBinding(order.context, expected);
    equal(a.author, binding.author, 'message author');
    const buyerEnvelope = toUtf8String(a.buyerEnvelope), sellerEnvelope = toUtf8String(a.sellerEnvelope);
    equal(protocol.tempoReferenceCommitment(binding, buyerEnvelope, sellerEnvelope, order.context, expected), a.commitment, 'message commitment');
    if (messageType === 1) order.buyerCommitment = a.commitment; else order.sellerCommitment = a.commitment;
    order.messages.push({ messageType, sequence, author: tempoAddress(a.author), commitment: a.commitment,
      buyerEnvelope, sellerEnvelope, transactionHash: log.transactionHash, blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex, logIndex: log.index });
  } else if (event.name.startsWith('Order')) {
    const order = state.orders.get(tempoEntityId(a.orderId));
    if (!order || order.deleted) throw new Error('Lifecycle event without active order');
    if (event.name === 'OrderDeleted') {
      if (!terminal.has(order.status)) throw new Error('Nonterminal deletion');
      equal(a.finalState, order.status, 'terminal tombstone'); order.deleted = true;
    } else {
      const transitions: Record<string, { from: number[]; to: number }> = {
        OrderPaid: { from: [1], to: 2 }, OrderDelivering: { from: [2], to: 3 },
        OrderCompleted: { from: [3], to: 4 }, OrderRefundRequested: { from: [3], to: 5 },
        OrderRefundedToBuyer: { from: [5], to: 6 }, OrderRefundedToSeller: { from: [5], to: 7 },
        OrderCanceled: { from: [1, 2], to: 8 },
      };
      const transition = transitions[event.name];
      if (!transition || !transition.from.includes(order.status)) throw new Error('Invalid order transition');
      order.status = transition.to; order.updatedTs = timestamp;
      order.deadline = [2, 3, 5].includes(order.status) ? timestamp + 432000 : 0;
      if (a.deadline !== undefined) equal(a.deadline, order.deadline, 'stage deadline');
      if (event.name === 'OrderPaid') {
        order.payer = tempoAddress(a.payer);
        order.payment = { transactionHash: log.transactionHash, blockNumber: log.blockNumber,
          payer: order.payer, amount: order.priceAmount, token: order.priceToken };
      }
    }
  } else if (!['OwnershipTransferred', 'OwnershipTransferStarted', 'PaymentTokenAllowed'].includes(event.name)) {
    throw new Error('Unsupported Tempo event');
  }
  state.seen.add(key);
}

export class TempoIndexer {
  private projection: TempoProjection | null = null;
  private running: Promise<void> | null = null;
  private error: string | null = null;
  private latest: number | null = null;
  private lastRun: string | null = null;
  private available = false;
  constructor(private readonly source: TempoSource, private readonly pageSize = 2000,
    private readonly runtimeHash: string = PICOMART_TEMPO_BUILD.runtimeBytecodeHash) {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 2000) throw new Error('Invalid Tempo page size');
  }
  status() {
    return { ...TEMPO_SYNC_DEPLOYMENT, ready: this.available, latestBlock: this.latest,
      throughBlock: this.projection?.throughBlock ?? null,
      lag: this.latest !== null && this.projection ? Math.max(0, this.latest - this.projection.throughBlock) : null,
      lastRun: this.lastRun, error: this.error, replayOnRestart: true };
  }
  snapshot(): TempoProjection | null {
    // Callers cannot mutate the authoritative cache.
    return this.available && this.projection ? structuredClone(this.projection) : null;
  }
  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async run(): Promise<void> {
    try {
      equal(await this.source.chainId(), 42431, 'RPC chain');
      const head = await this.source.head(); this.latest = head;
      if (!Number.isSafeInteger(head) || head < TEMPO_SYNC_DEPLOYMENT.block) throw new Error('RPC head before deployment');
      const headBlock = await this.source.block(head);
      if (!headBlock?.hash) throw new Error('Replay head unavailable');
      equal(keccak256(await this.source.code(head)), this.runtimeHash, 'runtime');
      let previous = this.projection;
      if (previous) {
        if (head < previous.throughBlock) throw new Error('RPC head regressed');
        const anchor = await this.source.block(previous.throughBlock);
        if (!anchor?.hash || anchor.hash !== previous.blockHash) previous = null;
      }
      const state: TempoProjection = previous ? structuredClone(previous) : {
        throughBlock: TEMPO_SYNC_DEPLOYMENT.block - 1, blockHash: '',
        catalogs: new Map(), deletedCatalogs: new Set(), orders: new Map(), seen: new Set(),
      };
      const blocks = new Map<number, TempoBlock>([[head, headBlock]]);
      const block = async (number: number) => {
        if (!blocks.has(number)) {
          const value = await this.source.block(number);
          if (!value?.hash) throw new Error('Canonical block unavailable');
          blocks.set(number, value);
        }
        return blocks.get(number)!;
      };
      const receipts = new Map<string, TempoReceipt>();
      for (let from = state.throughBlock + 1; from <= head; from += this.pageSize) {
        const to = Math.min(from + this.pageSize - 1, head);
        let logs: TempoLog[] | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { logs = await this.source.logs(from, to); break; }
          catch { if (attempt === 2) throw new Error('Tempo log range unavailable after three attempts'); }
        }
        logs!.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.index - b.index);
        for (const log of logs!) {
          if (log.blockNumber < from || log.blockNumber > to) throw new Error('Out-of-range event');
          equal(log.blockHash, (await block(log.blockNumber)).hash, 'canonical event block');
          if (!receipts.has(log.transactionHash)) {
            const receipt = await this.source.receipt(log.transactionHash);
            if (!receipt) throw new Error('Receipt unavailable');
            receipts.set(log.transactionHash, receipt);
          }
          const receipt = receipts.get(log.transactionHash)!;
          equal(receipt.status, 1, 'receipt success'); equal(receipt.hash, log.transactionHash, 'receipt hash');
          equal(receipt.blockNumber, log.blockNumber, 'receipt block'); equal(receipt.blockHash, log.blockHash, 'receipt block hash');
          const receiptLog = receipt.logs.find(l => l.index === log.index);
          if (!receiptLog) throw new Error('Event missing from receipt');
          equal(receiptLog.address, log.address, 'receipt emitter'); equal(receiptLog.data, log.data, 'receipt data');
          equal(JSON.stringify(receiptLog.topics), JSON.stringify(log.topics), 'receipt topics');
          equal(receiptLog.transactionIndex, log.transactionIndex, 'receipt transaction index');
          applyTempoLog(state, log, (await block(log.blockNumber)).timestamp);
        }
      }
      // Reconcile at one fixed head. Never trust latest-state reads during historical replay.
      for (const [id, catalog] of state.catalogs) {
        const actual = await this.source.catalog(id, head);
        for (const field of ['seller', 'sellerPublicKey', 'sellerIdentityId', 'catalogUrl'] as const) equal(actual[field], catalog[field], `catalog ${field}`);
      }
      for (const id of state.deletedCatalogs) {
        equal((await this.source.catalog(id, head)).seller, ZeroAddress, 'deleted catalog');
      }
      const escrows = new Map<string, bigint>();
      escrows.set(PICOMART_TEMPO_CONFIG.tokens[0].tokenId.toLowerCase(), 0n);
      for (const [id, order] of state.orders) {
        equal(await this.source.consumed(id, head), true, 'consumed ID');
        const actual = await this.source.order(id, head);
        if (order.deleted) { equal(actual.version, 0, 'deleted version'); equal(actual.status, 0, 'deleted state'); }
        else for (const field of ['version', 'catalogId', 'status', 'priceAmount', 'priceToken', 'seller', 'buyer', 'payer',
          'buyerPublicKey', 'sellerPublicKey', 'buyerIdentityId', 'sellerIdentityId', 'buyerCommitment', 'sellerCommitment',
          'createdTs', 'updatedTs', 'deadline'] as const) equal(actual[field], order[field], `order ${field}`);
        escrows.set(order.priceToken, (escrows.get(order.priceToken) ?? 0n) +
          (!order.deleted && [2, 3, 5].includes(order.status) ? BigInt(order.priceAmount) : 0n));
        if (order.buyerCommitment === zeroHash) throw new Error('Order missing buyer reference');
        if ([3, 4, 5, 7].includes(order.status) && order.sellerCommitment === zeroHash) throw new Error('Order missing seller reference');
      }
      for (const [token, amount] of escrows) {
        equal(await this.source.escrow(token, head), amount, 'escrow');
        if (await this.source.balance(token, head) < amount) throw new Error('Unbacked escrow');
      }
      const finalBlock = await this.source.block(head);
      if (!finalBlock?.hash) throw new Error('Final block unavailable');
      equal(finalBlock.hash, (await block(head)).hash, 'stable replay head');
      state.throughBlock = head; state.blockHash = finalBlock.hash;
      this.projection = state; this.available = true; this.error = null; this.lastRun = new Date().toISOString();
    } catch (error) {
      this.available = false;
      // Do not expose RPC request bodies or encrypted envelopes in health/logs.
      this.error = 'Tempo indexing unavailable; retry pending';
      throw error;
    }
  }
}

export function createTempoSource(rpc = new JsonRpcProvider(PICOMART_TEMPO_CONFIG.rpcUrl)): TempoSource {
  const contract = new Contract(TEMPO_SYNC_DEPLOYMENT.address, PICOMART_TEMPO_ABI, rpc);
  return {
    chainId: async () => BigInt(await rpc.send('eth_chainId', [])),
    head: async () => Number(BigInt(await rpc.send('eth_blockNumber', []))),
    code: block => rpc.getCode(TEMPO_SYNC_DEPLOYMENT.address, block),
    block: number => rpc.getBlock(number),
    logs: (from, to) => rpc.getLogs({ address: TEMPO_SYNC_DEPLOYMENT.address, fromBlock: from, toBlock: to }),
    receipt: hash => rpc.getTransactionReceipt(hash),
    order: (id, block) => contract.getOrder(id, { blockTag: block }),
    catalog: (id, block) => contract.catalogs(id, { blockTag: block }),
    consumed: (id, block) => contract.consumedOrderIds(id, { blockTag: block }),
    escrow: (token, block) => contract.escrowedAmounts(token, { blockTag: block }),
    balance: (token, block) => new Contract(token, ['function balanceOf(address) view returns(uint256)'], rpc)
      .balanceOf(TEMPO_SYNC_DEPLOYMENT.address, { blockTag: block }),
  };
}
export const tempoIndexer = new TempoIndexer(createTempoSource());
export function initializeTempoSyncService(interval: number): void {
  if (!Number.isSafeInteger(interval) || interval < 1000) throw new Error('Invalid sync interval');
  const tick = () => { void tempoIndexer.tick().catch(() => console.error('Tempo sync unavailable; retry scheduled')); };
  tick(); setInterval(tick, interval).unref();
}
