import {z} from "zod";
import {base64ToBytes, bytesToBase64, hexToBytes} from "./binary.js";
import {canonicalBytes, canonicalEqual, sha256Bytes} from "./canonical.js";
import {TempoOrderContextSchema, type TempoOrderContext} from "./tempoIdentity.js";
import {assertTempoMessageBinding, TEMPO_MESSAGE_TYPES, TempoMessageBindingSchema, type TempoExpectedMessage, type TempoMessageBinding} from "./tempoMessages.js";
import {MAX_TEMPO_ENVELOPE_BYTES, MAX_TEMPO_MESSAGE_BYTES, MAX_TEMPO_REFERENCE_BYTES, TEMPO_COMMITMENT_DOMAIN, TEMPO_REFERENCE_PROFILE, TEMPO_SDK_KEY_PROFILE, TEMPO_SDK_SIGNATURE, TEMPO_SDK_WRAPPING, TempoHashSchema, TempoOriginSchema, TempoPublicKeySchema, TempoStorageSeedSchema, TempoTimestampSchema, bytesHex, canonicalBase64, parseTempoCanonical, serializeTempoCanonical, tempoKeccak, utf8} from "./tempoPrimitives.js";

function encryptedPayloadSchema(maxPlaintextBytes: number) {
  return z.string().max(Math.ceil((maxPlaintextBytes + 16) / 3) * 4 + 25).refine(value => {
    try {
      const parts = value.split(":");
      if (parts.length !== 2) return false;
      const iv = base64ToBytes(parts[0]), ciphertext = base64ToBytes(parts[1]);
      return iv.length === 12 && ciphertext.length >= 16 && ciphertext.length <= maxPlaintextBytes + 16 &&
        bytesToBase64(iv) === parts[0] && bytesToBase64(ciphertext) === parts[1];
    } catch { return false; }
  }, "invalid canonical SDK AES-GCM payload");
}
const creatorSchema = z.object({publicKey: TempoPublicKeySchema, signatureScheme: z.literal(TEMPO_SDK_SIGNATURE)}).strict();
export const TempoZkbytesReferenceSchema = z.object({
  version: z.literal(1), service: z.literal("zkbytes"), apiOrigin: TempoOriginSchema, downloadOrigin: TempoOriginSchema,
  seed: TempoStorageSeedSchema, expiresAt: TempoTimestampSchema, expectedCreator: creatorSchema,
}).strict();
export type TempoSupportedOrigins = {apiOrigin: string; downloadOrigin: string};
export const TempoEnvelopeHeaderSchema = z.object({
  format: z.literal("picomart-sealed-reference"), version: z.literal(1), referenceProfile: z.literal(TEMPO_REFERENCE_PROFILE),
  context: TempoStorageSeedSchema, recipientRole: z.enum(["buyer", "seller"]), recipientIdentityId: TempoHashSchema, recipientPublicKey: TempoPublicKeySchema,
}).strict();
export const TempoSealedReferenceSchema = TempoEnvelopeHeaderSchema.extend({
  encryptedKey: canonicalBase64(80), encryptedPayload: encryptedPayloadSchema(MAX_TEMPO_REFERENCE_BYTES),
}).strict();
export type TempoSealedReference = z.infer<typeof TempoSealedReferenceSchema>;
export const TempoPrivateReferenceSchema = z.object({
  header: TempoEnvelopeHeaderSchema, binding: TempoMessageBindingSchema,
  keyDerivationProfile: z.literal(TEMPO_SDK_KEY_PROFILE), reference: TempoZkbytesReferenceSchema, objectDigest: TempoHashSchema,
}).strict().refine(value => value.header.context !== value.reference.seed, "public wrapping context must differ from the private storage locator");
export type TempoPrivateReference = z.infer<typeof TempoPrivateReferenceSchema>;

export function tempoEnvelopeHeader(envelope: TempoSealedReference) {
  const {encryptedKey: _key, encryptedPayload: _payload, ...header} = TempoSealedReferenceSchema.parse(envelope);
  return TempoEnvelopeHeaderSchema.parse(header);
}
export function validateTempoSealedReference(input: unknown, orderInput: TempoOrderContext, role: "buyer" | "seller"): TempoSealedReference {
  const order = TempoOrderContextSchema.parse(orderInput), envelope = TempoSealedReferenceSchema.parse(input);
  const identity = role === "buyer" ? order.buyerIdentity : order.sellerIdentity;
  if (envelope.recipientRole !== role || envelope.recipientIdentityId !== identity.identityId || envelope.recipientPublicKey !== identity.publicKey) throw new Error("Encrypted reference recipient differs from the authenticated identity snapshot");
  serializeTempoCanonical(envelope, TempoSealedReferenceSchema, MAX_TEMPO_ENVELOPE_BYTES);
  return envelope;
}
export function serializeTempoSealedReference(input: unknown, order: TempoOrderContext, role: "buyer" | "seller"): string {
  return serializeTempoCanonical(validateTempoSealedReference(input, order, role), TempoSealedReferenceSchema, MAX_TEMPO_ENVELOPE_BYTES);
}
export function parseTempoSealedReference(text: string, order: TempoOrderContext, role: "buyer" | "seller"): TempoSealedReference {
  return validateTempoSealedReference(parseTempoCanonical(text, TempoSealedReferenceSchema, MAX_TEMPO_ENVELOPE_BYTES), order, role);
}
/** Local validation only; callers may request/download only after this succeeds. */
export function validateTempoPrivateReference(input: unknown, envelopeInput: TempoSealedReference, order: TempoOrderContext, expected: TempoExpectedMessage, supported: TempoSupportedOrigins, role: "buyer" | "seller"): TempoPrivateReference {
  const envelope = validateTempoSealedReference(envelopeInput, order, role), value = TempoPrivateReferenceSchema.parse(input);
  assertTempoMessageBinding(value.binding, order, expected);
  if (!canonicalEqual(value.header, tempoEnvelopeHeader(envelope))) throw new Error("Encrypted and public envelope metadata differ");
  if (value.reference.apiOrigin !== TempoOriginSchema.parse(supported.apiOrigin) || value.reference.downloadOrigin !== TempoOriginSchema.parse(supported.downloadOrigin)) throw new Error("Unsupported zkbytes service origins");
  serializeTempoCanonical(value, TempoPrivateReferenceSchema, MAX_TEMPO_REFERENCE_BYTES);
  return value;
}
export function parseTempoPrivateReference(text: string, envelope: TempoSealedReference, order: TempoOrderContext, expected: TempoExpectedMessage, supported: TempoSupportedOrigins, role: "buyer" | "seller"): TempoPrivateReference {
  return validateTempoPrivateReference(parseTempoCanonical(text, TempoPrivateReferenceSchema, MAX_TEMPO_REFERENCE_BYTES), envelope, order, expected, supported, role);
}
export function serializeTempoPrivateReference(input: unknown, envelope: TempoSealedReference, order: TempoOrderContext, expected: TempoExpectedMessage, supported: TempoSupportedOrigins, role: "buyer" | "seller"): string {
  return serializeTempoCanonical(validateTempoPrivateReference(input, envelope, order, expected, supported, role), TempoPrivateReferenceSchema, MAX_TEMPO_REFERENCE_BYTES);
}
/** Run after opening both envelopes; identical public commitments alone cannot prove this. */
export function assertTempoReferenceAgreement(buyer: TempoPrivateReference, seller: TempoPrivateReference): void {
  const a = TempoPrivateReferenceSchema.parse(buyer), b = TempoPrivateReferenceSchema.parse(seller);
  if (a.header.recipientRole !== "buyer" || b.header.recipientRole !== "seller" || a.header.context === b.header.context ||
      !canonicalEqual(a.binding, b.binding) || !canonicalEqual(a.reference, b.reference) || a.objectDigest !== b.objectDigest || a.keyDerivationProfile !== b.keyDerivationProfile) throw new Error("Buyer and seller references do not describe the same object and message");
}

const encryptedKeySchema = z.object({publicKey: TempoPublicKeySchema, wrappingAlgorithm: z.literal(TEMPO_SDK_WRAPPING), encryptedKey: canonicalBase64(80)}).strict();
/** Message item subset of the SDK profile: bounded messages and no remote-deletion managers. */
export const TempoStorageItemSchema = z.object({
  version: z.literal(1), encryptedPayload: encryptedPayloadSchema(MAX_TEMPO_MESSAGE_BYTES),
  itemSignature: z.object({value: canonicalBase64(64)}).strict(), seed: TempoStorageSeedSchema,
  keyDerivationProfile: z.literal(TEMPO_SDK_KEY_PROFILE), encryptedKeys: z.array(encryptedKeySchema).min(1).max(32),
  expiresAt: TempoTimestampSchema, creator: creatorSchema, managers: z.array(creatorSchema).length(0),
}).strict().refine(item => new Set(item.encryptedKeys.map(key => key.publicKey)).size === item.encryptedKeys.length, "duplicate encrypted recipient");
export async function tempoStorageObjectDigest(item: unknown): Promise<`0x${string}`> {
  return bytesHex(await sha256Bytes(canonicalBytes(TempoStorageItemSchema.parse(item))));
}
/** Metadata/digest verification does not replace SDK signature verification and decryption. */
export async function validateTempoObjectMetadata(input: unknown, privateReference: TempoPrivateReference, orderInput: TempoOrderContext) {
  const item = TempoStorageItemSchema.parse(input), reference = TempoPrivateReferenceSchema.parse(privateReference), order = TempoOrderContextSchema.parse(orderInput);
  assertTempoMessageBinding(reference.binding, order, {messageType:reference.binding.messageType,sequence:reference.binding.sequence});
  const identity = reference.header.recipientRole === "buyer" ? order.buyerIdentity : order.sellerIdentity;
  if (reference.header.recipientIdentityId !== identity.identityId || reference.header.recipientPublicKey !== identity.publicKey) throw new Error("Private reference recipient differs from the authenticated snapshot");
  if (item.seed !== reference.reference.seed || item.expiresAt !== reference.reference.expiresAt ||
      !canonicalEqual(item.creator, reference.reference.expectedCreator) || item.keyDerivationProfile !== reference.keyDerivationProfile ||
      ![order.buyerIdentity.publicKey, order.sellerIdentity.publicKey].every(key => item.encryptedKeys.some(recipient => recipient.publicKey === key)) ||
      await tempoStorageObjectDigest(item) !== reference.objectDigest) throw new Error("Downloaded object differs from the authenticated private reference");
  return item;
}

/** Solidity abi.encode layout; bytes16 is RIGHT padded, integers/addresses LEFT padded. */
export const TEMPO_REFERENCE_ABI_TYPES = ["bytes32", "uint8", "bytes32", "uint256", "address", "bytes16", "uint8", "uint32", "address", "bytes32", "bytes32", "bytes32", "bytes32"] as const;
const integerWord = (value: number) => value.toString(16).padStart(64, "0");
export function encodeTempoReferenceCommitment(bindingInput: TempoMessageBinding, buyerText: string, sellerText: string, order: TempoOrderContext, expected: TempoExpectedMessage): `0x${string}` {
  const binding = assertTempoMessageBinding(bindingInput, order, expected);
  const buyer = parseTempoSealedReference(buyerText, order, "buyer"), seller = parseTempoSealedReference(sellerText, order, "seller");
  if (buyer.context === seller.context) throw new Error("Reference envelopes must use independent wrapping contexts");
  const words = [
    tempoKeccak(utf8(TEMPO_COMMITMENT_DOMAIN)).slice(2), integerWord(binding.version), tempoKeccak(utf8(binding.referenceProfile)).slice(2),
    integerWord(binding.chainId), binding.contractAddress.slice(2).padStart(64, "0"), binding.orderId.slice(2).padEnd(64, "0"),
    integerWord(TEMPO_MESSAGE_TYPES[binding.messageType]), integerWord(binding.sequence), binding.author.slice(2).padStart(64, "0"),
    binding.buyerIdentityId.slice(2), binding.sellerIdentityId.slice(2), tempoKeccak(utf8(buyerText)).slice(2), tempoKeccak(utf8(sellerText)).slice(2),
  ];
  return `0x${words.join("")}`;
}
export function tempoReferenceCommitment(binding: TempoMessageBinding, buyerText: string, sellerText: string, order: TempoOrderContext, expected: TempoExpectedMessage): `0x${string}` {
  return tempoKeccak(hexToBytes(encodeTempoReferenceCommitment(binding, buyerText, sellerText, order, expected)));
}
