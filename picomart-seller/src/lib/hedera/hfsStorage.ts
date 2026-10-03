import type {WalletAdapter} from "@/context/wallet/types.ts";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";
import {b64FromBytes, sha256} from "@/utils/encoding.ts";
import {
  FileAppendTransaction,
  FileContentsQuery,
  FileCreateTransaction,
  FileId,
  PublicKey,
} from "@hiero-ledger/sdk";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const FILE_CREATE_INLINE_LIMIT_BYTES = 2048;

function requireSignAndSubmit(walletAdapter: WalletAdapter) {
  if (!walletAdapter.signAndSubmit) {
    throw new Error("This wallet does not support Hedera file storage transactions.");
  }
  return walletAdapter.signAndSubmit.bind(walletAdapter);
}

async function requireWalletPublicKey(walletAdapter: WalletAdapter): Promise<PublicKey> {
  const publicKey = await walletAdapter.getPublicKey?.();
  if (!publicKey) {
    throw new Error("This wallet does not expose a Hedera public key for multi-part file uploads.");
  }

  return PublicKey.fromString(publicKey);
}

export async function hashEncryptedPayload(payload: string): Promise<string> {
  return b64FromBytes(await sha256(textEncoder.encode(payload)));
}

export async function uploadEncryptedPayloadToHfs(
  walletAdapter: WalletAdapter,
  payload: string,
): Promise<{fileId: string; payloadHash: string}> {
  const signAndSubmit = requireSignAndSubmit(walletAdapter);
  const payloadBytes = textEncoder.encode(payload);
  const payloadHash = await hashEncryptedPayload(payload);

  const firstChunk = payloadBytes.slice(0, FILE_CREATE_INLINE_LIMIT_BYTES);
  const createTransaction = new FileCreateTransaction().setContents(firstChunk);

  if (payloadBytes.length > FILE_CREATE_INLINE_LIMIT_BYTES) {
    createTransaction.setKeys([await requireWalletPublicKey(walletAdapter)]);
  }

  const createResult = await signAndSubmit(createTransaction);
  const fileId = createResult.fileId;
  if (!fileId) {
    throw new Error("Hedera file creation did not return a file ID.");
  }

  for (let offset = FILE_CREATE_INLINE_LIMIT_BYTES; offset < payloadBytes.length; offset += FILE_CREATE_INLINE_LIMIT_BYTES) {
    const chunk = payloadBytes.slice(offset, offset + FILE_CREATE_INLINE_LIMIT_BYTES);
    const appendTransaction = new FileAppendTransaction()
      .setFileId(fileId)
      .setContents(chunk);
    await signAndSubmit(appendTransaction);
  }

  return {fileId, payloadHash};
}

export async function loadEncryptedPayloadFromHfs(fileId: string, expectedPayloadHash: string): Promise<string> {
  const {sdkClient} = getHederaClient();
  const contents = await new FileContentsQuery()
    .setFileId(FileId.fromString(fileId))
    .execute(sdkClient);
  const payloadBytes = new Uint8Array(contents);
  const actualPayloadHash = b64FromBytes(await sha256(payloadBytes));

  if (actualPayloadHash !== expectedPayloadHash) {
    throw new Error("HFS payload hash does not match the HCS reference.");
  }

  return textDecoder.decode(payloadBytes);
}

export async function loadEncryptedPayloadFromHfsWithWallet(
  walletAdapter: WalletAdapter,
  fileId: string,
  expectedPayloadHash: string,
): Promise<string> {
  if (!walletAdapter.readFileContents) {
    throw new Error("This wallet does not support Hedera file reads.");
  }

  const payloadBytes = await walletAdapter.readFileContents(fileId);
  const actualPayloadHash = b64FromBytes(await sha256(payloadBytes));

  if (actualPayloadHash !== expectedPayloadHash) {
    throw new Error("HFS payload hash does not match the HCS reference.");
  }

  return textDecoder.decode(payloadBytes);
}
