import { config } from './config';
import { appDb } from './cache';
import type { HederaNetworkConfig } from './hederaConfig';
import { fetchLogs, fetchTopicMessages, getPicomartContract, getPicomartInterface, getProvider, resolveAtomicBatchEvidence, type MirrorTopicMessageEntry } from './hedera';
import { bytes32ToSeedString } from './seed';
import { bytes32ToHex } from './encoding';
import { mapCatalogRowToCacheEntry, mapOrderRowToCacheEntry } from './picomartRowMapping';
import type { CatalogCacheEntry, OrderCacheEntry, OrderMessageRef } from './types/types';
import { decodeHcsEnvelope, HCS_MESSAGE_ROLE, HCS_MESSAGE_TYPE } from './hcsEnvelope';
import { normalizeWalletId, resolveWalletAliases } from './walletIdentity';

let hederaSyncRunning = false;
let lastRunTime: Date | null = null;

export function initializeHederaSyncService(): void {
  console.log(`Hedera sync service started. Monitoring all configured networks. Interval: ${config.syncInterval} sec`);
  syncTick().catch(err => console.error('Initial Hedera sync tick failed:', err));
  setInterval(() => {
    syncTick().catch(err => console.error('Hedera sync tick failed:', err));
  }, config.syncInterval);
}

export function getHederaLastRunTime(): Date | null {
  return lastRunTime;
}

export async function triggerHederaSyncTick(): Promise<void> {
  await syncTick();
}

async function syncTick(): Promise<void> {
  if (hederaSyncRunning) return;
  hederaSyncRunning = true;
  try {
    console.log(`Hedera sync tick triggered. Last run: ${lastRunTime ? lastRunTime.toISOString() : 'never'}.`);
    const nets = config.getAllConfigs();
    for (const net of nets.values()) {
      if (!net.contractAddress || net.contractAddress === '0x') continue;
      await syncNetwork(net);
    }
    lastRunTime = new Date();
  } finally {
    hederaSyncRunning = false;
  }
}

async function syncNetwork(net: HederaNetworkConfig): Promise<void> {
  const cursorKey = `${net.network}:${net.contractAddress.toLowerCase()}`;
  const cur = (await appDb.getChainCursor(cursorKey)) || { blockNumber: net.startBlock, logIndex: -1 };

  const provider = getProvider(net);
  const latest = await provider.getBlockNumber();
  if (cur.blockNumber > latest) return;

  const logs = await fetchLogs(net, cur.blockNumber, latest);
  for (const log of logs) {
    const logIndex = Number((log as any).index ?? (log as any).logIndex ?? 0);
    if (log.blockNumber === cur.blockNumber && logIndex <= cur.logIndex) continue;

    await handleLog(net, log);

    cur.blockNumber = log.blockNumber;
    cur.logIndex = logIndex;
    await appDb.setChainCursor(cursorKey, { blockNumber: cur.blockNumber, logIndex: cur.logIndex });
  }

  await syncTopicMessages(net);
}

async function handleLog(net: HederaNetworkConfig, log: any): Promise<void> {
  const iface = getPicomartInterface();
  let parsed: any;
  try {
    parsed = iface.parseLog(log);
  } catch (err) {
    console.warn(`[handleLog] Failed to parse log on ${net.network}:`, {
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      data: log.data,
      topics: log.topics,
      error: err instanceof Error ? err.message : String(err)
    });
    return; // ignore unknown logs
  }

  const eventName: string = parsed?.name;
  const args: any = parsed?.args || {};
  const seedBytes32: string | undefined = args.seed;
  if (!eventName || !seedBytes32) {
    console.log(`[handleLog] Skipping log ${eventName || 'unknown'} on ${net.network} (seed missing: ${!seedBytes32})`, log);
    return;
  }

  if (eventName.startsWith('Catalog')) {
    const seed = bytes32ToSeedString(seedBytes32);
    if (eventName === 'CatalogDeleted') {
      await deleteCatalogFromCache(net.network, seed);
      return;
    }

    const catalog = await loadCatalogBySeed(net, seedBytes32);
    if (!catalog) {
      console.warn(`[handleLog] Catalog not found on contract for seed ${seed} on ${net.network}`);
      return;
    }
    await appDb.upsertCatalogs(catalog.sellerWallet, net.network, [catalog]);
    return;
  }

  if (eventName.startsWith('Order')) {
    const seed = bytes32ToSeedString(seedBytes32);
    if (eventName === 'OrderDeleted') {
      await deleteOrderFromCache(net.network, seed);
      return;
    }

    const order = await loadOrderBySeed(net, seedBytes32);
    if (!order) {
      console.warn(`[handleLog] Order not found on contract for seed ${seed} on ${net.network}`);
      return;
    }
    order.sourceNetwork = net.network;
    order.sourceContractId = net.contractId;
    order.sourceContractEvmAddress = net.contractAddress.toLowerCase();
    const cached = await appDb.findOrderBySeed(net.network, seed);
    if (cached) {
      order.messages = cached.messages;
      for (const field of [
        'innerTransactionId', 'innerTransactionHash', 'outerTransactionId', 'outerTransactionHash',
        'outerConsensusTimestamp', 'outerPayerAccountId', 'outerTransactionType', 'outerResult',
      ] as const) {
        if (cached[field] !== undefined) (order as any)[field] = cached[field];
      }
    }
    if ((eventName === 'OrderCreated' || eventName === 'OrderPaid') && log.transactionHash) {
      const payerAliases = await resolveWalletAliases(net, order.payer || order.buyer);
      const expectedPayer = payerAliases.find(alias => /^\d+\.\d+\.\d+$/.test(alias));
      const evidence = await resolveAtomicBatchEvidence(net, log.transactionHash, expectedPayer);
      if (evidence) Object.assign(order, evidence);
    }
    await appDb.upsertOrders(order.buyerWallet, net.network, [order]);
    return;
  }
  
  console.log(`[handleLog] Unhandled event type: ${eventName} on ${net.network}`);
}

async function loadCatalogBySeed(net: HederaNetworkConfig, seedBytes32: string): Promise<CatalogCacheEntry | null> {
  const contract = getPicomartContract(net);
  const row: any = await contract.catalogs(bytes32ToHex(seedBytes32));
  return mapCatalogRowToCacheEntry(seedBytes32, row);
}

async function loadOrderBySeed(net: HederaNetworkConfig, seedBytes32: string): Promise<OrderCacheEntry | null> {
  const contract = getPicomartContract(net);
  const row: any = await contract.orders(bytes32ToHex(seedBytes32));
  return mapOrderRowToCacheEntry(seedBytes32, row);
}

async function deleteCatalogFromCache(network: string, seed: string): Promise<void> {
  const stores = await appDb.getAllCatalogs(network);
  for (const store of stores) {
    const updated = store.catalogs.filter(c => c.seed !== seed);
    if (updated.length !== store.catalogs.length) {
      await appDb.upsertCatalogs(store.sellerWallet, network, updated, true);
    }
  }
}

async function deleteOrderFromCache(network: string, seed: string): Promise<void> {
  const stores = await appDb.getAllOrders(network);
  for (const store of stores) {
    const updated = store.orders.filter(o => o.seed !== seed);
    if (updated.length !== store.orders.length) {
      await appDb.upsertOrders(store.buyerWallet, network, updated, true);
    }
  }
}

async function syncTopicMessages(net: HederaNetworkConfig): Promise<void> {
  const topicId = await readTopicId(net);
  if (!topicId) {
    console.log(`[HCS][${net.network}] No on-chain topic configured; skipping HCS sync.`);
    return;
  }

  const cursorKey = `${net.network}:${topicId}`;
  const lastSequence = await appDb.getMessageCursor(cursorKey) ?? 0;
  const messages = await fetchTopicMessages(net, topicId, lastSequence);
  console.log(`[HCS][${net.network}] Topic ${topicId}: fetched ${messages.length} message(s) after seq ${lastSequence}.`);

  let maxSequence = lastSequence;
  for (const message of messages) {
    const sequenceNumber = Number(message.sequence_number);
    if (!Number.isFinite(sequenceNumber) || sequenceNumber <= 0) {
      console.warn(`[HCS][${net.network}] Ignoring message with invalid sequence number`, {
        topicId,
        sequenceNumber: message.sequence_number,
        consensusTimestamp: message.consensus_timestamp,
      });
      continue;
    }

    await maybeAttachTopicMessage(net, topicId, message);
    if (sequenceNumber > maxSequence) {
      maxSequence = sequenceNumber;
    }
  }

  if (maxSequence !== lastSequence) {
    await appDb.setMessageCursor(cursorKey, maxSequence);
  }
}

export async function readTopicId(net: HederaNetworkConfig): Promise<string> {
  const contract = getPicomartContract(net);
  const topicId = String(await contract.hcsTopicId());
  return topicId.trim();
}

async function maybeAttachTopicMessage(
  net: HederaNetworkConfig,
  topicId: string,
  message: MirrorTopicMessageEntry,
): Promise<void> {
  const sequenceNumber = Number(message.sequence_number);
  const payerAccountId = message.payer_account_id ? normalizeWalletId(message.payer_account_id) : '';
  if (!payerAccountId) {
    console.warn(`[HCS][${net.network}] Ignoring topic message without payer account`, {
      topicId,
      sequenceNumber,
      consensusTimestamp: message.consensus_timestamp,
    });
    return;
  }

  const rawMessage = Buffer.from(message.message, 'base64');
  const envelope = decodeHcsEnvelope(rawMessage);
  if (!envelope) {
    console.warn(`[HCS][${net.network}] Ignoring topic message with unsupported envelope format`, {
      topicId,
      sequenceNumber,
      sender: payerAccountId,
      consensusTimestamp: message.consensus_timestamp,
      rawBytes: rawMessage.length,
    });
    return;
  }

  const order = await appDb.findOrderBySeed(net.network, envelope.seed);
  if (!order) {
    console.warn(`[HCS][${net.network}] Ignoring topic message because no cached order matches seed`, {
      topicId,
      sequenceNumber,
      sender: payerAccountId,
      seed: envelope.seed,
      role: envelope.role,
      type: envelope.type,
    });
    return;
  }

  if (!isAllowedRoleType(envelope.role, envelope.type)) {
    console.warn(`[HCS][${net.network}] Ignoring topic message because role/type is not allowed`, {
      topicId,
      sequenceNumber,
      sender: payerAccountId,
      seed: envelope.seed,
      role: envelope.role,
      type: envelope.type,
      orderSeed: order.seed,
    });
    return;
  }

  const expectedSenderAliases = await getExpectedSenderAliases(net, order, envelope.role);
  if (!expectedSenderAliases.has(payerAccountId)) {
    console.warn(`[HCS][${net.network}] Ignoring topic message because sender does not match order role`, {
      topicId,
      sequenceNumber,
      sender: payerAccountId,
      seed: envelope.seed,
      role: envelope.role,
      type: envelope.type,
      orderBuyer: order.buyer,
      orderSeller: order.seller,
      expectedSenders: [...expectedSenderAliases],
    });
    return;
  }

  const ref: OrderMessageRef = {
    topicId,
    sequenceNumber,
    consensusTimestamp: message.consensus_timestamp,
    sender: payerAccountId,
    role: envelope.role,
    type: envelope.type,
  };

  await appDb.appendOrderMessageRef(net.network, order.seed, ref);
  console.log(`[HCS][${net.network}] Attached topic message to order`, {
    topicId,
    sequenceNumber,
    sender: payerAccountId,
    seed: order.seed,
    role: envelope.role,
    type: envelope.type,
  });
}

function isAllowedRoleType(role: number, type: number): boolean {
  if (role === HCS_MESSAGE_ROLE.buyer) {
    return type === HCS_MESSAGE_TYPE.buyerInitialOrder;
  }
  if (role === HCS_MESSAGE_ROLE.seller) {
    return type === HCS_MESSAGE_TYPE.sellerDelivery || type === HCS_MESSAGE_TYPE.sellerRefusal;
  }
  return false;
}

async function getExpectedSenderAliases(
  net: HederaNetworkConfig,
  order: OrderCacheEntry,
  role: number,
): Promise<Set<string>> {
  const wallet = role === HCS_MESSAGE_ROLE.buyer ? order.buyer : order.seller;
  const aliases = await resolveWalletAliases(net, wallet);
  return new Set(aliases.map(alias => normalizeWalletId(alias)));
}
