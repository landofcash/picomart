import { z } from "zod";
import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from "./binary.js";
import {
  HBAR_ASSET,
  MAX_DELIVERY_CIPHERTEXT_BYTES,
  PICOMART_NETWORK,
  PICOMART_ORDER_SCHEME,
  ORDER_SEED_PATTERN,
  QUOTE_RESOLUTION_PATH,
  X402_PROTOCOL_VERSION,
} from "./constants.js";

const utf8Length = (value: string) => new TextEncoder().encode(value).length;
const limitedString = (min: number, max: number) =>
  z.string().refine(value => utf8Length(value) >= min && utf8Length(value) <= max, {
    message: `must encode to ${min}-${max} UTF-8 bytes`,
  });
const base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/);
const decodedLength = (length: number) => base64Url.refine(value => {
  try {
    return base64UrlToBytes(value).length === length;
  } catch {
    return false;
  }
}, `must decode to ${length} bytes`);

export const OrderSeedSchema = z.string().regex(ORDER_SEED_PATTERN).refine(value => {
  try {
    const bytes = base64UrlToBytes(value);
    return bytes.length === 16 && bytesToBase64Url(bytes) === value;
  } catch {
    return false;
  }
}, "must be a canonical unpadded Base64URL UUID");
export const HederaEntityIdSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export const HederaAccountIdSchema = HederaEntityIdSchema;
export const HederaTokenIdSchema = HederaEntityIdSchema;
export const HederaTransactionIdSchema = z.string().regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)@\d{10,}\.\d{9}$/,
);
export const HederaTransactionHashSchema = z.string().regex(/^(?:0x[0-9a-f]{96}|[A-Za-z0-9_-]{64})$/);
export const SolidityAddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/);
export const CompressedSecp256k1PublicKeySchema = z.string().refine(value => {
  if (!/^[A-Za-z0-9+/]{44}$/.test(value)) return false;
  const bytes = base64ToBytes(value);
  return bytes.length === 33 && (bytes[0] === 2 || bytes[0] === 3) && bytesToBase64(bytes) === value;
}, "must be padded standard Base64 for a 33-byte compressed secp256k1 key");
export const SellerPublicKeySchema = CompressedSecp256k1PublicKeySchema;
export const AmountSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const PicomartDeliveryDetailsV1Schema = z.object({
  fullName: limitedString(0, 512),
  address: limitedString(0, 2_048),
  city: limitedString(0, 512),
  postalCode: limitedString(0, 128),
  country: limitedString(0, 256),
  phone: limitedString(0, 128),
  email: limitedString(0, 512),
  deliveryComments: limitedString(0, 16_384).optional(),
  noPhysicalDelivery: z.boolean(),
}).strict();

export const PicomartEncryptedDeliveryV1Schema = z.object({
  version: z.literal(1),
  algorithm: z.literal("A256GCM"),
  nonce: decodedLength(12),
  ciphertext: base64Url.refine(value => base64UrlToBytes(value).length <= MAX_DELIVERY_CIPHERTEXT_BYTES),
  tag: decodedLength(16),
}).strict();

export const QuoteItemRequestSchema = z.object({
  productId: limitedString(1, 512),
  quantity: z.number().int().min(1).max(1_000_000),
}).strict();

export const PicomartOrderQuoteRequestV1Schema = z.object({
  orderSeed: OrderSeedSchema,
  catalogSeed: OrderSeedSchema,
  items: z.array(QuoteItemRequestSchema).min(1).max(100),
  encryptedDelivery: PicomartEncryptedDeliveryV1Schema,
  deliveryKey: decodedLength(32),
}).strict();

const quoteItem = z.object({
  productId: limitedString(1, 512),
  name: z.string(),
  unitAmount: AmountSchema,
  quantity: z.number().int().min(1).max(1_000_000),
  lineAmount: AmountSchema,
}).strict();

const hbarPayment = z.object({
  symbol: z.string(),
  name: z.string(),
  amount: AmountSchema,
  payTo: HederaEntityIdSchema,
  assetType: z.literal("hbar"),
  asset: z.literal(HBAR_ASSET),
  tokenEvmAddress: z.null(),
  decimals: z.literal(8),
}).strict();

const htsPayment = z.object({
  symbol: z.string(),
  name: z.string(),
  amount: AmountSchema,
  payTo: HederaEntityIdSchema,
  assetType: z.literal("hts"),
  asset: HederaTokenIdSchema.refine(value => value !== HBAR_ASSET),
  tokenEvmAddress: SolidityAddressSchema,
  decimals: z.number().int().min(0).max(255),
}).strict();

export const PicomartOrderQuoteV1Schema = z.object({
  version: z.literal(1),
  orderSeed: OrderSeedSchema,
  requestHash: decodedLength(32),
  network: z.literal(PICOMART_NETWORK),
  x402: z.object({
    protocolVersion: z.literal(X402_PROTOCOL_VERSION),
    scheme: z.literal(PICOMART_ORDER_SCHEME),
    schemeVersion: z.literal(1),
    resourceMethod: z.literal("POST"),
    resourcePath: z.string().regex(/^\/api\/v1\/testnet\/orders\/[A-Za-z0-9_-]{22}\/confirm$/),
    maxTimeoutSeconds: z.number().int().positive().max(600),
  }).strict(),
  catalog: z.object({
    seed: OrderSeedSchema,
    sellerAccountId: HederaAccountIdSchema,
    sellerEvmAddress: SolidityAddressSchema,
    sellerPublicKey: SellerPublicKeySchema,
  }).strict(),
  items: z.array(quoteItem).min(1).max(100),
  delivery: z.object({
    required: z.boolean(),
    optionId: z.literal("pilot-seller-arranged"),
    optionName: z.literal("Seller-arranged delivery"),
    amount: z.literal("0"),
    deliveryDetailsHash: decodedLength(32),
    encryptedDeliveryHash: decodedLength(32),
  }).strict(),
  payment: z.discriminatedUnion("assetType", [hbarPayment, htsPayment]),
  picomart: z.object({
    contractId: HederaEntityIdSchema,
    contractEvmAddress: SolidityAddressSchema,
    hcsTopicId: HederaEntityIdSchema,
  }).strict(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict().superRefine((quote, context) => {
  const subtotal = quote.items.reduce((sum, item) => sum + BigInt(item.lineAmount), 0n);
  if (quote.items.some(item => BigInt(item.unitAmount) * BigInt(item.quantity) !== BigInt(item.lineAmount))) {
    context.addIssue({ code: "custom", message: "line amount mismatch" });
  }
  if (BigInt(quote.payment.amount) !== subtotal) {
    context.addIssue({ code: "custom", message: "payment amount mismatch" });
  }
  if (quote.expiresAt <= quote.issuedAt || quote.expiresAt - quote.issuedAt > 600) {
    context.addIssue({ code: "custom", message: "invalid quote lifetime" });
  }
  if (quote.x402.resourcePath !== `/api/v1/testnet/orders/${quote.orderSeed}/confirm`) {
    context.addIssue({ code: "custom", message: "resource path does not match order seed" });
  }
});

export const PaymentRequirementsSchema = z.object({
  scheme: z.literal(PICOMART_ORDER_SCHEME),
  network: z.literal(PICOMART_NETWORK),
  amount: AmountSchema,
  asset: HederaTokenIdSchema,
  payTo: HederaEntityIdSchema,
  maxTimeoutSeconds: z.number().int().positive().max(600),
  extra: z.object({
    schemeVersion: z.literal(1),
    orderSeed: OrderSeedSchema,
    quoteDigest: decodedLength(32),
    quotePath: z.literal(QUOTE_RESOLUTION_PATH),
    quoteJws: z.string().regex(/^[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]+$/),
  }).strict(),
}).strict();

export const ResourceInfoSchema = z.object({
  url: z.string().url(),
  description: z.string(),
  mimeType: z.literal("application/json"),
  serviceName: z.literal("Picomart"),
}).strict();

export const PaymentRequiredSchema = z.object({
  x402Version: z.literal(2),
  error: z.string(),
  resource: ResourceInfoSchema,
  accepts: z.array(PaymentRequirementsSchema).length(1),
  extensions: z.record(z.string(), z.unknown()),
}).strict();

export const PaymentPayloadSchema = z.object({
  x402Version: z.literal(2),
  resource: ResourceInfoSchema,
  accepted: PaymentRequirementsSchema,
  payload: z.object({
    transactionId: HederaTransactionIdSchema,
    buyerAccountId: HederaAccountIdSchema.refine(value => value !== "0.0.0"),
  }).strict(),
  extensions: z.record(z.string(), z.unknown()),
}).strict();

export const SettlementResponseSchema = z.object({
  success: z.boolean(),
  payer: HederaAccountIdSchema.optional(),
  transaction: HederaTransactionIdSchema.optional(),
  network: z.literal(PICOMART_NETWORK),
  amount: AmountSchema.optional(),
  errorReason: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()),
}).strict();

export const PicomartFrontendApprovalHandoffV1Schema = z.object({
  version: z.literal(1),
  network: z.literal(PICOMART_NETWORK),
  orderSeed: OrderSeedSchema,
  deliveryKey: decodedLength(32),
}).strict();

export const TrustedPicomartProfileV1Schema = z.object({
  version: z.literal(1),
  profileId: z.string().min(1),
  quoteOrigin: z.string().url(),
  quoteResolutionPath: z.literal(QUOTE_RESOLUTION_PATH),
  resourceOrigin: z.string().url(),
  confirmationPathTemplate: z.literal("/api/v1/testnet/orders/{orderSeed}/confirm"),
  network: z.literal(PICOMART_NETWORK),
  contractId: HederaEntityIdSchema,
  contractEvmAddress: SolidityAddressSchema,
  hcsTopicId: HederaEntityIdSchema,
  trustedQuoteKeys: z.array(z.object({
    kid: z.string().min(1),
    algorithm: z.literal("EdDSA"),
    publicKeyEncoding: z.literal("base64url-ed25519"),
    publicKey: decodedLength(32),
  }).strict()).min(1),
}).strict().superRefine((profile, context) => {
  for (const field of ["quoteOrigin", "resourceOrigin"] as const) {
    const url = new URL(profile[field]);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      context.addIssue({ code: "custom", message: `${field} must be a bare HTTPS origin` });
    }
  }
});

export const PicomartOrderEvidenceV1Schema = z.object({
  orderSeed: OrderSeedSchema,
  network: z.literal("testnet"),
  contractId: HederaEntityIdSchema,
  contractEvmAddress: SolidityAddressSchema.optional(),
  order: z.record(z.string(), z.unknown()),
  outerTransactionId: HederaTransactionIdSchema,
  outerTransactionHash: HederaTransactionHashSchema.optional(),
  paymentConsensusTimestamp: z.string().regex(/^\d{10,}\.\d{9}$/),
  payerAccountId: HederaAccountIdSchema.refine(value => value !== "0.0.0"),
  outerTransactionType: z.literal("ATOMICBATCH"),
  outerResult: z.literal("SUCCESS"),
}).strict();

export const QuoteResolutionSchema = z.object({
  paymentRequired: PaymentRequiredSchema,
  quote: PicomartOrderQuoteV1Schema,
  quoteDigest: decodedLength(32),
  quoteJws: z.string(),
  encryptedDelivery: PicomartEncryptedDeliveryV1Schema,
  recoverUntil: z.number().int().positive(),
}).strict().superRefine((resolution, context) => {
  if (resolution.recoverUntil <= resolution.quote.expiresAt) {
    context.addIssue({ code: "custom", message: "recovery deadline must be after quote expiry" });
  }
});

export type PicomartDeliveryDetailsV1 = z.infer<typeof PicomartDeliveryDetailsV1Schema>;
export type PicomartEncryptedDeliveryV1 = z.infer<typeof PicomartEncryptedDeliveryV1Schema>;
export type PicomartOrderQuoteRequestV1 = z.infer<typeof PicomartOrderQuoteRequestV1Schema>;
export type PicomartOrderQuoteV1 = z.infer<typeof PicomartOrderQuoteV1Schema>;
export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;
export type PaymentRequired = z.infer<typeof PaymentRequiredSchema>;
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;
export type SettlementResponse = z.infer<typeof SettlementResponseSchema>;
export type PicomartFrontendApprovalHandoffV1 = z.infer<typeof PicomartFrontendApprovalHandoffV1Schema>;
export type TrustedPicomartProfileV1 = z.infer<typeof TrustedPicomartProfileV1Schema>;
export type PicomartOrderEvidenceV1 = z.infer<typeof PicomartOrderEvidenceV1Schema>;
