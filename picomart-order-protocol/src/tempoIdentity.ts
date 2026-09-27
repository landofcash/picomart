import {z} from "zod";
import {canonicalBytes, canonicalEqual} from "./canonical.js";
import {TEMPO_RECEIVING_PROFILE, TempoAddressSchema, TempoChainIdSchema, TempoHashSchema, TempoPublicKeySchema, TempoSeedSchema, normalizeTempoAddress, tempoKeccak} from "./tempoPrimitives.js";

const contextFields = {
  version: z.literal(1), profile: z.literal(TEMPO_RECEIVING_PROFILE), chainId: TempoChainIdSchema,
  contractAddress: TempoAddressSchema, account: TempoAddressSchema,
};
export const TempoReceivingContextSchema = z.discriminatedUnion("role", [
  z.object({...contextFields, role: z.literal("seller"), catalogSeed: TempoSeedSchema}).strict(),
  z.object({...contextFields, role: z.literal("buyer"), orderSeed: TempoSeedSchema}).strict(),
]);
export type TempoReceivingContext = z.infer<typeof TempoReceivingContextSchema>;
const identityBodySchema = z.object({context: TempoReceivingContextSchema, publicKey: TempoPublicKeySchema}).strict();
export const TempoReceivingIdentitySchema = identityBodySchema.extend({identityId: TempoHashSchema}).strict().refine(identity =>
  identity.identityId === tempoKeccak(canonicalBytes({context: identity.context, publicKey: identity.publicKey})), "receiving identity ID mismatch");
export type TempoReceivingIdentity = z.infer<typeof TempoReceivingIdentitySchema>;

export function createTempoReceivingContext(input: TempoReceivingContext): TempoReceivingContext {
  return TempoReceivingContextSchema.parse({...input, account: normalizeTempoAddress(input.account), contractAddress: normalizeTempoAddress(input.contractAddress)});
}
/** Exact EIP-191 message: fixed ASCII prefix + LF + RFC 8785 context, without a trailing LF. */
export function tempoReceivingSigningMessage(input: TempoReceivingContext): string {
  const context = TempoReceivingContextSchema.parse(input);
  return `Picomart receiving identity\n${new TextDecoder().decode(canonicalBytes(context))}`;
}
export function createTempoReceivingIdentity(context: TempoReceivingContext, publicKey: string): TempoReceivingIdentity {
  const body = identityBodySchema.parse({context, publicKey});
  return TempoReceivingIdentitySchema.parse({...body, identityId: tempoKeccak(canonicalBytes(body))});
}

export const TempoOrderContextSchema = z.object({
  version: z.literal(1), chainId: TempoChainIdSchema, contractAddress: TempoAddressSchema,
  catalogSeed: TempoSeedSchema, orderSeed: TempoSeedSchema,
  buyerIdentity: TempoReceivingIdentitySchema, sellerIdentity: TempoReceivingIdentitySchema,
}).strict().superRefine((order, ctx) => {
  const buyer = order.buyerIdentity.context, seller = order.sellerIdentity.context;
  if (buyer.role !== "buyer" || seller.role !== "seller" ||
      buyer.chainId !== order.chainId || seller.chainId !== order.chainId ||
      buyer.contractAddress !== order.contractAddress || seller.contractAddress !== order.contractAddress ||
      buyer.orderSeed !== order.orderSeed || seller.catalogSeed !== order.catalogSeed) {
    ctx.addIssue({code: "custom", message: "order receiving context mismatch"});
  }
});
export type TempoOrderContext = z.infer<typeof TempoOrderContextSchema>;
export function assertTempoIdentitySnapshot(actual: unknown, expected: TempoReceivingIdentity): TempoReceivingIdentity {
  const identity = TempoReceivingIdentitySchema.parse(actual);
  if (!canonicalEqual(identity, TempoReceivingIdentitySchema.parse(expected))) throw new Error("Receiving identity differs from the authenticated snapshot");
  return identity;
}
