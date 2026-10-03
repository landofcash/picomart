import type {InternalAccount} from '@/lib/crypto/types/InternalAccount.ts';
import {bytesToHex, hexToBytes, type Address, type Hex,} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {getConfig, getCurrentConfig} from "@/config.ts";
import type {NetworkId} from "@/context/wallet/types.ts";
import {AccountId, ContractId, Mnemonic, PrivateKey} from "@hiero-ledger/sdk";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";
import PicomartAbi from "@/contracts/Picomart.sol/Picomart.json";

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function getHederaAccountIdFromEvmAddress(evmAddress: string): Promise<AccountId> {
  const config = getCurrentConfig();
  const mirrorNodeUrl = config.hedera.mirrorNodeUrl;

  const response = await fetch(`${mirrorNodeUrl}/api/v1/accounts/${evmAddress}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch account info from mirror node: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.account) {
    throw new Error(`No Hedera account found for EVM address: ${evmAddress}`);
  }
  return AccountId.fromString(data.account);
}

/**
 * Signs the provided message bytes (raw) using ECDSA (secp256k1).
 *
 * Note: this produces a standard EIP-191 personal_sign signature.
 */
export async function signMessage(internalAccount: InternalAccount, message: string): Promise<Uint8Array> {
  const account = toAccount(internalAccount);
  const raw = bytesToHex(new TextEncoder().encode(message));
  const sigHex = await account.signMessage({message: {raw}});
  return hexToBytes(sigHex);
}

/**
 * Converts your InternalAccount to a viem LocalAccount.
 *
 * InternalAccount.sk is expected to be a 32-byte ECDSA private key.
 */
export function toAccount(internal: InternalAccount) {
  const pkHex = bytesToHex(internal.sk) as Hex;
  return privateKeyToAccount(pkHex);
}

export function fromAccount(address: Address, privateKeyHex: Hex, mnemonic?: string): InternalAccount {
  return {
    addr: address,
    sk: hexToBytes(privateKeyHex),
    mnemonic,
  };
}

export async function generateAccount(): Promise<InternalAccount> {
  const mnemonic = await Mnemonic.generate();
  return await internalAccountFromMnemonic(mnemonic);
}

export async function accountFromMnemonic(mnemonic: string): Promise<InternalAccount> {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  const parsedMnemonic = await Mnemonic.fromString(normalizedMnemonic);
  return await internalAccountFromMnemonic(parsedMnemonic, normalizedMnemonic);
}

export function accountToMnemonic(internalAccount: InternalAccount): string | undefined {
  return internalAccount.mnemonic;
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, ' ');
}

async function internalAccountFromMnemonic(
  mnemonic: Mnemonic,
  mnemonicText = mnemonic.toString(),
): Promise<InternalAccount> {
  const privateKey = await mnemonic.toStandardECDSAsecp256k1PrivateKey();
  return internalAccountFromPrivateKey(privateKey, mnemonicText);
}

function internalAccountFromPrivateKey(privateKey: PrivateKey, mnemonic?: string): InternalAccount {
  const privateKeyHex = bytesToHex(privateKey.toBytesRaw()) as Hex;
  const account = privateKeyToAccount(privateKeyHex);
  return fromAccount(account.address, privateKeyHex, mnemonic);
}

export function formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
  const num = typeof amount === 'bigint' ? Number(amount) : Number(amount);
  return (num / Math.pow(10, decimals)).toLocaleString(undefined, {maximumFractionDigits});
}

function getNetworkConfig(network?: NetworkId) {
  return network ? getConfig(network) : getCurrentConfig();
}

function contractIdToEvmAddress(contractId: string): `0x${string}` {
  if (contractId.startsWith('0x')) {
    return contractId as `0x${string}`;
  }

  return `0x${ContractId.fromString(contractId).toSolidityAddress()}` as `0x${string}`;
}

export async function getHcsTopicId(network?: NetworkId): Promise<string> {
  const config = getNetworkConfig(network);
  const {publicClient} = getHederaClient(network);

  return await publicClient.readContract({
    address: contractIdToEvmAddress(config.account),
    abi: PicomartAbi.abi,
    functionName: 'hcsTopicId',
  }) as string;
}

export async function requireHcsTopicId(network?: NetworkId): Promise<string> {
  const topicId = (await getHcsTopicId(network)).trim();
  if (!/^\d+\.\d+\.\d+$/.test(topicId)) {
    throw new Error('HCS topic ID is not configured on-chain.');
  }
  return topicId;
}

export async function getAccountCoinAmount(address: string, coinId: string): Promise<bigint> {
  const base = getCurrentConfig().hedera.mirrorNodeUrl;
  const res = await fetch(`${base}/api/v1/accounts/${address}`);
  if (!res.ok) {
    if (res.status === 404) {
      return 0n;
    }
    throw new Error(`Mirror node error ${res.status}`);
  }
  const data = await res.json();
  if (coinId === "0.0.0") {
    return BigInt(data.balance.balance);
  }
  const tokens = data.balance.tokens ?? [];
  const token = tokens.find((t: { token_id: string; }) => t.token_id === coinId);
  return token ? BigInt(token.balance) : 0n;
}

export function toMirrorTxId(txId: string): string {
  // Already mirror format: 0.0.x-sss-nnn
  if (txId.includes("-")) return txId;

  // Hashscan format: 0.0.x@sss.nnn
  const [account, time] = txId.split("@");
  if (!account || !time) return txId;

  const [seconds, nanos] = time.split(".");
  if (!seconds || !nanos) return txId;

  return `${account}-${seconds}-${nanos}`;
}

export async function getTopicIdFromTx(txId: string): Promise<string> {
  let retries = 5;
  const base = getCurrentConfig().hedera.mirrorNodeUrl;
  const mirrorTxId = toMirrorTxId(txId);

  while (retries-- > 0) {
    await sleep(3000);
    try {
      const res = await fetch(`${base}/api/v1/transactions/${mirrorTxId}`);
      if (!res.ok) {
        continue;
      }

      const entityId = (await res.json())?.transactions?.[0]?.entity_id;
      if (entityId) return entityId;
    } catch (err) {
      console.warn(
        `[mirror] attempt failed for tx ${mirrorTxId}, retries left=${retries}`,
        err instanceof Error ? err.message : err
      );
    }
  }
  throw new Error(`Topic ID not found for tx ${txId}`);
}
