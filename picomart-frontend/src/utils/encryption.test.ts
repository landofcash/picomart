import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "@picomart/order-protocol";
import { normalizePublicKeyBase64 } from "./encryption.ts";

const publicKey = bytesToBase64(
  Uint8Array.from([2, ...new Array<number>(32).fill(7)]),
);

describe("normalizePublicKeyBase64", () => {
  it("preserves canonical public keys", () => {
    expect(normalizePublicKeyBase64(publicKey)).toBe(publicKey);
  });

  it("unwraps legacy nested Base64 values from persisted client state", () => {
    const nested = bytesToBase64(new TextEncoder().encode(publicKey));
    expect(normalizePublicKeyBase64(nested)).toBe(publicKey);
  });

  it("rejects invalid public keys", () => {
    expect(() => normalizePublicKeyBase64("invalid")).toThrow("Seller public key is invalid.");
  });
});
