import { describe, expect, it } from "vitest";
import {
  PicomartDeliveryDetailsV1Schema,
  PicomartOrderQuoteRequestV1Schema,
  PaymentRequiredSchema,
  SellerPublicKeySchema,
  canonicalEqual,
  decryptDelivery,
  decodeHcsEnvelope,
  encodeHcsReferenceEnvelope,
  encryptDelivery,
  normalizeSolidityAddress,
  solidityEntityAddressToId,
} from "./index.js";
import {decodePaymentRequiredHeader, encodePaymentRequiredHeader} from "./http.js";
import hbarRequiredFixture from "../fixtures/x402/hbar-payment-required.json";

const seed = "AAAAAAAAAAAAAAAAAAAAAA";
const delivery = {
  fullName: "Ada Lovelace", address: "1 Test Street", city: "Lisbon", postalCode: "1000-001",
  country: "PT", phone: "+351000000000", email: "ada@example.test", noPhysicalDelivery: false,
};

describe("picomart-order protocol", () => {
  it("round-trips canonical AES-GCM delivery and rejects an incorrect AAD seed", async () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => index);
    const nonce = Uint8Array.from({ length: 12 }, (_, index) => index + 32);
    const envelope = await encryptDelivery(delivery, seed, key, nonce);
    expect(await decryptDelivery(envelope, seed, key)).toEqual(delivery);
    await expect(decryptDelivery(envelope, "BBBBBBBBBBBBBBBBBBBBBB", key)).rejects.toThrow();
  });

  it("enforces request and UTF-8 limits", () => {
    expect(PicomartDeliveryDetailsV1Schema.safeParse({ ...delivery, fullName: "😀".repeat(129) }).success).toBe(false);
    expect(PicomartOrderQuoteRequestV1Schema.safeParse({
      orderSeed: seed, catalogSeed: seed, items: [], deliveryKey: "A".repeat(43),
      encryptedDelivery: { version: 1, algorithm: "A256GCM", nonce: "A".repeat(16), ciphertext: "AA", tag: "A".repeat(22) },
    }).success).toBe(false);
  });

  it("requires canonical compressed seller keys", () => {
    const key = Buffer.concat([Buffer.from([2]), Buffer.alloc(32)]).toString("base64");
    expect(SellerPublicKeySchema.parse(key)).toBe(key);
    expect(SellerPublicKeySchema.safeParse(`${key}=`).success).toBe(false);
  });

  it("normalizes checksum addresses and converts long-zero entity addresses", () => {
    const checksummedUsdc = "0x0000000000000000000000000000000000068cDa";
    expect(normalizeSolidityAddress(checksummedUsdc))
      .toBe("0x0000000000000000000000000000000000068cda");
    expect(solidityEntityAddressToId(checksummedUsdc)).toBe("0.0.429274");
    expect(solidityEntityAddressToId("not-an-address")).toBeNull();
  });

  it("round-trips frontend-compatible HCS v2 while preserving v1 decoding", () => {
    const encoded = encodeHcsReferenceEnvelope(seed, 1, 1, {
      fileId: "0.0.123", total: "100", token: "0.0.0", payloadHash: Buffer.alloc(32, 7).toString("base64"),
    });
    expect(decodeHcsEnvelope(encoded)?.version).toBe(2);
    const legacy = Uint8Array.from([1, ...new TextEncoder().encode(seed), 1, 1, ...new TextEncoder().encode("cipher")]);
    expect(decodeHcsEnvelope(legacy)).toMatchObject({ version: 1, encryptedPayload: "cipher" });
  });

  it("compares retained payment requirements canonically and type-sensitively", () => {
    expect(canonicalEqual({ amount: "1", extra: {} }, { extra: {}, amount: "1" })).toBe(true);
    expect(canonicalEqual({ amount: "1" }, { amount: 1 })).toBe(false);
  });

  it("encodes and decodes the normative x402 v2 HBAR fixture with the official core codec", () => {
    const fixture = PaymentRequiredSchema.parse(hbarRequiredFixture);
    expect(decodePaymentRequiredHeader(encodePaymentRequiredHeader(fixture))).toEqual(fixture);
  });
});
