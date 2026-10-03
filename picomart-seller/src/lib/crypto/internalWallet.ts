import type {InternalAccount} from "@/lib/crypto/types/InternalAccount.ts";
import {getCurrentConfig} from "@/config.ts";
import {hederaInternalWalletProvider} from "@/lib/internalWallet/providers/hederaInternalWalletProvider.ts";

export interface StoredAccount {
  addr: string;
  sk: number[];
  mnemonic?: string;
}

function getNetwork() {
  return getCurrentConfig().name;
}

function unsupportedWriteMessage() {
  return "Use the internal wallet UI flow with a passphrase. Legacy helper creation/import is no longer supported.";
}

export async function getActiveInternalWallet(): Promise<InternalAccount | null> {
  const activeWallet = await hederaInternalWalletProvider.getActiveWallet(getNetwork());
  if (!activeWallet) {
    return null;
  }

  return {
    addr: activeWallet.identity.evmAddress,
    sk: new Uint8Array(),
  };
}

export async function setActiveInternalWallet(addr: string) {
  const wallets = await hederaInternalWalletProvider.listWallets(getNetwork());
  const target = wallets.find(wallet =>
    wallet.identity.evmAddress === addr ||
    wallet.identity.address === addr ||
    wallet.identity.accountId === addr,
  );

  if (!target) {
    throw new Error("Internal wallet not found.");
  }

  await hederaInternalWalletProvider.activateWallet(getNetwork(), target.id);
}

export async function loadAllInternalWallets(): Promise<StoredAccount[]> {
  const wallets = await hederaInternalWalletProvider.listWallets(getNetwork());
  return wallets.map(wallet => ({
    addr: wallet.identity.evmAddress,
    sk: [],
  }));
}

export async function clearActiveInternalWallet() {
  await hederaInternalWalletProvider.disconnect(getNetwork());
}

export async function createInternalWallet(): Promise<InternalAccount> {
  throw new Error(unsupportedWriteMessage());
}

export async function loadInternalWalletByAddress(addr: string): Promise<InternalAccount | null> {
  const wallets = await hederaInternalWalletProvider.listWallets(getNetwork());
  const target = wallets.find(wallet =>
    wallet.identity.evmAddress === addr ||
    wallet.identity.address === addr ||
    wallet.identity.accountId === addr,
  );

  if (!target) {
    return null;
  }

  return {
    addr: target.identity.evmAddress,
    sk: new Uint8Array(),
  };
}

export async function importInternalWallet(): Promise<InternalAccount> {
  throw new Error(unsupportedWriteMessage());
}

export function exportInternalWallet(): string {
  throw new Error("Use the wallet backup flow to reveal recovery material.");
}

export async function clearInternalWallets() {
  const wallets = await hederaInternalWalletProvider.listWallets(getNetwork());
  await Promise.all(wallets.map(wallet => hederaInternalWalletProvider.removeWallet(getNetwork(), wallet.id)));
}

export async function removeInternalWallet(addr: string): Promise<void> {
  const wallets = await hederaInternalWalletProvider.listWallets(getNetwork());
  const target = wallets.find(wallet =>
    wallet.identity.evmAddress === addr ||
    wallet.identity.address === addr ||
    wallet.identity.accountId === addr,
  );

  if (!target) {
    return;
  }

  await hederaInternalWalletProvider.removeWallet(getNetwork(), target.id);
}
