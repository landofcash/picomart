// utils/internalWallet.ts
import {get, set} from 'idb-keyval'
import {accountFromMnemonic, generateAccount, accountToMnemonic} from "@/lib/crypto/cryptoUtils.ts";
import type {InternalAccount} from "@/lib/crypto/types/InternalAccount.ts";
import {APP_KEY_PREFIX} from "@/config.ts";

const WALLET_KEY = `${APP_KEY_PREFIX}_internal_wallets`
const ACTIVE_WALLET_KEY = `${APP_KEY_PREFIX}_active_internal_wallet`

export interface StoredAccount {
  addr: string
  sk: number[]
  mnemonic?: string
}

export async function getActiveInternalWallet(): Promise<InternalAccount | null> {
  const addr = await get(ACTIVE_WALLET_KEY)
  if (!addr) return null

  const all = await loadAllInternalWallets()
  const match = all.find(w => w.addr.toString() === addr)
  if (!match) return null

  return {
    addr: match.addr,
    sk: new Uint8Array(match.sk),
    mnemonic: match.mnemonic,
  }
}

export async function setActiveInternalWallet(addr: string) {
  await set(ACTIVE_WALLET_KEY, addr)
}

export async function loadAllInternalWallets(): Promise<StoredAccount[]> {
  return (await get(WALLET_KEY)) || []
}

export async function clearActiveInternalWallet() {
  await set(ACTIVE_WALLET_KEY, null)
}

export async function createInternalWallet(): Promise<InternalAccount> {
  const account = await generateAccount()
  const wallets = await loadAllInternalWallets()
  wallets.push({addr: account.addr, sk: Array.from(account.sk), mnemonic: account.mnemonic})
  await set(WALLET_KEY, wallets)
  await set(ACTIVE_WALLET_KEY, account.addr) // <-- set as active
  return account
}

export async function loadInternalWalletByAddress(addr: string): Promise<InternalAccount | null> {
  const wallets = await loadAllInternalWallets()
  const match = wallets.find(w => w.addr === addr)
  if (!match) return null
  return {
    addr: match.addr,
    sk: new Uint8Array(match.sk),
    mnemonic: match.mnemonic,
  }
}

export async function importInternalWallet(mnemonic: string): Promise<InternalAccount> {
  const acc = await accountFromMnemonic(mnemonic)
  const stored: StoredAccount = {addr: acc.addr.toString(), sk: Array.from(acc.sk)};
  const wallets = await loadAllInternalWallets();
  if (!wallets.find(w => w.addr === acc.addr.toString())) {
    wallets.push(stored);
    await set(WALLET_KEY, wallets);
  }
  await set(ACTIVE_WALLET_KEY, acc.addr);
  return acc;
}

export function exportInternalWallet(internalAccount: InternalAccount): string {
  try {
    return accountToMnemonic(internalAccount);
  } catch {
    return internalAccount.mnemonic || "";
  }
}

export async function clearInternalWallets() {
  await set(WALLET_KEY, [])
}

export async function removeInternalWallet(addr: string): Promise<void> {
  const wallets = await loadAllInternalWallets()
  const filtered = wallets.filter(w => w.addr !== addr)
  await set(WALLET_KEY, filtered)

  const active = await get(ACTIVE_WALLET_KEY)
  if (active === addr) {
    if (filtered.length > 0) {
      await set(ACTIVE_WALLET_KEY, filtered[0].addr)
    } else {
      await set(ACTIVE_WALLET_KEY, null)
    }
  }
}
