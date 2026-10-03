import {describe, expect, it} from "vitest";
import {
  decryptSecretMaterial,
  encryptSecretMaterial,
  normalizePrivateKeyHex,
} from "@/lib/internalWallet/crypto.ts";

describe("internal wallet crypto", () => {
  it("round-trips encrypted secret material with the correct passphrase", async () => {
    const encrypted = await encryptSecretMaterial("correct horse battery staple", {
      privateKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      mnemonic: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
      importedAs: "mnemonic",
    });

    await expect(decryptSecretMaterial(encrypted, "correct horse battery staple")).resolves.toEqual({
      privateKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      mnemonic: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
      importedAs: "mnemonic",
    });
  });


  it("rejects an incorrect passphrase", async () => {
    const encrypted = await encryptSecretMaterial("secret", {
      privateKeyHex: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      importedAs: "privateKey",
    });

    await expect(decryptSecretMaterial(encrypted, "wrong")).rejects.toThrow("Incorrect passphrase");
  });

  it("normalizes private key hex and rejects invalid values", () => {
    expect(normalizePrivateKeyHex("0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD")).toBe(
      "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    );

    expect(() => normalizePrivateKeyHex("short")).toThrow("Private key must be a 32-byte hex string");
  });
});
