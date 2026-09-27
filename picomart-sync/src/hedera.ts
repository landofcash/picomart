import { Contract, Interface, JsonRpcProvider, type Log } from 'ethers';
import type { HederaNetworkConfig } from './hederaConfig';
import { PICOMART_ABI } from './picomartAbi';

type ProviderEntry = { provider: JsonRpcProvider; rpcUrl: string };
const providerCache = new Map<string, ProviderEntry>();

type ContractEntry = { contract: Contract; rpcUrl: string; address: string };
const contractCache = new Map<string, ContractEntry>();

const picomartInterface = new Interface(PICOMART_ABI);

export function getPicomartInterface(): Interface {
  return picomartInterface;
}

export function getProvider(net: HederaNetworkConfig): JsonRpcProvider {
  const key = net.network;
  const existing = providerCache.get(key);
  if (existing && existing.rpcUrl === net.rpcUrl) return existing.provider;
  const provider = new JsonRpcProvider(net.rpcUrl);
  providerCache.set(key, { provider, rpcUrl: net.rpcUrl });
  console.info(`[Hedera:${net.network}] Initialized JSON-RPC provider (${net.rpcUrl})`);
  return provider;
}

export function getPicomartContract(net: HederaNetworkConfig): Contract {
  const key = net.network;
  const addr = net.contractAddress;
  const existing = contractCache.get(key);
  if (existing && existing.rpcUrl === net.rpcUrl && existing.address.toLowerCase() === addr.toLowerCase()) {
    return existing.contract;
  }
  const provider = getProvider(net);
  const contract = new Contract(addr, PICOMART_ABI, provider);
  contractCache.set(key, { contract, rpcUrl: net.rpcUrl, address: addr });
  console.info(`[Hedera:${net.network}] Initialized Picomart contract (${addr})`);
  return contract;
}

export async function fetchLogs(net: HederaNetworkConfig, fromBlock: number, toBlock: number): Promise<Log[]> {
  if (fromBlock > toBlock) {
    return [];
  }

  const fromTimestamp = await getBlockTimestamp(net, fromBlock);
  const baseUrl = net.mirrorNodeUrl.replace(/\/$/, '');
  let nextUrl = `${baseUrl}/api/v1/contracts/${net.contractAddress}/results/logs?timestamp=gte:${fromTimestamp}&order=asc&limit=100`;
  const logs: Log[] = [];

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`Mirror node logs request failed with status ${response.status}`);
    }

    const data = await response.json() as MirrorLogsResponse;
    let reachedUpperBlock = false;

    for (const log of data.logs ?? []) {
      const blockNumber = Number(log.block_number);
      const logIndex = Number(log.index ?? 0);
      if (blockNumber < fromBlock) {
        continue;
      }
      if (blockNumber > toBlock) {
        reachedUpperBlock = true;
        break;
      }

      logs.push({
        address: log.address,
        blockHash: log.block_hash,
        blockNumber,
        data: log.data,
        index: logIndex,
        logIndex,
        removed: false,
        topics: log.topics,
        transactionHash: log.transaction_hash,
        transactionIndex: Number(log.transaction_index ?? 0),
      } as unknown as Log);
    }

    if (reachedUpperBlock || !data.links?.next) {
      break;
    }

    nextUrl = new URL(data.links.next, baseUrl).toString();
  }

  return logs;
}

type MirrorLogEntry = {
  address: string;
  block_hash: string;
  block_number: number;
  data: string;
  index?: number;
  topics: string[];
  transaction_hash: string;
  transaction_index?: number;
};

type MirrorLogsResponse = {
  logs?: MirrorLogEntry[];
  links?: {
    next?: string | null;
  };
};

export type MirrorTopicMessageEntry = {
  consensus_timestamp: string;
  message: string;
  payer_account_id?: string | null;
  running_hash?: string;
  sequence_number: number | string;
  topic_id: string;
};

type MirrorTopicMessagesResponse = {
  messages?: MirrorTopicMessageEntry[];
  links?: {
    next?: string | null;
  };
};

async function getBlockTimestamp(net: HederaNetworkConfig, blockNumber: number): Promise<string> {
  const provider = getProvider(net);
  const block = await provider.getBlock(blockNumber);
  if (!block) {
    throw new Error(`Unable to load block ${blockNumber} from ${net.network} RPC`);
  }

  return `${block.timestamp}.000000000`;
}

export async function fetchTopicMessages(
  net: HederaNetworkConfig,
  topicId: string,
  afterSequenceNumber: number,
): Promise<MirrorTopicMessageEntry[]> {
  const baseUrl = net.mirrorNodeUrl.replace(/\/$/, '');
  const messages: MirrorTopicMessageEntry[] = [];

  for (let sequenceNumber = afterSequenceNumber + 1; ; sequenceNumber += 1) {
    const response = await fetch(`${baseUrl}/api/v1/topics/${topicId}/messages/${sequenceNumber}`);
    if (response.status === 404) {
      break;
    }
    if (!response.ok) {
      throw new Error(`Mirror node topic messages request failed with status ${response.status}`);
    }

    const message = await response.json() as MirrorTopicMessageEntry;
    messages.push(message);
  }

  return messages;
}

type MirrorContractResult = {
  hash?: string;
  timestamp?: string;
  contract_id?: string | null;
  result?: string;
};

type MirrorTransaction = {
  transaction_id?: string;
  transaction_hash?: string;
  consensus_timestamp?: string;
  parent_consensus_timestamp?: string | null;
  entity_id?: string | null;
  charged_tx_fee?: number;
  name?: string;
  result?: string;
};

export type AtomicBatchEvidence = {
  innerTransactionId: string;
  innerTransactionHash: string;
  outerTransactionId: string;
  outerTransactionHash?: string;
  outerConsensusTimestamp: string;
  outerPayerAccountId: string;
  outerTransactionType: 'ATOMICBATCH';
  outerResult: 'SUCCESS';
};

function canonicalTransactionId(value: string): string {
  return value.replace(/-(\d+)-(\d{9})$/, '@$1.$2');
}

function payerAccountIdFromTransactionId(value: string): string | null {
  const match = /^(\d+\.\d+\.\d+)@\d+\.\d{9}$/.exec(canonicalTransactionId(value));
  return match?.[1] ?? null;
}

async function fetchMirrorJson<T>(net: HederaNetworkConfig, path: string): Promise<T | null> {
  const response = await fetch(`${net.mirrorNodeUrl.replace(/\/$/, '')}${path}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Mirror node request failed with status ${response.status}`);
  return await response.json() as T;
}

export async function resolveAtomicBatchEvidence(
  net: HederaNetworkConfig,
  contractResultHash: string,
  expectedPayerAccountId?: string,
): Promise<AtomicBatchEvidence | null> {
  const result = await fetchMirrorJson<MirrorContractResult>(
    net,
    `/api/v1/contracts/results/${encodeURIComponent(contractResultHash)}`,
  );
  if (!result?.timestamp || result.hash?.toLowerCase() !== contractResultHash.toLowerCase() ||
      result.result !== 'SUCCESS' || (net.contractId && result.contract_id !== net.contractId)) {
    return null;
  }

  const innerResponse = await fetchMirrorJson<{ transactions?: MirrorTransaction[] }>(
    net,
    `/api/v1/transactions?timestamp=eq:${encodeURIComponent(result.timestamp)}`,
  );
  const inner = innerResponse?.transactions?.find(entry =>
    entry.consensus_timestamp === result.timestamp &&
    entry.name === 'CONTRACTCALL' &&
    entry.result === 'SUCCESS' &&
    entry.parent_consensus_timestamp &&
    entry.transaction_id &&
    (!net.contractId || entry.entity_id === net.contractId),
  );
  if (!inner?.transaction_id || !inner.parent_consensus_timestamp) return null;
  const innerId = canonicalTransactionId(inner.transaction_id);

  const parentResponse = await fetchMirrorJson<{ transactions?: MirrorTransaction[] }>(
    net,
    `/api/v1/transactions?timestamp=eq:${encodeURIComponent(inner.parent_consensus_timestamp)}`,
  );
  const outer = parentResponse?.transactions?.find(entry =>
    entry.consensus_timestamp === inner.parent_consensus_timestamp && entry.name === 'ATOMICBATCH',
  );
  if (!outer?.transaction_id || outer.result !== 'SUCCESS') return null;
  const outerTransactionId = canonicalTransactionId(outer.transaction_id);
  const outerPayerAccountId = payerAccountIdFromTransactionId(outerTransactionId);
  if (!outerPayerAccountId || (expectedPayerAccountId && outerPayerAccountId !== expectedPayerAccountId)) {
    return null;
  }

  return {
    innerTransactionId: innerId,
    innerTransactionHash: contractResultHash.toLowerCase(),
    outerTransactionId,
    outerTransactionHash: outer.transaction_hash
      ? (/^0x[0-9a-f]{96}$/i.test(outer.transaction_hash)
        ? outer.transaction_hash.toLowerCase()
        : Buffer.from(outer.transaction_hash, 'base64').toString('base64url'))
      : undefined,
    outerConsensusTimestamp: outer.consensus_timestamp!,
    outerPayerAccountId,
    outerTransactionType: 'ATOMICBATCH',
    outerResult: 'SUCCESS',
  };
}
