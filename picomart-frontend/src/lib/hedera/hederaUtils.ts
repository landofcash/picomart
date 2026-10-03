import {AccountId, ContractId, Mnemonic, PrivateKey} from "@hiero-ledger/sdk";
import {bytesToHex, hexToBytes, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {getConfig, getCurrentConfig} from "@/config";
import type {NetworkId} from "@/context/wallet/types.ts";
import type {InternalAccount} from "@/lib/crypto/types/InternalAccount.ts";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";
import PicomartAbi from "@/contracts/Picomart.json";
import {hederaEntityIdToSolidityAddress} from "@picomart/order-protocol";

export function toAccount(internal: InternalAccount) {
  const privateKeyHex = bytesToHex(internal.sk) as Hex;
  return privateKeyToAccount(privateKeyHex);
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
  return mnemonic.trim().replace(/\s+/g, " ");
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

export async function signMessage(internalAccount: InternalAccount, message: string): Promise<Uint8Array> {
  const account = toAccount(internalAccount);
  const raw = bytesToHex(new TextEncoder().encode(message));
  const signatureHex = await account.signMessage({message: {raw}});
  return hexToBytes(signatureHex);
}

export function formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
  const normalized = Number(amount) / Math.pow(10, decimals);
  return normalized.toLocaleString(undefined, {maximumFractionDigits});
}

function getNetworkConfig(network?: NetworkId) {
  return network ? getConfig(network) : getCurrentConfig();
}

function contractIdToEvmAddress(contractId: string): `0x${string}` {
  if (contractId.startsWith("0x")) {
    return contractId as `0x${string}`;
  }

  const address = hederaEntityIdToSolidityAddress(ContractId.fromString(contractId).toString());
  if (!address) throw new Error("Invalid packed Hedera contract address");
  return address;
}

function normalizeEvmAddress(address: string): `0x${string}` {
  return (address.startsWith("0x") ? address : `0x${address}`) as `0x${string}`;
}

export function getContractEvmAddress(network?: NetworkId): `0x${string}` {
  const config = getNetworkConfig(network);
  if (config.contractEvmAddress) {
    return normalizeEvmAddress(config.contractEvmAddress);
  }

  return contractIdToEvmAddress(config.contractAddress);
}

export async function getHcsTopicId(network?: NetworkId): Promise<string> {
  const {publicClient} = getHederaClient(network);

  return await publicClient.readContract({
    address: getContractEvmAddress(network),
    abi: PicomartAbi.abi,
    functionName: "hcsTopicId",
  }) as string;
}

export async function requireHcsTopicId(network?: NetworkId): Promise<string> {
  const topicId = (await getHcsTopicId(network)).trim();
  if (!/^\d+\.\d+\.\d+$/.test(topicId)) {
    throw new Error("HCS topic ID is not configured on-chain.");
  }
  return topicId;
}

export async function getAccountCoinAmount(address: string, coinId: string): Promise<bigint> {
  const base = getCurrentConfig().hedera.mirrorNodeUrl;
  const response = await fetch(`${base}/api/v1/accounts/${address}`);

  if (!response.ok) {
    if (response.status === 404) {
      return 0n;
    }
    throw new Error(`Mirror node error ${response.status}`);
  }

  const data = await response.json();
  if (coinId === "0.0.0") {
    return BigInt(data.balance.balance);
  }

  const token = (data.balance.tokens ?? []).find((item: {token_id: string}) => item.token_id === coinId);
  return token ? BigInt(token.balance) : 0n;
}

export async function getHederaAccountIdFromEvmAddress(evmAddress: string): Promise<AccountId> {
  const mirrorNodeUrl = getCurrentConfig().hedera.mirrorNodeUrl;
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
