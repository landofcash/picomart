import {z} from "zod";
import {keccak_256} from "@noble/hashes/sha3";
import {base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url, hexToBytes} from "./binary.js";
import {canonicalJson} from "./canonical.js";

export const TEMPO_RECEIVING_PROFILE = "picomart-receiving-v1" as const;
export const TEMPO_MESSAGE_PROFILE = "picomart-message-v1" as const;
export const TEMPO_REFERENCE_PROFILE = "picomart-sealed-reference-v1" as const;
export const TEMPO_COMMITMENT_DOMAIN = "picomart-reference-commitment-v1" as const;
export const TEMPO_SDK_KEY_PROFILE = "zkbytes-wallet-eip191-hkdfsha256-ed25519-x25519-hpke-v1" as const;
export const TEMPO_SDK_WRAPPING = "zkbytes-hpke-x25519-hkdfsha256-aes256gcm-v1" as const;
export const TEMPO_SDK_SIGNATURE = "zkbytes-ed25519-v1" as const;
export const MAX_TEMPO_MESSAGE_BYTES = 131_072;
export const MAX_TEMPO_REFERENCE_BYTES = 4096;
export const MAX_TEMPO_ENVELOPE_BYTES = 8192;
export const utf8 = (value: string) => new TextEncoder().encode(value);
export const bytesHex = (bytes: Uint8Array): `0x${string}` => `0x${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
export const tempoKeccak = (bytes: Uint8Array) => bytesHex(keccak_256(bytes));
export const TempoChainIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const TempoAddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/).refine(value => value !== `0x${"0".repeat(40)}`, "zero address is not supported");
export const TempoHashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
export const TempoIdSchema = z.string().regex(/^0x[0-9a-f]{32}$/).refine(value => value !== `0x${"0".repeat(32)}`, "zero ID is not supported");
export const TempoSeedSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/).refine(value => {
  const bytes = base64UrlToBytes(value);
  return bytes.length === 16 && bytes.some(byte => byte !== 0) && bytesToBase64Url(bytes) === value;
}, "must be canonical nonzero 16-byte unpadded Base64URL");
// SDK 0.1.4 uses lowercase unpadded Base32; the last two bits are zero.
export const TempoStorageSeedSchema = z.string().regex(/^[a-z2-7]{25}[aeimquy4]$/);
export function tempoSeedToId(seed: string): `0x${string}` { return bytesHex(base64UrlToBytes(TempoSeedSchema.parse(seed))); }
export function tempoIdToSeed(id: string): string { return bytesToBase64Url(hexToBytes(TempoIdSchema.parse(id))); }
export function normalizeTempoAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Invalid EVM address");
  return TempoAddressSchema.parse(address.toLowerCase());
}
export function canonicalBase64(length: number) {
  return z.string().max(Math.ceil(length / 3) * 4).refine(value => {
    try { const bytes = base64ToBytes(value); return bytes.length === length && bytesToBase64(bytes) === value; }
    catch { return false; }
  }, `must be canonical padded Base64 for ${length} bytes`);
}
// Crypto operations must additionally use the SDK's point/key validation.
export const TempoPublicKeySchema = canonicalBase64(32).refine(value => base64ToBytes(value).some(byte => byte !== 0), "zero public key is not supported");
export const TempoAmountSchema = z.string().max(78).regex(/^(0|[1-9][0-9]*)$/).refine(value => BigInt(value) < 2n ** 256n, "amount exceeds uint256");
export const TempoTimestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).refine(value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace(".000Z", "Z") === value;
}, "must be canonical UTC with second precision");
export const TempoOriginSchema = z.string().max(512).refine(value => {
  try {
    const url = new URL(value);
    return value === url.origin && !url.username && !url.password &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch { return false; }
}, "must be a bare HTTPS origin or local development HTTP origin");
function wellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
export const limitedTempoText = (min: number, max: number) => z.string().max(max)
  .refine(wellFormedUnicode, "RFC 8785 text must not contain lone Unicode surrogates")
  .refine(value => utf8(value).length >= min && utf8(value).length <= max, `must encode to ${min}-${max} UTF-8 bytes`);
export function parseTempoCanonical<S extends z.ZodType>(text: string, schema: S, limit: number): z.output<S> {
  if (text.length > limit || utf8(text).length > limit) throw new Error("Tempo payload exceeds its byte limit");
  const parsed = schema.parse(JSON.parse(text));
  // Also rejects duplicate JSON keys, whitespace, alternative escapes and number encodings.
  if (canonicalJson(parsed) !== text) throw new Error("Tempo payload must be RFC 8785 canonical JSON");
  return parsed;
}
export function serializeTempoCanonical<S extends z.ZodType>(value: unknown, schema: S, limit: number): string {
  const text = canonicalJson(schema.parse(value));
  parseTempoCanonical(text, schema, limit);
  return text;
}
