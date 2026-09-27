import {
  PaymentPayloadSchema,
  PaymentRequiredSchema,
  SettlementResponseSchema,
  type PaymentPayload,
  type PaymentRequired,
  type SettlementResponse,
} from "./schemas.js";
import {
  decodePaymentRequiredHeader as decodeCorePaymentRequired,
  decodePaymentResponseHeader as decodeCorePaymentResponse,
  decodePaymentSignatureHeader as decodeCorePaymentSignature,
  encodePaymentRequiredHeader as encodeCorePaymentRequired,
  encodePaymentResponseHeader as encodeCorePaymentResponse,
  encodePaymentSignatureHeader as encodeCorePaymentSignature,
} from "@x402/core/http";

export const encodePaymentRequiredHeader = (value: PaymentRequired) =>
  encodeCorePaymentRequired(PaymentRequiredSchema.parse(value) as never);
export const decodePaymentRequiredHeader = (value: string) =>
  PaymentRequiredSchema.parse(decodeCorePaymentRequired(value));
export const encodePaymentSignatureHeader = (value: PaymentPayload) =>
  encodeCorePaymentSignature(PaymentPayloadSchema.parse(value) as never);
export const decodePaymentSignatureHeader = (value: string) =>
  PaymentPayloadSchema.parse(decodeCorePaymentSignature(value));
export const encodePaymentResponseHeader = (value: SettlementResponse) =>
  encodeCorePaymentResponse(SettlementResponseSchema.parse(value) as never);
export const decodePaymentResponseHeader = (value: string) =>
  SettlementResponseSchema.parse(decodeCorePaymentResponse(value));
