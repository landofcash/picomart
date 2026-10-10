import {z} from "zod";
import {canonicalEqual} from "./canonical.js";
import {TempoFulfillmentSnapshotSchema, tempoRecipientValid} from './tempoCatalog.js';
import {TempoOrderContextSchema, type TempoOrderContext} from "./tempoIdentity.js";
import {MAX_TEMPO_MESSAGE_BYTES, TEMPO_MESSAGE_PROFILE, TEMPO_REFERENCE_PROFILE, TempoAddressSchema, TempoAmountSchema, TempoChainIdSchema, TempoHashSchema, TempoIdSchema, TempoSeedSchema, limitedTempoText, parseTempoCanonical, serializeTempoCanonical, tempoSeedToId} from "./tempoPrimitives.js";

export const TEMPO_MESSAGE_TYPES = Object.freeze({"buyer-order": 1, "seller-delivery": 2, "seller-refusal": 3} as const);
export type TempoMessageType = keyof typeof TEMPO_MESSAGE_TYPES;
export const TempoMessageBindingSchema = z.object({
  version: z.literal(1), referenceProfile: z.literal(TEMPO_REFERENCE_PROFILE), chainId: TempoChainIdSchema,
  contractAddress: TempoAddressSchema, orderId: TempoIdSchema,
  messageType: z.enum(["buyer-order", "seller-delivery", "seller-refusal"]), sequence: z.number().int().min(1).max(0xffff_ffff),
  author: TempoAddressSchema, buyerIdentityId: TempoHashSchema, sellerIdentityId: TempoHashSchema,
}).strict();
export type TempoMessageBinding = z.infer<typeof TempoMessageBindingSchema>;
export type TempoExpectedMessage = {messageType: TempoMessageType; sequence: number};
export function createTempoMessageBinding(orderInput: TempoOrderContext, expected: TempoExpectedMessage): TempoMessageBinding {
  const order = TempoOrderContextSchema.parse(orderInput);
  return TempoMessageBindingSchema.parse({
    version: 1, referenceProfile: TEMPO_REFERENCE_PROFILE, chainId: order.chainId,
    contractAddress: order.contractAddress, orderId: tempoSeedToId(order.orderSeed), ...expected,
    author: (expected.messageType === "buyer-order" ? order.buyerIdentity : order.sellerIdentity).context.account,
    buyerIdentityId: order.buyerIdentity.identityId, sellerIdentityId: order.sellerIdentity.identityId,
  });
}
export function assertTempoMessageBinding(input: unknown, order: TempoOrderContext, expected: TempoExpectedMessage): TempoMessageBinding {
  const binding = TempoMessageBindingSchema.parse(input);
  if (!canonicalEqual(binding, createTempoMessageBinding(order, expected))) throw new Error("Message binding differs from the authenticated order, role or sequence");
  return binding;
}
export const TempoDeliveryDetailsSchema = z.object({
  fullName: limitedTempoText(0, 512), address: limitedTempoText(0, 2048), city: limitedTempoText(0, 512),
  postalCode: limitedTempoText(0, 128), country: limitedTempoText(0, 256), phone: limitedTempoText(0, 128),
  email: limitedTempoText(0, 512), deliveryComments: limitedTempoText(0, 16384).optional(), noPhysicalDelivery: z.boolean(),
}).strict();
const itemSchema = z.object({
  productId: limitedTempoText(1, 512), name: limitedTempoText(1, 1024), quantity: z.number().int().min(1).max(1_000_000),
  unitAmount: TempoAmountSchema, lineAmount: TempoAmountSchema,
}).strict().refine(item => BigInt(item.unitAmount) * BigInt(item.quantity) === BigInt(item.lineAmount), "line amount mismatch");
const buyerData = z.object({
  catalogSeed: TempoSeedSchema, orderSeed: TempoSeedSchema, items: z.array(itemSchema).min(1).max(100),
  delivery: TempoDeliveryDetailsSchema, deliveryAmount: TempoAmountSchema, fulfillment:TempoFulfillmentSnapshotSchema,
  payment: z.object({tokenAddress: TempoAddressSchema, amount: TempoAmountSchema.refine(value => BigInt(value) > 0n, "payment must be positive")}).strict(),
}).strict().superRefine((data, ctx) => {
  const total = data.items.reduce((sum, item) => sum + BigInt(item.lineAmount), BigInt(data.deliveryAmount));
  if (total !== BigInt(data.payment.amount)) ctx.addIssue({code: "custom", message: "payment total mismatch"});
  if(data.fulfillment.amount!==data.deliveryAmount||data.fulfillment.currency!==data.payment.tokenAddress)ctx.addIssue({code:'custom',message:'fulfillment payment mismatch'});
  if(!tempoRecipientValid(data.fulfillment.type,data.delivery)||data.delivery.noPhysicalDelivery!==(data.fulfillment.type==='digital'))ctx.addIssue({code:'custom',message:'Invalid recipient details for delivery method'});
  if (new Set(data.items.map(item => item.productId)).size !== data.items.length) ctx.addIssue({code: "custom", message: "duplicate product ID"});
});
const payloadBase = {version: z.literal(1), profile: z.literal(TEMPO_MESSAGE_PROFILE)};
export const TempoMessagePayloadSchema = z.union([
  z.object({version:z.literal(2),profile:z.literal('picomart-message-v2'), binding: TempoMessageBindingSchema.extend({messageType: z.literal("buyer-order")}), data: buyerData}).strict(),
  z.object({...payloadBase, binding: TempoMessageBindingSchema.extend({messageType: z.literal("seller-delivery")}), data: z.object({shipmentCode: limitedTempoText(0, 1024), customInfo: limitedTempoText(0, 16384)}).strict()}).strict(),
  z.object({...payloadBase, binding: TempoMessageBindingSchema.extend({messageType: z.literal("seller-refusal")}), data: z.object({customInfo: limitedTempoText(1, 16384)}).strict()}).strict(),
]);
export type TempoMessagePayload = z.infer<typeof TempoMessagePayloadSchema>;
export function validateTempoMessagePayload(input: unknown, order: TempoOrderContext, expected: TempoExpectedMessage): TempoMessagePayload {
  const payload = TempoMessagePayloadSchema.parse(input);
  assertTempoMessageBinding(payload.binding, order, expected);
  if (payload.binding.messageType === "buyer-order" && "catalogSeed" in payload.data &&
      (payload.data.catalogSeed !== order.catalogSeed || payload.data.orderSeed !== order.orderSeed)) throw new Error("Buyer details use a different catalog or order seed");
  serializeTempoCanonical(payload, TempoMessagePayloadSchema, MAX_TEMPO_MESSAGE_BYTES);
  return payload;
}
export function serializeTempoMessage(input: unknown, order: TempoOrderContext, expected: TempoExpectedMessage): string {
  return serializeTempoCanonical(validateTempoMessagePayload(input, order, expected), TempoMessagePayloadSchema, MAX_TEMPO_MESSAGE_BYTES);
}
export function parseTempoMessage(text: string, order: TempoOrderContext, expected: TempoExpectedMessage): TempoMessagePayload {
  return validateTempoMessagePayload(parseTempoCanonical(text, TempoMessagePayloadSchema, MAX_TEMPO_MESSAGE_BYTES), order, expected);
}
