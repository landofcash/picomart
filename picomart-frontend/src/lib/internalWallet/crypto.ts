import {argon2id} from "hash-wasm";
import type {InternalWalletEncryptedSecret, InternalWalletSecretMaterial} from "@/lib/internalWallet/types.ts";
import {b64FromBytes, b64ToBytes, hexToBytes} from "@/utils/encoding.ts";
import {bytesToHex} from "viem";

type Argon2Params = {
  iterations: number;
  parallelism: number;
  memorySize: number;
  hashLength: number;
};

const ARGON2_DEFAULTS: Argon2Params = {
  iterations: 3,
  parallelism: 1,
  memorySize: 19_456,
  hashLength: 32,
};

function assertBrowserCrypto() {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Secure browser cryptography is not available in this environment.");
  }
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: Argon2Params = ARGON2_DEFAULTS,
): Promise<CryptoKey> {
  assertBrowserCrypto();

  const keyBytes = await argon2id({
    password: passphrase,
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: "binary",
  });

  const ownedKeyBytes = Uint8Array.from(keyBytes);
  try {
    return await crypto.subtle.importKey("raw", ownedKeyBytes, {name: "AES-GCM"}, false, ["encrypt", "decrypt"]);
  } finally {
    ownedKeyBytes.fill(0);
    keyBytes.fill(0);
  }
}

export async function encryptPrivateData<T>(
  passphrase: string,
  secretMaterial: T,
): Promise<InternalWalletEncryptedSecret> {
  assertBrowserCrypto();

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const payload = new TextEncoder().encode(JSON.stringify(secretMaterial));

  const cipherBuffer = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, payload);

  return {
    version: 1,
    ivBase64: b64FromBytes(iv),
    saltBase64: b64FromBytes(salt),
    cipherTextBase64: b64FromBytes(new Uint8Array(cipherBuffer)),
    kdf: {
      algorithm: "argon2id",
      iterations: ARGON2_DEFAULTS.iterations,
      parallelism: ARGON2_DEFAULTS.parallelism,
      memorySize: ARGON2_DEFAULTS.memorySize,
      hashLength: ARGON2_DEFAULTS.hashLength,
    },
  };
}

export async function decryptPrivateData<T>(
  encryptedSecret: InternalWalletEncryptedSecret,
  passphrase: string,
): Promise<T> {
  assertBrowserCrypto();

  if (encryptedSecret.version !== 1 || encryptedSecret.kdf?.algorithm !== "argon2id" ||
    encryptedSecret.kdf.iterations !== ARGON2_DEFAULTS.iterations || encryptedSecret.kdf.parallelism !== ARGON2_DEFAULTS.parallelism ||
    encryptedSecret.kdf.memorySize !== ARGON2_DEFAULTS.memorySize || encryptedSecret.kdf.hashLength !== ARGON2_DEFAULTS.hashLength) {
    throw new Error("Unsupported encrypted wallet data.");
  }

  const salt = b64ToBytes(encryptedSecret.saltBase64);
  const iv = Uint8Array.from(b64ToBytes(encryptedSecret.ivBase64));
  const cipherText = Uint8Array.from(b64ToBytes(encryptedSecret.cipherTextBase64));
  if (salt.length !== 16 || iv.length !== 12 || cipherText.length > 1_000_000) throw new Error("Invalid encrypted wallet data.");
  const key = await deriveKey(passphrase, salt, encryptedSecret.kdf);

  try {
    const plainBuffer = await crypto.subtle.decrypt({name: "AES-GCM", iv}, key, cipherText);
    return JSON.parse(new TextDecoder().decode(plainBuffer)) as T;
  } catch {
    throw new Error("Incorrect passphrase.");
  }
}

export const encryptSecretMaterial = (passphrase: string, secret: InternalWalletSecretMaterial) => encryptPrivateData(passphrase, secret);
export const decryptSecretMaterial = (encrypted: InternalWalletEncryptedSecret, passphrase: string) => decryptPrivateData<InternalWalletSecretMaterial>(encrypted, passphrase);

export function normalizePrivateKeyHex(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;

  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Private key must be a 32-byte hex string.");
  }

  return normalized.toLowerCase();
}

export function privateKeyHexToBytes(privateKeyHex: string): Uint8Array {
  return hexToBytes(normalizePrivateKeyHex(privateKeyHex));
}

export function privateKeyBytesToHex(privateKeyBytes: Uint8Array): string {
  return bytesToHex(privateKeyBytes).replace(/^0x/, "");
}
