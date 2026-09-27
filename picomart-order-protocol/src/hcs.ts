import { base64ToBytes, bytesToBase64, hexToBytes } from "./binary.js";
export const HCS_LEGACY_ENVELOPE_VERSION = 1;
export const HCS_REFERENCE_ENVELOPE_VERSION = 2;
export const HCS_MESSAGE_ROLE = { buyer: 1, seller: 2, admin: 3 } as const;
export const HCS_MESSAGE_TYPE = { buyerInitialOrder: 1, sellerDelivery: 2, sellerRefusal: 3 } as const;
const SEED_LENGTH = 22;
const OVERHEAD = 25;
const MAX_BYTES = 1024;

export type HcsReferencePayload = { fileId: string; total: string; token: string; payloadHash: string };
export type HcsEnvelope =
  | { version: 1; seed: string; role: number; type: number; payloadKind: "legacyText"; encryptedPayload: string }
  | { version: 2; seed: string; role: number; type: number; payloadKind: "reference"; reference: HcsReferencePayload };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const lengthPrefix = (value: string) => {
  const bytes = encoder.encode(value);
  if (bytes.length > 255) throw new Error("HCS reference field exceeds 255 bytes");
  return Uint8Array.from([bytes.length, ...bytes]);
};

export function encodeHcsReferenceEnvelope(seed: string, role: number, type: number, reference: HcsReferencePayload): Uint8Array {
  const seedBytes = encoder.encode(seed);
  const hash = reference.payloadHash.startsWith("0x") ? hexToBytes(reference.payloadHash) : base64ToBytes(reference.payloadHash);
  if (seedBytes.length !== SEED_LENGTH || hash.length !== 32) throw new Error("Invalid HCS seed or payload hash");
  const fields = [lengthPrefix(reference.fileId), lengthPrefix(reference.total), lengthPrefix(reference.token), hash];
  const payloadLength = fields.reduce((sum, field) => sum + field.length, 0);
  if (OVERHEAD + payloadLength > MAX_BYTES) throw new Error("HCS message exceeds 1024 bytes");
  const out = new Uint8Array(OVERHEAD + payloadLength);
  out[0] = 2; out.set(seedBytes, 1); out[23] = role; out[24] = type;
  let offset = OVERHEAD;
  for (const field of fields) { out.set(field, offset); offset += field.length; }
  return out;
}

export function decodeHcsEnvelope(bytes: Uint8Array): HcsEnvelope | null {
  try {
    if (bytes.length < OVERHEAD || bytes.length > MAX_BYTES || (bytes[0] !== 1 && bytes[0] !== 2)) return null;
    const seed = decoder.decode(bytes.slice(1, 23));
    if (encoder.encode(seed).length !== SEED_LENGTH) return null;
    const role = bytes[23], type = bytes[24];
    if (bytes[0] === 1) return { version: 1, seed, role, type, payloadKind: "legacyText", encryptedPayload: decoder.decode(bytes.slice(25)) };
    let offset = 25;
    const read = () => {
      if (offset >= bytes.length) throw new Error();
      const length = bytes[offset++], end = offset + length;
      if (end > bytes.length) throw new Error();
      const value = decoder.decode(bytes.slice(offset, end)); offset = end; return value;
    };
    const fileId = read(), total = read(), token = read();
    const hash = bytes.slice(offset);
    if (hash.length !== 32) return null;
    return { version: 2, seed, role, type, payloadKind: "reference", reference: { fileId, total, token, payloadHash: bytesToBase64(hash) } };
  } catch {
    return null;
  }
}
