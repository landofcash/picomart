import {get, set} from "idb-keyval";
import {APP_KEY_PREFIX} from "@/config.ts";
import type {ChainId, NetworkId} from "@/context/wallet/types.ts";
import type {InternalWalletRecord, InternalWalletSecretMaterial} from "@/lib/internalWallet/types.ts";
import {decryptSecretMaterial} from "@/lib/internalWallet/crypto.ts";

type ActiveWalletMap = Record<string, string | null>;

const RECORDS_KEY = `${APP_KEY_PREFIX}_internal_wallet_records_v2`;
const ACTIVE_KEY = `${APP_KEY_PREFIX}_active_internal_wallet_v2`;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

type SessionEntry = {
  secret: InternalWalletSecretMaterial;
  expiresAt: number;
};

const sessions = new Map<string, SessionEntry>();

function activeMapKey(chain: ChainId, network: NetworkId) {
  return `${chain}:${network}`;
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [walletId, entry] of sessions.entries()) {
    if (entry.expiresAt <= now) {
      sessions.delete(walletId);
    }
  }
}

export async function loadWalletRecords(): Promise<InternalWalletRecord[]> {
  return (await get(RECORDS_KEY)) || [];
}

export async function saveWalletRecords(records: InternalWalletRecord[]) {
  await set(RECORDS_KEY, records);
}

export async function upsertWalletRecord(record: InternalWalletRecord) {
  const records = await loadWalletRecords();
  const index = records.findIndex(existing => existing.id === record.id);

  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }

  await saveWalletRecords(records);
}

export async function removeWalletRecord(walletId: string) {
  const records = await loadWalletRecords();
  await saveWalletRecords(records.filter(record => record.id !== walletId));
  sessions.delete(walletId);
}

export async function getWalletRecord(walletId: string): Promise<InternalWalletRecord | null> {
  const records = await loadWalletRecords();
  return records.find(record => record.id === walletId) ?? null;
}

export async function getActiveWalletId(chain: ChainId, network: NetworkId): Promise<string | null> {
  const activeMap: ActiveWalletMap = (await get(ACTIVE_KEY)) || {};
  return activeMap[activeMapKey(chain, network)] ?? null;
}

export async function setActiveWalletId(chain: ChainId, network: NetworkId, walletId: string | null) {
  const activeMap: ActiveWalletMap = (await get(ACTIVE_KEY)) || {};
  activeMap[activeMapKey(chain, network)] = walletId;
  await set(ACTIVE_KEY, activeMap);
}

export function cacheUnlockedSecret(walletId: string, secret: InternalWalletSecretMaterial) {
  sessions.set(walletId, {
    secret,
    expiresAt: Date.now() + SESSION_TIMEOUT_MS,
  });
}

export function getCachedUnlockedSecret(walletId: string): InternalWalletSecretMaterial | null {
  pruneExpiredSessions();
  const session = sessions.get(walletId);
  if (!session) {
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TIMEOUT_MS;
  return session.secret;
}

export function isWalletLocked(walletId: string): boolean {
  return getCachedUnlockedSecret(walletId) == null;
}

export function lockWalletSession(walletId: string) {
  sessions.delete(walletId);
}

export async function unlockWalletRecord(record: InternalWalletRecord, passphrase: string): Promise<InternalWalletSecretMaterial> {
  const secret = await decryptSecretMaterial(record.encryptedSecret, passphrase);
  cacheUnlockedSecret(record.id, secret);
  return secret;
}
