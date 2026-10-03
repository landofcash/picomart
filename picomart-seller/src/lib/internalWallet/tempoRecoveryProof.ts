import {clearItemKeys, decryptStorageItem, deriveItemKeys, encodeBase64, normalizeAndVerifyMasterSignature, prepareItem, validateStorageItem, ZkbytesClient, type StorageItem, type ZkbytesReference} from "@zkbytes/sdk";
import type {WalletAdapter} from "@/context/wallet/types";
import type {InternalWalletEncryptedSecret} from "./types";
import {decryptPrivateData, encryptPrivateData} from "./crypto";
import {assertTempoWalletRevision, tempoWalletRevision, tempoInternalWalletProvider} from "./providers/tempoInternalWalletProvider";

// Proof-only context. Catalog and order receiving contexts are a later design gate.
export const TEMPO_PROOF_PROFILE = "picomart-wallet-recovery-proof-v1";
export const TEMPO_PROOF_TEXT = "Picomart Tempo wallet recovery proof v1";
export interface TempoRecoveryProof {
  profile: typeof TEMPO_PROOF_PROFILE;
  chainId: 42431;
  address: string;
  receivingPublicKey: string;
  item: StorageItem;
  reference: ZkbytesReference | null;
}
export interface TempoProofFile {
  format: "picomart-tempo-proof-v1";
  encrypted: InternalWalletEncryptedSecret;
}
function identityMessage(address: string) {
  return ["Picomart wallet recovery proof", `Profile: ${TEMPO_PROOF_PROFILE}`, "Chain ID: 42431", `Account: ${address.toLowerCase()}`, "Purpose: Restore this test receiving key. No transaction is requested."].join("\n");
}
async function current(wallet: WalletAdapter, address: string) {
  if (wallet.chain !== "tempo" || await wallet.getNetwork?.() !== "moderato" || (await wallet.getAddress())?.toLowerCase() !== address.toLowerCase()) throw new Error("Select the same Tempo Moderato wallet used for this proof.");
}
async function protectedCurrent(wallet: WalletAdapter, address: string, before: number) {
  await current(wallet, address);
  const active = await tempoInternalWalletProvider.getActiveWallet("moderato");
  if (!active || active.locked) throw new Error("Unlock the Tempo wallet to continue.");
  assertTempoWalletRevision(before);
}
async function derive(wallet: WalletAdapter, address: string, message: string) {
  await current(wallet, address);
  const supplied = await wallet.signMessage(message);
  let normalized: Uint8Array | undefined;
  try {
    await current(wallet, address);
    normalized = normalizeAndVerifyMasterSignature(supplied, message, address);
    const keys = await deriveItemKeys(normalized);
    try { await current(wallet, address); return keys; }
    catch (error) { clearItemKeys(keys); throw error; }
  } finally { supplied.fill(0); normalized?.fill(0); }
}
export function configuredProofClient(): ZkbytesClient | null {
  const apiOrigin = import.meta.env.VITE_ZKBYTES_API_ORIGIN?.trim();
  const downloadOrigin = import.meta.env.VITE_ZKBYTES_DOWNLOAD_ORIGIN?.trim();
  if (!apiOrigin || !downloadOrigin || apiOrigin.includes("example.com") || downloadOrigin.includes("example.com")) return null;
  return new ZkbytesClient({apiOrigin, downloadOrigin});
}
export async function prepareTempoProof(wallet: WalletAdapter, client: ZkbytesClient | null): Promise<TempoRecoveryProof> {
  const before = tempoWalletRevision();
  const address = await wallet.getAddress();
  if (!address) throw new Error("Select a Tempo wallet first.");
  const identity = await derive(wallet, address, identityMessage(address));
  try {
    // Check serial repeated signatures before using a reproducible receiving identity.
    const repeated = await derive(wallet, address, identityMessage(address));
    try {
      if (encodeBase64(identity.signingPublicKey) !== encodeBase64(repeated.signingPublicKey) || encodeBase64(identity.encryptionPublicKey) !== encodeBase64(repeated.encryptionPublicKey)) throw new Error("This signer does not produce a reproducible receiving identity.");
    } finally { clearItemKeys(repeated); }
    const receivingPublicKey = encodeBase64(identity.encryptionPublicKey);
    const prepared = await prepareItem({
      plaintext: TEMPO_PROOF_TEXT, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), managers: [],
      recipientPublicKeys: [receivingPublicKey],
      signer: {address, signMessage: async message => { await current(wallet, address); return wallet.signMessage(message); }},
    });
    try {
      await protectedCurrent(wallet, address, before);
      return {profile: TEMPO_PROOF_PROFILE, chainId: 42431, address: address.toLowerCase(), receivingPublicKey, item: prepared.item, reference: client?.createReference(prepared.item) ?? null};
    } finally { clearItemKeys(prepared.keys); }
  } finally { clearItemKeys(identity); }
}
export async function exportTempoProof(proof: TempoRecoveryProof, passphrase: string): Promise<TempoProofFile> {
  if (passphrase.length < 8) throw new Error("Use a recovery-file password of at least 8 characters.");
  return {format: "picomart-tempo-proof-v1", encrypted: await encryptPrivateData(passphrase, proof)};
}
export async function importTempoProof(file: unknown, passphrase: string): Promise<TempoRecoveryProof> {
  if (!file || typeof file !== "object" || !("format" in file) || file.format !== "picomart-tempo-proof-v1" || !("encrypted" in file)) throw new Error("Invalid Tempo recovery file.");
  const proof = await decryptPrivateData<TempoRecoveryProof>(file.encrypted as InternalWalletEncryptedSecret, passphrase);
  if (!proof || proof.profile !== TEMPO_PROOF_PROFILE || proof.chainId !== 42431 || !/^0x[0-9a-f]{40}$/.test(proof.address)) throw new Error("Unsupported Tempo recovery proof.");
  const item = validateStorageItem(proof.item);
  if (!item.encryptedKeys.some(key => key.publicKey === proof.receivingPublicKey)) throw new Error("The recovery recipient is missing.");
  if (proof.reference) {
    const client = clientFor(proof);
    if (JSON.stringify(client.createReference(item)) !== JSON.stringify(proof.reference)) throw new Error("The recovery reference does not match the prepared item.");
  }
  return {...proof, item};
}
function clientFor(proof: TempoRecoveryProof, client?: ZkbytesClient) {
  const ref = proof.reference;
  if (!ref) throw new Error("Prepare a new hosted proof after configuring the zkbytes service origins.");
  const selected = client ?? configuredProofClient();
  // Restored files cannot select arbitrary servers. Origins must match local configuration.
  if (!selected || selected.apiOrigin !== ref.apiOrigin || selected.downloadOrigin !== ref.downloadOrigin) throw new Error("Configure the same trusted zkbytes service origins used for this recovery file.");
  return selected;
}
export async function decryptTempoProof(wallet: WalletAdapter, proof: TempoRecoveryProof, remoteItem: StorageItem = proof.item): Promise<string> {
  const before = tempoWalletRevision();
  const keys = await derive(wallet, proof.address, identityMessage(proof.address));
  try {
    if (encodeBase64(keys.encryptionPublicKey) !== proof.receivingPublicKey) throw new Error("The restored wallet has a different receiving identity.");
    // Pin the original signature as well as creator/seed; recovery must keep the exact object.
    if (remoteItem.seed !== proof.item.seed || remoteItem.itemSignature.value !== proof.item.itemSignature.value) throw new Error("Downloaded object differs from the prepared proof.");
    const result = await decryptStorageItem(remoteItem, proof.item.creator, keys.encryptionPrivateKey);
    await protectedCurrent(wallet, proof.address, before);
    if (result.expired) throw new Error("The test object has expired. Prepare another proof.");
    if (result.plaintext !== TEMPO_PROOF_TEXT) throw new Error("The recovered test payload differs.");
    return result.plaintext;
  } finally { clearItemKeys(keys); }
}
export async function uploadTempoProof(wallet: WalletAdapter, proof: TempoRecoveryProof, selected?: ZkbytesClient): Promise<string> {
  const before = tempoWalletRevision();
  await decryptTempoProof(wallet, proof);
  await protectedCurrent(wallet, proof.address, before);
  const client = clientFor(proof, selected);
  const recovery = await client.recoverUpload(proof.item.seed, proof.item.creator);
  await protectedCurrent(wallet, proof.address, before);
  if (recovery.outcome === "active") { await decryptTempoProof(wallet, proof, recovery.item); return "Stored object recovered and decrypted."; }
  if (recovery.outcome !== "not-found") return `Stored object state: ${recovery.outcome}. The prepared item was retained.`;
  // Retrying sends the same prepared ciphertext and seed. Never prepare on a timeout.
  const response = await client.upload(proof.item);
  await protectedCurrent(wallet, proof.address, before);
  return "state" in response ? "Upload pending. Use Recover and decrypt later." : "Uploaded. Use Recover and decrypt to verify hosted storage.";
}
export async function downloadTempoProof(wallet: WalletAdapter, proof: TempoRecoveryProof, selected?: ZkbytesClient): Promise<string> {
  const before = tempoWalletRevision();
  await current(wallet, proof.address);
  const recovery = await clientFor(proof, selected).recoverUpload(proof.item.seed, proof.item.creator);
  await current(wallet, proof.address);
  if (recovery.outcome !== "active") throw new Error(`Stored object state: ${recovery.outcome}. The prepared item was retained.`);
  const result = await decryptTempoProof(wallet, proof, recovery.item);
  await protectedCurrent(wallet, proof.address, before);
  return result;
}
