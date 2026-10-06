import {describe, expect, it} from "vitest";
import fixture from "../fixtures/tempo/message-protocol-v1.json";
import {canonicalBytes, canonicalJson} from "./canonical.js";
import {bytesToBase64} from "./binary.js";
import {
  MAX_TEMPO_ENVELOPE_BYTES, TEMPO_REFERENCE_ABI_TYPES, TempoAddressSchema, TempoAmountSchema, TempoReceivingContextSchema,
  TempoOrderContextSchema, TempoStorageSeedSchema, TempoTimestampSchema,
  assertTempoMessageBinding, assertTempoReferenceAgreement, createTempoReceivingContext, createTempoReceivingIdentity,
  encodeTempoReferenceCommitment, normalizeTempoAddress, parseTempoMessage, parseTempoPrivateReference, parseTempoSealedReference,
  serializeTempoMessage, serializeTempoSealedReference, tempoIdToSeed, tempoReceivingSigningMessage, tempoReferenceCommitment,
  tempoSeedToId, tempoStorageObjectDigest, validateTempoObjectMetadata,
  type TempoExpectedMessage, type TempoOrderContext, type TempoReceivingContext, type TempoSealedReference,
} from "./tempoProtocol.js";

const order = TempoOrderContextSchema.parse(fixture.order);
const examples = fixture.examples;
const expectedFor = (example: typeof examples[number]) => example.expected as TempoExpectedMessage;
const buyerEnvelope = (example = examples[0]) => parseTempoSealedReference(example.envelopes.buyer, order, "buyer");
const sellerEnvelope = (example = examples[0]) => parseTempoSealedReference(example.envelopes.seller, order, "seller");
const opened = (example: typeof examples[number], role: "buyer" | "seller") => parseTempoPrivateReference(
  canonicalJson(example.privateReferences[role]), role === "buyer" ? buyerEnvelope(example) : sellerEnvelope(example), order, expectedFor(example), fixture.origins, role,
);

describe("Tempo receiving identities", () => {
  it("pins exact signer bytes and identity IDs for buyer and seller fixture contexts", () => {
    for (const role of ["buyer", "seller"] as const) {
      const identity = role === "buyer" ? order.buyerIdentity : order.sellerIdentity;
      expect(tempoReceivingSigningMessage(identity.context)).toBe(fixture.messages[role]);
      expect(createTempoReceivingIdentity(identity.context, identity.publicKey)).toEqual(identity);
      expect(fixture.messages[role].endsWith("\n")).toBe(false);
    }
  });
  it("normalizes builder addresses while enforcing lowercase addresses on the wire", () => {
    const input = {...order.buyerIdentity.context, account: order.buyerIdentity.context.account.toUpperCase().replace("0X", "0x")} as TempoReceivingContext;
    expect(createTempoReceivingContext(input)).toEqual(order.buyerIdentity.context);
    expect(TempoReceivingContextSchema.safeParse(input).success).toBe(false);
    expect(normalizeTempoAddress(input.account)).toBe(order.buyerIdentity.context.account);
    expect(TempoAddressSchema.safeParse(`0x${"0".repeat(40)}`).success).toBe(false);
  });
  it("keeps wallet label/time out of deterministic contexts and rejects extra fields", () => {
    expect(TempoReceivingContextSchema.safeParse({...order.buyerIdentity.context, label: "new name"}).success).toBe(false);
    expect(TempoReceivingContextSchema.safeParse({...order.sellerIdentity.context, timestamp: 1}).success).toBe(false);
    expect(TempoReceivingContextSchema.safeParse({...order.buyerIdentity.context, chainId: 0}).success).toBe(false);
  });
  it("rejects noncanonical public seeds and cross-role seed substitution", () => {
    const buyer = order.buyerIdentity.context;
    expect(TempoReceivingContextSchema.safeParse({...buyer, orderSeed: `${order.orderSeed}==`}).success).toBe(false);
    expect(TempoReceivingContextSchema.safeParse({...buyer, orderSeed: "A".repeat(22)}).success).toBe(false);
    expect(TempoReceivingContextSchema.safeParse({...buyer, role: "seller"}).success).toBe(false);
  });
  it("pins 16-byte ID roundtrips and rejects invalid ID lengths", () => {
    expect(tempoSeedToId(order.orderSeed)).toBe("0x1112131415161718191a1b1c1d1e1f20");
    expect(tempoIdToSeed(tempoSeedToId(order.orderSeed))).toBe(order.orderSeed);
    expect(() => tempoIdToSeed(`0x${"11".repeat(32)}`)).toThrow();
  });
  it("rejects modified identity IDs, keys and deployment snapshots", () => {
    expect(TempoOrderContextSchema.safeParse({...order, buyerIdentity: {...order.buyerIdentity, publicKey: order.sellerIdentity.publicKey}}).success).toBe(false);
    expect(TempoOrderContextSchema.safeParse({...order, contractAddress: `0x${"44".repeat(20)}`}).success).toBe(false);
    expect(TempoOrderContextSchema.safeParse({...order, orderSeed: order.catalogSeed}).success).toBe(false);
  });
});

describe("Tempo bound messages", () => {
  for (const example of examples) {
    it(`pins canonical ${example.expected.messageType} plaintext and role/sequence binding`, () => {
      const expected = expectedFor(example);
      expect(parseTempoMessage(example.plaintext, order, expected)).toEqual(example.payload);
      expect(serializeTempoMessage(example.payload, order, expected)).toBe(example.plaintext);
      expect(assertTempoMessageBinding(example.binding, order, expected)).toEqual(example.binding);
    });
  }
  it("rejects spoofed authors, recipient identity IDs and replayed sequences", () => {
    const example = examples[0], expected = expectedFor(example);
    for (const binding of [
      {...example.binding, author: order.sellerIdentity.context.account},
      {...example.binding, sequence: 2},
      {...example.binding, buyerIdentityId: order.sellerIdentity.identityId},
      {...example.binding, orderId: tempoSeedToId(order.catalogSeed)},
      {...example.binding, contractAddress: `0x${"44".repeat(20)}`},
    ]) expect(() => assertTempoMessageBinding(binding, order, expected)).toThrow();
  });
  it("checks quantities/totals, distinct products and buyer catalog context", () => {
    const example = examples[0], data = example.payload.data;
    for (const modified of [
      {...data, payment: {tokenAddress: "0x20c0000000000000000000000000000000000000", amount: "1"}},
      {...data, catalogSeed: order.orderSeed},
      {...data, items: [{productId: "p", name: "p", quantity: 2, unitAmount: "1", lineAmount: "1"}]},
    ]) expect(() => serializeTempoMessage({...example.payload, data: modified}, order, expectedFor(example))).toThrow();
    expect(TempoAmountSchema.safeParse((2n ** 256n).toString()).success).toBe(false);
    expect(TempoAmountSchema.safeParse("01").success).toBe(false);
  });
  it("enforces UTF-8 limits, strict fields and canonical JSON before accepting plaintext", () => {
    const example = examples[1];
    expect(() => serializeTempoMessage({...example.payload, data: {shipmentCode: "", customInfo: "😀".repeat(4097)}}, order, expectedFor(example))).toThrow();
    expect(() => parseTempoMessage(` ${example.plaintext}`, order, expectedFor(example))).toThrow("canonical");
    expect(() => serializeTempoMessage({...example.payload, deliveryKey: "should not exist"}, order, expectedFor(example))).toThrow();
    expect(() => parseTempoMessage(example.plaintext.replace('{"binding"', '{"version":1,"binding"'), order, expectedFor(example))).toThrow();
  });
  it("rejects lone Unicode surrogates rather than claiming RFC 8785 canonical plaintext", () => {
    const example = examples[1];
    for (const text of ["\ud800", "\udc00", "\ud800x"]) {
      expect(() => serializeTempoMessage({...example.payload, data:{shipmentCode:"",customInfo:text}}, order, expectedFor(example))).toThrow();
    }
  });
});

describe("Tempo encrypted full references", () => {
  for (const example of examples) {
    it(`pins independent ABI/keccak and SHA-256 vectors for ${example.expected.messageType}`, async () => {
      const binding = assertTempoMessageBinding(example.binding, order, expectedFor(example));
      expect(TEMPO_REFERENCE_ABI_TYPES).toEqual(fixture.abiTypes);
      expect(encodeTempoReferenceCommitment(binding, example.envelopes.buyer, example.envelopes.seller, order, expectedFor(example))).toBe(example.abiEncoded);
      expect(tempoReferenceCommitment(binding, example.envelopes.buyer, example.envelopes.seller, order, expectedFor(example))).toBe(example.commitment);
      expect(await tempoStorageObjectDigest(example.item)).toBe(example.objectDigest);
      const buyer = opened(example, "buyer"), seller = opened(example, "seller");
      expect(() => assertTempoReferenceAgreement(buyer, seller)).not.toThrow();
      expect(await validateTempoObjectMetadata(example.item, buyer, order)).toEqual(example.item);
    });
  }
  it("keeps locators and private object metadata out of public binding/envelopes", () => {
    for (const example of examples) {
      const publicBytes = canonicalJson(example.binding) + example.envelopes.buyer + example.envelopes.seller;
      const reference = example.privateReferences.buyer.reference;
      for (const secret of [reference.seed, reference.apiOrigin, reference.downloadOrigin, reference.expiresAt, reference.expectedCreator.publicKey, example.objectDigest]) expect(publicBytes).not.toContain(secret);
      expect(buyerEnvelope(example).context).not.toBe(reference.seed);
      expect(sellerEnvelope(example).context).not.toBe(reference.seed);
    }
  });
  it("rejects swapped roles, wrong recipient keys and shared public wrapping contexts", () => {
    const example = examples[0];
    expect(() => parseTempoSealedReference(example.envelopes.buyer, order, "seller")).toThrow();
    expect(() => serializeTempoSealedReference({...buyerEnvelope(), recipientPublicKey: order.sellerIdentity.publicKey}, order, "buyer")).toThrow();
    const seller = {...sellerEnvelope(), context: buyerEnvelope().context};
    expect(() => tempoReferenceCommitment(assertTempoMessageBinding(example.binding, order, expectedFor(example)), example.envelopes.buyer, canonicalJson(seller), order, expectedFor(example))).toThrow("independent");
  });
  it("rejects private/public metadata substitutions and arbitrary service origins before download", () => {
    const example = examples[0];
    for (const changed of [
      {...example.privateReferences.buyer, header: example.privateReferences.seller.header},
      {...example.privateReferences.buyer, reference: {...example.privateReferences.buyer.reference, apiOrigin: "https://evil.example"}},
      {...example.privateReferences.buyer, header: {...example.privateReferences.buyer.header, context: example.item.seed}},
    ]) expect(() => parseTempoPrivateReference(canonicalJson(changed), buyerEnvelope(), order, expectedFor(example), fixture.origins, "buyer")).toThrow();
    expect(() => parseTempoPrivateReference(canonicalJson(example.privateReferences.buyer), buyerEnvelope(), order, {messageType:"buyer-order",sequence:2}, fixture.origins, "buyer")).toThrow();
  });
  it("rejects envelope padding/size violations, noncanonical timestamps and unknown profiles", () => {
    expect(() => parseTempoSealedReference(" ".repeat(MAX_TEMPO_ENVELOPE_BYTES + 1), order, "buyer")).toThrow("limit");
    expect(() => serializeTempoSealedReference({...buyerEnvelope(), encryptedKey: buyerEnvelope().encryptedKey.replace(/=+$/, "")}, order, "buyer")).toThrow();
    expect(() => serializeTempoSealedReference({...buyerEnvelope(), referenceProfile: "v2"}, order, "buyer")).toThrow();
    expect(TempoTimestampSchema.safeParse("2099-02-30T00:00:00Z").success).toBe(false);
    expect(TempoTimestampSchema.safeParse("2099-01-01T00:00:00.000Z").success).toBe(false);
    expect(TempoStorageSeedSchema.safeParse("A".repeat(26)).success).toBe(false);
    expect(TempoStorageSeedSchema.safeParse("a".repeat(25) + "b").success).toBe(false);
  });
  it("rejects altered item metadata and deleted recipients even under a recomputed digest", async () => {
    const example = examples[0], privateReference = opened(example, "buyer");
    await expect(validateTempoObjectMetadata({...example.item, seed: "a".repeat(26)}, privateReference, order)).rejects.toThrow();
    const wrongItem = {...example.item, encryptedKeys: example.item.encryptedKeys.filter(key => key.publicKey !== order.sellerIdentity.publicKey)};
    await expect(validateTempoObjectMetadata(wrongItem, {...privateReference, objectDigest: await tempoStorageObjectDigest(wrongItem)}, order)).rejects.toThrow();
    const changedSignature = {...example.item, itemSignature: {value: bytesToBase64(new Uint8Array(64))}};
    await expect(validateTempoObjectMetadata(changedSignature, privateReference, order)).rejects.toThrow();
  });
  it("changes the commitment when valid ciphertext changes and rejects private disagreement", () => {
    const example = examples[0], changed = {...buyerEnvelope(), encryptedKey: bytesToBase64(new Uint8Array(80))};
    const binding = assertTempoMessageBinding(example.binding, order, expectedFor(example));
    expect(tempoReferenceCommitment(binding, canonicalJson(changed), example.envelopes.seller, order, expectedFor(example))).not.toBe(example.commitment);
    expect(() => assertTempoReferenceAgreement(opened(example,"buyer"), {...opened(example,"seller"), objectDigest:`0x${"00".repeat(32)}`})).toThrow();
  });
  it("includes complete signed item bytes in the digest, not only its ciphertext", async () => {
    const example = examples[0];
    expect(canonicalBytes(example.item).length).toBeGreaterThan(example.item.encryptedPayload.length);
    await expect(tempoStorageObjectDigest({...example.item, managers: [example.item.creator]})).rejects.toThrow();
  });
});
