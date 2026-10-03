import type {InternalAccount} from "@/lib/crypto/types/InternalAccount.ts";
import type {ChainAdapter} from "@/lib/crypto/types/ChainAdapter.ts";
import {hederaAdapter} from "@/lib/crypto/providers/hederaAdapter.ts";
import type {NetworkId} from "@/context/wallet/types.ts";

// Adapter selection (default Hedera). WalletProvider can change it via setChainAdapter.
let adapter: ChainAdapter = hederaAdapter;

export function setChainAdapter(a: ChainAdapter) {
  adapter = a;
}

export function getChainAdapter(): ChainAdapter {
  return adapter;
}

export async function signMessageInternal(internalAccount: InternalAccount, message: string): Promise<Uint8Array> {
  return await adapter.signMessageInternal(internalAccount, message);
}

export async function generateAccount(): Promise<InternalAccount> {
  return await adapter.generateAccount();
}

export async function accountFromMnemonic(mnemonic: string): Promise<InternalAccount> {
  return await adapter.accountFromMnemonic(mnemonic);
}

export function accountToMnemonic(internalAccount: InternalAccount): string {
  const mnemonic = adapter.accountToMnemonic(internalAccount);
  if (!mnemonic) throw new Error("Failed to get mnemonic");
  return mnemonic;
}

export function mapNetworkName(name: string): NetworkId {
  return adapter.mapNetworkName(name);
}

export async function getAccountCoinAmount(address: string, coinType: string): Promise<bigint> {
  return await adapter.getAccountCoinAmount(address, coinType);
}

export function formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
  return adapter.formatCoinAmount(amount, decimals, maximumFractionDigits);
}

export async function requestDevnetFaucet(accountAddress: string, amountOctas: number): Promise<void> {
  return await adapter.requestDevnetFaucet(accountAddress, amountOctas);
}
