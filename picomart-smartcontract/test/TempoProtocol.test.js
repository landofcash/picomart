const {expect} = require("chai");
const {ethers} = require("hardhat");
const fixture = require("../../picomart-order-protocol/fixtures/tempo/message-protocol-v1.json");
const rawSeed = seed => ethers.hexlify(Buffer.from(seed, "base64url"));
const rawKey = key => ethers.hexlify(Buffer.from(key, "base64"));
const bindingFor = example => {
  const b = example.payload.binding;
  return {version:b.version, chainId:b.chainId, contractAddress:b.contractAddress, orderId:b.orderId,
    messageType:{"buyer-order":1,"seller-delivery":2,"seller-refusal":3}[b.messageType], sequence:b.sequence,
    author:b.author, buyerIdentityId:b.buyerIdentityId, sellerIdentityId:b.sellerIdentityId};
};
describe("Tempo Solidity interoperability with frozen SDK/ABI fixtures", function () {
  let harness;
  before(async function () { harness = await (await ethers.getContractFactory("TempoProtocolHarness")).deploy(); });
  for (const example of fixture.examples) {
    it(`matches complete ABI bytes and commitment for ${example.expected.messageType}`, async function () {
      const buyer = ethers.toUtf8Bytes(example.envelopes.buyer), seller = ethers.toUtf8Bytes(example.envelopes.seller);
      const encoded = await harness.encodeCommitment(bindingFor(example), buyer, seller);
      expect(encoded).to.equal(example.abiEncoded);
      expect(ethers.keccak256(encoded)).to.equal(example.commitment);
      expect(await harness.commitment(bindingFor(example),buyer,seller)).to.equal(example.commitment);
    });
  }
  for (const role of ["buyer","seller"]) {
    it(`reconstructs the canonical ${role} receiving identity`, async function () {
      const identity = fixture.order[role + "Identity"], context = identity.context;
      const seed = rawSeed(role === "buyer" ? context.orderSeed : context.catalogSeed);
      expect(await harness.receivingIdentity(context.contractAddress,context.account,seed,rawKey(identity.publicKey),role === "seller")).to.equal(identity.identityId);
      expect(await harness.publicSeed(seed)).to.equal(role === "buyer" ? context.orderSeed : context.catalogSeed);
    });
  }
  it("rejects unsupported domains, types, sequences and envelope sizes", async function () {
    const example=fixture.examples[0],binding=bindingFor(example),a=ethers.toUtf8Bytes(example.envelopes.buyer),b=ethers.toUtf8Bytes(example.envelopes.seller);
    for (const changed of [{chainId:1},{version:2},{sequence:0},{messageType:4},{author:ethers.ZeroAddress},{orderId:"0x"+"00".repeat(16)}]) {
      await expect(harness.commitment({...binding,...changed},a,b)).to.be.revertedWithCustomError(harness,"InvalidReference");
    }
    await expect(harness.commitment(binding,a,a)).to.be.revertedWithCustomError(harness,"InvalidReference");
    await expect(harness.commitment(binding,"0x",b)).to.be.revertedWithCustomError(harness,"InvalidReference");
    await expect(harness.commitment(binding,"0x"+"01".repeat(8193),b)).to.be.revertedWithCustomError(harness,"InvalidReference");
  });
});
