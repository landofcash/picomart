import type { PicomartDeliveryDetailsV1, PicomartEncryptedDeliveryV1 } from "./schemas.js";
import { base64UrlToBytes, bytesToBase64Url } from "./binary.js";
import { PicomartDeliveryDetailsV1Schema, PicomartEncryptedDeliveryV1Schema } from "./schemas.js";
import { canonicalBytes, canonicalJson } from "./canonical.js";
import { PICOMART_NETWORK } from "./constants.js";

export function deliveryAad(orderSeed: string): Uint8Array {
  return canonicalBytes({
    version: 1,
    purpose: "picomart-order-delivery",
    network: PICOMART_NETWORK,
    orderSeed,
  });
}

export async function encryptDelivery(
  details: PicomartDeliveryDetailsV1,
  orderSeed: string,
  rawKey: Uint8Array,
  nonce: Uint8Array,
): Promise<PicomartEncryptedDeliveryV1> {
  const parsed = PicomartDeliveryDetailsV1Schema.parse(details);
  if (rawKey.length !== 32 || nonce.length !== 12) throw new Error("Invalid AES-256-GCM key or nonce length");
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(rawKey), "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: Uint8Array.from(nonce), additionalData: Uint8Array.from(deliveryAad(orderSeed)), tagLength: 128 },
    key,
    new TextEncoder().encode(canonicalJson(parsed)),
  ));
  return {
    version: 1,
    algorithm: "A256GCM",
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(encrypted.subarray(0, -16)),
    tag: bytesToBase64Url(encrypted.subarray(-16)),
  };
}

export async function decryptDelivery(
  envelope: PicomartEncryptedDeliveryV1,
  orderSeed: string,
  rawKey: Uint8Array,
): Promise<PicomartDeliveryDetailsV1> {
  const parsed = PicomartEncryptedDeliveryV1Schema.parse(envelope);
  if (rawKey.length !== 32) throw new Error("Invalid AES-256-GCM key length");
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(rawKey), "AES-GCM", false, ["decrypt"]);
  const ciphertext = base64UrlToBytes(parsed.ciphertext);
  const tag = base64UrlToBytes(parsed.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext); combined.set(tag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Uint8Array.from(base64UrlToBytes(parsed.nonce)), additionalData: Uint8Array.from(deliveryAad(orderSeed)), tagLength: 128 },
    key,
    combined,
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  const value = JSON.parse(text);
  const details = PicomartDeliveryDetailsV1Schema.parse(value);
  if (canonicalJson(details) !== text) throw new Error("Delivery plaintext is not RFC 8785 canonical JSON");
  return details;
}
