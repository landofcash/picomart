import {describe, expect, it} from "vitest";
import {privateKeyToAccount} from "viem/accounts";
import {clearItemKeys, decodeBase64, decryptPayload, decryptStorageItem, deriveItemKeys, encodeBase64, normalizeAndVerifyMasterSignature, unwrapAesKey, WRAPPING_ALGORITHM} from "@zkbytes/sdk";
import fixture from "@picomart/order-protocol/fixtures/tempo/message-protocol-v1.json";
import {
  TempoOrderContextSchema, assertTempoReferenceAgreement, parseTempoMessage, parseTempoPrivateReference,
  parseTempoSealedReference, tempoReceivingSigningMessage, tempoReferenceCommitment, validateTempoObjectMetadata,
  canonicalJson, type TempoExpectedMessage, type TempoPrivateReference,
} from "@picomart/order-protocol/tempo-protocol";

const order = TempoOrderContextSchema.parse(fixture.order);
async function restoredKeys(role: "buyer" | "seller") {
  const account = privateKeyToAccount(fixture.testPrivateKeys[role] as `0x${string}`);
  const identity = role === "buyer" ? order.buyerIdentity : order.sellerIdentity;
  const message = tempoReceivingSigningMessage(identity.context);
  const signature = await account.signMessage({message});
  expect(signature).toBe(fixture.signatures[role]);
  const normalized = normalizeAndVerifyMasterSignature(signature, message, identity.context.account);
  try { return await deriveItemKeys(normalized); }
  finally { normalized.fill(0); }
}

describe("published SDK interoperability with packed Tempo protocol fixtures", () => {
  for (const example of fixture.examples) {
    it(`restores both identities, opens both references and decrypts ${example.expected.messageType}`, async () => {
      const expected = example.expected as TempoExpectedMessage;
      const binding = parseTempoMessage(example.plaintext, order, expected).binding;
      expect(tempoReferenceCommitment(binding, example.envelopes.buyer, example.envelopes.seller, order, expected)).toBe(example.commitment);
      const opened: TempoPrivateReference[] = [];
      for (const role of ["buyer", "seller"] as const) {
        const keys = await restoredKeys(role);
        try {
          const identity = role === "buyer" ? order.buyerIdentity : order.sellerIdentity;
          expect(encodeBase64(keys.encryptionPublicKey)).toBe(identity.publicKey);
          const envelope = parseTempoSealedReference(example.envelopes[role], order, role);
          const aesKey = await unwrapAesKey(envelope.context, {publicKey: envelope.recipientPublicKey, wrappingAlgorithm: WRAPPING_ALGORITHM, encryptedKey: envelope.encryptedKey}, keys.encryptionPrivateKey);
          try {
            const reference = parseTempoPrivateReference(await decryptPayload(envelope.encryptedPayload, aesKey), envelope, order, expected, fixture.origins, role);
            const item = await validateTempoObjectMetadata(example.item, reference, order);
            const decrypted = await decryptStorageItem(item, reference.reference.expectedCreator, keys.encryptionPrivateKey);
            expect(decrypted.expired).toBe(false);
            expect(decrypted.plaintext).toBe(example.plaintext);
            expect(parseTempoMessage(decrypted.plaintext, order, expected)).toEqual(example.payload);
            opened.push(reference);
          } finally { aesKey.fill(0); }
        } finally { clearItemKeys(keys); }
      }
      expect(() => assertTempoReferenceAgreement(opened[0], opened[1])).not.toThrow();
    });
  }
  it("rejects the other role's key and authenticated envelope tampering", async () => {
    const example = fixture.examples[0], keys = await restoredKeys("seller");
    const envelope = parseTempoSealedReference(example.envelopes.buyer, order, "buyer");
    try {
      await expect(unwrapAesKey(envelope.context, {publicKey:envelope.recipientPublicKey,wrappingAlgorithm:WRAPPING_ALGORITHM,encryptedKey:envelope.encryptedKey}, keys.encryptionPrivateKey)).rejects.toThrow();
    } finally { clearItemKeys(keys); }
    const buyer = await restoredKeys("buyer");
    try {
      const original = decodeBase64(envelope.encryptedKey), modified = original.slice(); modified[79] ^= 1;
      await expect(unwrapAesKey(envelope.context,{publicKey:envelope.recipientPublicKey,wrappingAlgorithm:WRAPPING_ALGORITHM,encryptedKey:encodeBase64(modified)},buyer.encryptionPrivateKey)).rejects.toThrow();
      expect(canonicalJson(JSON.parse(example.envelopes.buyer))).toBe(example.envelopes.buyer);
    } finally { clearItemKeys(buyer); }
  });
});
