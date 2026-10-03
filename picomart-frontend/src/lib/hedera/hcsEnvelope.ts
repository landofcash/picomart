import {b64FromBytes, b64ToBytes, hexToBytes} from "@/utils/encoding.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const HCS_LEGACY_ENVELOPE_VERSION = 1;
export const HCS_REFERENCE_ENVELOPE_VERSION = 2;
export const HCS_ENVELOPE_SEED_LENGTH = 22;
export const HCS_ENVELOPE_OVERHEAD_BYTES = 1 + HCS_ENVELOPE_SEED_LENGTH + 1 + 1;
export const MAX_HCS_MESSAGE_BYTES = 1024;

export const HCS_MESSAGE_ROLE = {
  buyer: 1,
  seller: 2,
  admin: 3,
} as const;

export const HCS_MESSAGE_TYPE = {
  buyerInitialOrder: 1,
  sellerDelivery: 2,
  sellerRefusal: 3,
} as const;

export type HcsReferencePayload = {
  fileId: string;
  total: string;
  token: string;
  payloadHash: string;
};

export type HcsEnvelope =
  | {
    version: typeof HCS_LEGACY_ENVELOPE_VERSION;
    seed: string;
    role: number;
    type: number;
    payloadKind: "legacyText";
    encryptedPayload: string;
  }
  | {
    version: typeof HCS_REFERENCE_ENVELOPE_VERSION;
    seed: string;
    role: number;
    type: number;
    payloadKind: "reference";
    reference: HcsReferencePayload;
  };

function requireSeedBytes(seed: string): Uint8Array {
  const seedBytes = textEncoder.encode(seed);
  if (seedBytes.length !== HCS_ENVELOPE_SEED_LENGTH) {
    throw new Error(`Seed must encode to exactly ${HCS_ENVELOPE_SEED_LENGTH} bytes.`);
  }
  return seedBytes;
}

function encodeLengthPrefixedString(value: string): Uint8Array {
  const valueBytes = textEncoder.encode(value);
  if (valueBytes.length > 255) {
    throw new Error("HCS reference field exceeds the 255 byte limit.");
  }

  const bytes = new Uint8Array(1 + valueBytes.length);
  bytes[0] = valueBytes.length;
  bytes.set(valueBytes, 1);
  return bytes;
}

function decodeLengthPrefixedString(bytes: Uint8Array, offset: number): {value: string; nextOffset: number} | null {
  if (offset >= bytes.length) {
    return null;
  }

  const length = bytes[offset];
  const start = offset + 1;
  const end = start + length;
  if (end > bytes.length) {
    return null;
  }

  return {
    value: textDecoder.decode(bytes.slice(start, end)),
    nextOffset: end,
  };
}

function encodeReferencePayload(reference: HcsReferencePayload): Uint8Array {
  const fileIdBytes = encodeLengthPrefixedString(reference.fileId);
  const totalBytes = encodeLengthPrefixedString(reference.total);
  const tokenBytes = encodeLengthPrefixedString(reference.token);
  const payloadHashBytes = reference.payloadHash.startsWith("0x")
    ? hexToBytes(reference.payloadHash)
    : b64ToBytes(reference.payloadHash);

  if (payloadHashBytes.length !== 32) {
    throw new Error("HCS reference payloadHash must decode to exactly 32 bytes.");
  }

  const payloadBytes = new Uint8Array(fileIdBytes.length + totalBytes.length + tokenBytes.length + payloadHashBytes.length);
  let offset = 0;
  payloadBytes.set(fileIdBytes, offset);
  offset += fileIdBytes.length;
  payloadBytes.set(totalBytes, offset);
  offset += totalBytes.length;
  payloadBytes.set(tokenBytes, offset);
  offset += tokenBytes.length;
  payloadBytes.set(payloadHashBytes, offset);
  return payloadBytes;
}

function decodeReferencePayload(bytes: Uint8Array): HcsReferencePayload | null {
  let offset = 0;

  const fileId = decodeLengthPrefixedString(bytes, offset);
  if (!fileId) {
    return null;
  }
  offset = fileId.nextOffset;

  const total = decodeLengthPrefixedString(bytes, offset);
  if (!total) {
    return null;
  }
  offset = total.nextOffset;

  const token = decodeLengthPrefixedString(bytes, offset);
  if (!token) {
    return null;
  }
  offset = token.nextOffset;

  const payloadHashBytes = bytes.slice(offset);
  if (payloadHashBytes.length !== 32) {
    return null;
  }

  return {
    fileId: fileId.value,
    total: total.value,
    token: token.value,
    payloadHash: b64FromBytes(payloadHashBytes),
  };
}

function buildEnvelope(version: number, seed: string, role: number, type: number, payloadBytes: Uint8Array): Uint8Array {
  const seedBytes = requireSeedBytes(seed);
  const totalSizeBytes = HCS_ENVELOPE_OVERHEAD_BYTES + payloadBytes.length;
  if (totalSizeBytes > MAX_HCS_MESSAGE_BYTES) {
    throw new Error(
      `HCS message is too large (${totalSizeBytes} bytes). Maximum allowed size is ${MAX_HCS_MESSAGE_BYTES} bytes.`,
    );
  }

  const envelope = new Uint8Array(totalSizeBytes);
  envelope[0] = version;
  envelope.set(seedBytes, 1);
  envelope[1 + HCS_ENVELOPE_SEED_LENGTH] = role;
  envelope[1 + HCS_ENVELOPE_SEED_LENGTH + 1] = type;
  envelope.set(payloadBytes, HCS_ENVELOPE_OVERHEAD_BYTES);
  return envelope;
}

export function encodeHcsReferenceEnvelope(
  seed: string,
  role: number,
  type: number,
  reference: HcsReferencePayload,
): Uint8Array {
  return buildEnvelope(
    HCS_REFERENCE_ENVELOPE_VERSION,
    seed,
    role,
    type,
    encodeReferencePayload(reference),
  );
}

export function decodeHcsEnvelope(bytes: Uint8Array): HcsEnvelope | null {
  if (bytes.length < HCS_ENVELOPE_OVERHEAD_BYTES) {
    return null;
  }

  const version = bytes[0];
  if (version !== HCS_LEGACY_ENVELOPE_VERSION && version !== HCS_REFERENCE_ENVELOPE_VERSION) {
    return null;
  }

  const seedBytes = bytes.slice(1, 1 + HCS_ENVELOPE_SEED_LENGTH);
  const seed = textDecoder.decode(seedBytes);
  if (textEncoder.encode(seed).length !== HCS_ENVELOPE_SEED_LENGTH) {
    return null;
  }

  const role = bytes[1 + HCS_ENVELOPE_SEED_LENGTH];
  const type = bytes[1 + HCS_ENVELOPE_SEED_LENGTH + 1];
  const payloadBytes = bytes.slice(HCS_ENVELOPE_OVERHEAD_BYTES);

  if (version === HCS_LEGACY_ENVELOPE_VERSION) {
    return {
      version,
      seed,
      role,
      type,
      payloadKind: "legacyText",
      encryptedPayload: textDecoder.decode(payloadBytes),
    };
  }

  const reference = decodeReferencePayload(payloadBytes);
  if (!reference) {
    return null;
  }

  return {
    version,
    seed,
    role,
    type,
    payloadKind: "reference",
    reference,
  };
}
