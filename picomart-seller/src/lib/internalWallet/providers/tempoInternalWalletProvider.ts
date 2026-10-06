import {TEMPO_UI_DEPLOYMENT,TEMPO_UI_ENABLED} from "@/lib/tempoDeployment";
import {Wallet} from "ethers";
import {createTempoTransactionService, type TempoTransactionServiceOptions} from "../tempoTransactions";
import {createPublicClient, formatUnits, hexToBytes, http, parseAbi, type Hex} from "viem";
import {english, generateMnemonic, mnemonicToAccount, privateKeyToAccount} from "viem/accounts";
import {validateMnemonic} from "@scure/bip39";
import {assertTempoChainId, PICOMART_TEMPO_CONFIG} from '@picomart/config';

import type {InternalWalletProvider} from "../provider";
import type {InternalWalletRecord, InternalWalletSecretMaterial, InternalWalletStatus} from "../types";
import {decryptSecretMaterial, encryptSecretMaterial, normalizePrivateKeyHex} from "../crypto";
import {cacheUnlockedSecret, getActiveWalletId, getCachedUnlockedSecret, getWalletRecord, isWalletLocked, loadWalletRecords, lockWalletSession, removeWalletRecord, setActiveWalletId, upsertWalletRecord} from "../store";
import {requestInternalWalletPassphrase} from "../unlockGate";
import {ACCOUNT_CURRENCIES} from '../currencies';

export const TEMPO_HD_PATH = "m/44'/60'/0'/0/0";
const PROVIDER_ID = "tempo-internal";
const NETWORK = PICOMART_TEMPO_CONFIG.network;
// Invalidates work already waiting for decryption, an unlock dialog, or RPC.
let revision = 0;
const sessionIds=new Set<string>();
if(typeof window!=="undefined")window.addEventListener("pagehide",()=>{revision++;for(const id of sessionIds)lockWalletSession(id);});
export function tempoWalletRevision() { return revision; }
export function assertTempoWalletRevision(expected: number) {
  if (revision !== expected) throw new Error("Wallet changed or locked during this action. Try again.");
}
const client = createPublicClient({transport: http(PICOMART_TEMPO_CONFIG.rpcUrl)});
const tokenAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

function networkOnly(network: string) {
  if (network !== NETWORK) throw new Error("This wallet supports Tempo Moderato testnet only.");
}
function protect(passphrase: string) {
  if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
}
async function recordFor(id: string) {
  const record = await getWalletRecord(id);
  if (!record || record.chain !== "tempo" || record.providerId !== PROVIDER_ID) throw new Error("Tempo wallet not found.");
  return record;
}
function accountFor(secret: InternalWalletSecretMaterial, record?: InternalWalletRecord) {
  const account = privateKeyToAccount(`0x${normalizePrivateKeyHex(secret.privateKeyHex)}`);
  if (record && account.address.toLowerCase() !== record.baseIdentity.evmAddress.toLowerCase()) throw new Error("Wallet backup does not match its address.");
  return account;
}
async function status(record: InternalWalletRecord): Promise<InternalWalletStatus> {
  return {
    id: record.id, providerId: PROVIDER_ID, chain: "tempo", network: NETWORK, label: record.label,
    lifecycleState: "local_only", identity: {...record.baseIdentity, address: record.baseIdentity.evmAddress, accountId: null},
    backupKinds: record.backupKinds, active: (await getActiveWalletId("tempo", NETWORK)) === record.id,
    locked: isWalletLocked(record.id), lastUsedAt: record.lastUsedAt, balances: [],
    bootstrapRequired: false, canTransact: TEMPO_UI_ENABLED && !isWalletLocked(record.id), bootstrapTitle: null,
    bootstrapMessage: "Commerce writes are controlled by the Tempo testnet migration configuration.",
  };
}
async function secretFor(record: InternalWalletRecord, passphrase?: string) {
  const before = revision;
  const cached = passphrase === undefined ? getCachedUnlockedSecret(record.id) : null;
  if (cached) {sessionIds.add(record.id);return cached;}
  const password = passphrase ?? await requestInternalWalletPassphrase({
    walletId: record.id, walletLabel: record.label, reason: "sign-message", reasonLabel: "Unlock Tempo wallet", network: NETWORK,
  });
  const secret = await decryptSecretMaterial(record.encryptedSecret, password);
  accountFor(secret, record);
  if (revision !== before) throw new Error("Wallet changed or locked during this action. Try again.");
  sessionIds.add(record.id);
  cacheUnlockedSecret(record.id, secret);
  return secret;
}
async function save(network: string, input: {passphrase: string; label?: string}, secret: InternalWalletSecretMaterial) {
  networkOnly(network);
  protect(input.passphrase);
  const account = accountFor(secret);
  const existing = (await loadWalletRecords()).find(r => r.providerId === PROVIDER_ID && r.baseIdentity.evmAddress.toLowerCase() === account.address.toLowerCase());
  if (existing) throw new Error("This Tempo address already exists. Unlock it or remove its local wallet before importing again.");
  const now = new Date().toISOString();
  const record: InternalWalletRecord = {
    id: crypto.randomUUID(), providerId: PROVIDER_ID, chain: "tempo", label: input.label?.trim() || "My account",
    createdAt: now, updatedAt: now, lastUsedAt: null,
    baseIdentity: {evmAddress: account.address, publicKey: account.publicKey, alias: null},
    networkStates: {[NETWORK]: {accountId: null, lifecycleState: "local_only"}},
    backupKinds: [secret.importedAs], encryptedSecret: await encryptSecretMaterial(input.passphrase, secret),
  };
  await upsertWalletRecord(record);
  sessionIds.add(record.id);
  await tempoInternalWalletProvider.activateWallet(network, record.id);
  cacheUnlockedSecret(record.id, secret);
  return status(record);
}
function transactionUnavailable(): never {
  throw new Error("Tempo transaction submission is not enabled until the contract migration is verified.");
}

export const tempoInternalWalletProvider: InternalWalletProvider = {
  id: PROVIDER_ID, chain: "tempo", displayName: "Picomart Tempo wallet",
  async listWallets(network) {
    networkOnly(network);
    return Promise.all((await loadWalletRecords()).filter(r => r.chain === "tempo" && r.providerId === PROVIDER_ID).map(status));
  },
  async getActiveWallet(network) {
    networkOnly(network);
    const id = await getActiveWalletId("tempo", network);
    return id ? status(await recordFor(id)) : null;
  },
  async createWallet(network, input) {
    networkOnly(network);
    const mnemonic = generateMnemonic(english, 256);
    const account = mnemonicToAccount(mnemonic, {path: TEMPO_HD_PATH});
    const key = account.getHdKey().privateKey;
    if (!key) throw new Error("Could not derive the wallet private key.");
    try {
      return await save(network, input, {privateKeyHex: Array.from(key, b => b.toString(16).padStart(2, "0")).join(""), mnemonic, importedAs: "mnemonic"});
    } finally { key.fill(0); }
  },
  async importWallet(network, input) {
    networkOnly(network);
    if (Boolean(input.mnemonic?.trim()) === Boolean(input.privateKey?.trim())) throw new Error("Provide either a recovery phrase or a private key.");
    if (input.mnemonic) {
      const mnemonic = input.mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
      if (!validateMnemonic(mnemonic, english)) throw new Error("Invalid English BIP-39 recovery phrase.");
      const key = mnemonicToAccount(mnemonic, {path: TEMPO_HD_PATH}).getHdKey().privateKey;
      if (!key) throw new Error("Could not derive the wallet private key.");
      try { return await save(network, input, {privateKeyHex: Array.from(key, b => b.toString(16).padStart(2, "0")).join(""), mnemonic, importedAs: "mnemonic"}); }
      finally { key.fill(0); }
    }
    return save(network, input, {privateKeyHex: normalizePrivateKeyHex(input.privateKey!), importedAs: "privateKey"});
  },
  async activateWallet(network, id) {
    networkOnly(network);
    const record = await recordFor(id);
    revision++;
    const previous = await getActiveWalletId("tempo", network);
    if (previous && previous !== id) lockWalletSession(previous);
    await setActiveWalletId("tempo", network, id);
    return status(record);
  },
  async disconnect(network) {
    networkOnly(network); revision++;
    const id = await getActiveWalletId("tempo", network);
    if (id) lockWalletSession(id);
    await setActiveWalletId("tempo", network, null);
  },
  async refreshWallet(network, id) {
    networkOnly(network);
    const before = revision;
    const record = await recordFor(id);
    assertTempoChainId(await client.getChainId());
    const balances = await Promise.all(ACCOUNT_CURRENCIES.map(async token => {
      const raw = await client.readContract({address: token.tokenId, abi: tokenAbi, functionName: "balanceOf", args: [record.baseIdentity.evmAddress as Hex]});
      return {tokenId: token.tokenId, symbol: token.symbol, decimals: token.decimals, raw, formatted: formatUnits(raw, token.decimals), associated: true};
    }));
    if (revision !== before) throw new Error("Wallet changed during the balance check.");
    return {...await status(record), balances};
  },
  async removeWallet(network, id) {
    networkOnly(network); await recordFor(id); revision++;
    if ((await getActiveWalletId("tempo", network)) === id) await setActiveWalletId("tempo", network, null);
    await removeWalletRecord(id);
  },
  async lockWallet(id) { await recordFor(id); revision++; lockWalletSession(id); },
  async unlockWallet(network, id, passphrase) {
    networkOnly(network); const record = await recordFor(id);
    await secretFor(record, passphrase); return status(record);
  },
  async changePassphrase(network, id, input) {
    networkOnly(network); protect(input.nextPassphrase);
    const record = await recordFor(id), before = revision;
    const secret = await secretFor(record, input.currentPassphrase);
    const encryptedSecret = await encryptSecretMaterial(input.nextPassphrase, secret);
    if (revision !== before) throw new Error("Wallet changed during passphrase protection.");
    await upsertWalletRecord({...record, encryptedSecret, updatedAt: new Date().toISOString()});
    return status(record);
  },
  async revealBackup(id, passphrase) {
    const before = revision;
    const secret = await secretFor(await recordFor(id), passphrase);
    assertTempoWalletRevision(before);
    if (isWalletLocked(id)) throw new Error("Unlock the wallet to reveal its backup.");
    return secret.mnemonic
      ? [{kind: "mnemonic", label: "Recovery phrase (Ethereum path m/44'/60'/0'/0/0)", value: secret.mnemonic}]
      : [{kind: "privateKey", label: "Private key", value: `0x${secret.privateKeyHex}`}];
  },
  async associateToken(network) { networkOnly(network); throw new Error("Tempo TIP-20 tokens do not use Hedera token association."); },
  getWalletAdapter(network) {
    networkOnly(network);
    return {
      chain: "tempo", id: PROVIDER_ID, name: "Picomart Tempo wallet",
      tempo: createTempoWalletTransactions({deployment:()=>TEMPO_UI_ENABLED ? TEMPO_UI_DEPLOYMENT : null}),
      async getAddress() { return (await tempoInternalWalletProvider.getActiveWallet(network))?.identity.evmAddress ?? null; },
      async getPublicKey() { return (await tempoInternalWalletProvider.getActiveWallet(network))?.identity.publicKey ?? null; },
      async getNetwork() { return NETWORK; },
      async connect() { return this.getAddress(); },
      async disconnect() { await tempoInternalWalletProvider.disconnect(network); },
      async signMessage(message) {
        const before = revision, id = await getActiveWalletId("tempo", network);
        if (!id) throw new Error("Select a Tempo wallet first.");
        const record = await recordFor(id), secret = await secretFor(record);
        if (before !== revision || id !== await getActiveWalletId("tempo", network)) throw new Error("Wallet changed during signing.");
        const signature = await accountFor(secret, record).signMessage({message});
        if (before !== revision || isWalletLocked(id) || id !== await getActiveWalletId("tempo", network)) throw new Error("Wallet changed or locked during signing.");
        return hexToBytes(signature);
      },
      async executeContract() { return transactionUnavailable(); },
      async executeBatch() { return transactionUnavailable(); },
      async signAndSubmit() { return transactionUnavailable(); },
    };
  },
};

/** Same provider/vault signing boundary for normal adapters and the isolated test page. */
export function createTempoWalletTransactions(options:Omit<TempoTransactionServiceOptions,"wallet">={}) {
  return createTempoTransactionService({...options,wallet:{
    async capture(){
      const current=await tempoInternalWalletProvider.getActiveWallet(NETWORK);
      if(!current||current.locked)throw new Error("Select and unlock a built-in Tempo wallet.");
      return {walletId:current.id,address:current.identity.evmAddress,revision};
    },
    async assert(session){
      assertTempoWalletRevision(session.revision);
      const current=await tempoInternalWalletProvider.getActiveWallet(NETWORK);
      if(!current||current.id!==session.walletId||current.locked||current.identity.evmAddress.toLowerCase()!==session.address.toLowerCase())throw new Error("Wallet changed or locked during this action.");
      assertTempoWalletRevision(session.revision);
    },
    async sign(session,transaction){
      assertTempoWalletRevision(session.revision);
      if(session.walletId!==await getActiveWalletId("tempo",NETWORK))throw new Error("Wallet changed before transaction signing.");
      const record=await recordFor(session.walletId),secret=getCachedUnlockedSecret(session.walletId);
      if(!secret)throw new Error("Unlock the Tempo wallet before signing.");
      const account=accountFor(secret,record);
      if(account.address.toLowerCase()!==session.address.toLowerCase())throw new Error("Wallet address differs from signing request.");
      assertTempoWalletRevision(session.revision);
      const signed=await new Wallet(`0x${normalizePrivateKeyHex(secret.privateKeyHex)}`).signTransaction(transaction);
      assertTempoWalletRevision(session.revision);
      if(isWalletLocked(session.walletId)||session.walletId!==await getActiveWalletId("tempo",NETWORK))throw new Error("Wallet changed or locked during transaction signing.");
      return signed;
    },
  }});
}
