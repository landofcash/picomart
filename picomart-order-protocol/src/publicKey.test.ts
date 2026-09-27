import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./binary.js";
import {
  publicKeyBase64FromContractBytes,
  publicKeyBase64ToContractBytes,
} from "./publicKey.js";
import {
  CompressedSecp256k1PublicKeySchema,
  SellerPublicKeySchema,
} from "./schemas.js";

const keyBytes = Uint8Array.from([2, ...new Array<number>(32).fill(7)]);
const publicKey = bytesToBase64(keyBytes);

describe("public key contract encoding", () => {
  it("round trips canonical Base64 as UTF-8 contract bytes", () => {
    const contractBytes = publicKeyBase64ToContractBytes(publicKey);

    expect(new TextDecoder().decode(contractBytes)).toBe(publicKey);
    expect(publicKeyBase64FromContractBytes(contractBytes)).toBe(publicKey);
  });

  it("keeps the existing seller schema as a compatible alias", () => {
    expect(CompressedSecp256k1PublicKeySchema.parse(publicKey)).toBe(publicKey);
    expect(SellerPublicKeySchema.parse(publicKey)).toBe(publicKey);
  });

  it("rejects nested Base64 and raw public-key contract bytes", () => {
    const nested = bytesToBase64(new TextEncoder().encode(publicKey));

    expect(() => publicKeyBase64ToContractBytes(nested)).toThrow();
    expect(() => publicKeyBase64FromContractBytes(keyBytes)).toThrow();
  });
});
