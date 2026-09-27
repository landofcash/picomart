import { CompressedSecp256k1PublicKeySchema } from "./schemas.js";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function publicKeyBase64ToContractBytes(value: string): Uint8Array {
  const publicKey = CompressedSecp256k1PublicKeySchema.parse(value);
  return new TextEncoder().encode(publicKey);
}

export function publicKeyBase64FromContractBytes(value: Uint8Array): string {
  return CompressedSecp256k1PublicKeySchema.parse(utf8Decoder.decode(value));
}
