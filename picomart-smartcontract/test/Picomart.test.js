const {expect} = require("chai");
const {ethers} = require("hardhat");
const {time,loadFixture} = require("@nomicfoundation/hardhat-network-helpers");
const fixture = require("../../picomart-order-protocol/fixtures/tempo/message-protocol-v1.json");
const catalogId = "0x0102030405060708090a0b0c0d0e0f10";
const orderId = "0x1112131415161718191a1b1c1d1e1f20";
const amount=1_000_000n;
const publicKey = role => ethers.hexlify(Buffer.from(fixture.order[role+"Identity"].publicKey,"base64"));
function identity(deployment,account,seed,key,seller) {
  const context = seller ? {account:account.toLowerCase(),catalogSeed:Buffer.from(seed.slice(2),"hex").toString("base64url"),chainId:42431,contractAddress:deployment.toLowerCase(),profile:"picomart-receiving-v1",role:"seller",version:1}
    : {account:account.toLowerCase(),chainId:42431,contractAddress:deployment.toLowerCase(),orderSeed:Buffer.from(seed.slice(2),"hex").toString("base64url"),profile:"picomart-receiving-v1",role:"buyer",version:1};
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({context,publicKey:Buffer.from(key.slice(2),"hex").toString("base64")})));
}
// Contract tests deliberately use opaque bytes; SDK decryption is covered by application fixtures.
const message = (tag="order") => ({sequence:1,buyerEnvelope:ethers.toUtf8Bytes(`buyer ${tag}`),sellerEnvelope:ethers.toUtf8Bytes(`seller ${tag}`)});
async function setup() {
  const [deployer,admin,seller,buyer,payer,stranger]=await ethers.getSigners();
  const token=await (await ethers.getContractFactory("PolicyToken")).deploy();
  const market=await (await ethers.getContractFactory("Picomart",deployer)).deploy(admin.address,token);
  const address=await market.getAddress(),tokenAddress=await token.getAddress();
  const sellerKey=publicKey("seller"),buyerKey=publicKey("buyer");
  await market.connect(seller).createCatalog(catalogId,sellerKey,"https://catalog.picomart.example/catalog.json");
  const input={orderId,catalogId,priceAmount:amount,priceToken:tokenAddress,expectedSeller:seller.address,expectedSellerPublicKey:sellerKey,
    expectedSellerIdentityId:identity(address,seller.address,catalogId,sellerKey,true),buyerPublicKey:buyerKey,buyerIdentityId:identity(address,buyer.address,orderId,buyerKey,false)};
  for (const account of [buyer,payer]) {await token.mint(account.address,amount*10n);await token.connect(account).approve(market,amount*10n);}
  return {market,token,deployer,admin,seller,buyer,payer,stranger,input};
}
async function paid(s) {await s.market.connect(s.buyer).createOrderInitial(s.input,message());await s.market.connect(s.payer).buyOrder(orderId);}
async function delivering(s) {await paid(s);await s.market.connect(s.seller).startDelivering(orderId,message("delivery"));}
async function refund(s) {await delivering(s);await s.market.connect(s.buyer).requireRefund(orderId);}
describe("Picomart Tempo catalogs, escrow and bounded lifecycle",function () {
  it("initializes a separate administrator, one token and immutable five-day stages",async function () {
    const s=await loadFixture(setup);
    expect(await s.market.owner()).to.equal(s.admin.address);expect(await s.market.owner()).not.to.equal(s.deployer.address);
    expect(await s.market.allowedPaymentTokens(s.token)).to.equal(true);expect(await s.market.STAGE_WINDOW()).to.equal(5*86400);
    const factory=await ethers.getContractFactory("Picomart",s.deployer);
    await expect(factory.deploy(s.deployer.address,s.token)).to.be.revertedWithCustomError(s.market,"InvalidInput");
    await expect(factory.deploy(ethers.ZeroAddress,s.token)).to.be.revertedWithCustomError(s.market,"OwnableInvalidOwner");
    await expect(s.market.connect(s.admin).renounceOwnership()).to.be.revertedWithCustomError(s.market,"InvalidInput");
  });
  it("uses two-step ownership transfer and excludes the deployer from admin actions",async function () {
    const s=await loadFixture(setup);
    await expect(s.market.connect(s.deployer).setPaymentTokenAllowed(s.token,false)).to.be.revertedWithCustomError(s.market,"OwnableUnauthorizedAccount");
    await s.market.connect(s.admin).transferOwnership(s.stranger.address);expect(await s.market.owner()).to.equal(s.admin.address);
    await expect(s.market.connect(s.payer).acceptOwnership()).to.be.revertedWithCustomError(s.market,"OwnableUnauthorizedAccount");
    await s.market.connect(s.stranger).acceptOwnership();expect(await s.market.owner()).to.equal(s.stranger.address);
  });
  it("computes catalog identities independently and restricts catalog writes",async function () {
    const s=await loadFixture(setup),catalog=await s.market.catalogs(catalogId);
    expect(catalog.sellerIdentityId).to.equal(s.input.expectedSellerIdentityId);
    await expect(s.market.connect(s.stranger).updateCatalog(catalogId,publicKey("seller"),"evil")).to.be.revertedWithCustomError(s.market,"Unauthorized");
    await expect(s.market.connect(s.stranger).deleteCatalog(catalogId)).to.be.revertedWithCustomError(s.market,"Unauthorized");
    await expect(s.market.connect(s.seller).createCatalog(catalogId,publicKey("seller"),"url")).to.be.revertedWithCustomError(s.market,"InvalidInput");
    await expect(s.market.connect(s.seller).updateCatalog(catalogId,publicKey("seller"),"x".repeat(2049))).to.be.revertedWithCustomError(s.market,"InvalidInput");
  });
  it("runs pay-later through a distinct payer, delivery and buyer confirmation",async function () {
    const s=await loadFixture(setup);await paid(s);
    let order=await s.market.getOrder(orderId);expect(order.payer).to.equal(s.payer.address);expect(order.buyer).to.equal(s.buyer.address);
    expect(order.buyerIdentityId).to.equal(s.input.buyerIdentityId);expect(order.status).to.equal(2);expect(await s.token.balanceOf(s.market)).to.equal(amount);
    await s.market.connect(s.seller).startDelivering(orderId,message("delivery"));await s.market.connect(s.buyer).confirmOrder(orderId);
    order=await s.market.getOrder(orderId);expect(order.status).to.equal(4);expect(order.deadline).to.equal(0);
    expect(await s.token.balanceOf(s.seller)).to.equal(amount);expect(await s.market.escrowedAmounts(s.token)).to.equal(0);
  });
  it("creates and funds an order atomically",async function () {
    const s=await loadFixture(setup);await s.market.connect(s.buyer).createOrderPaid(s.input,message());
    expect((await s.market.getOrder(orderId)).payer).to.equal(s.buyer.address);expect(await s.token.balanceOf(s.market)).to.equal(amount);
    await expect(s.market.connect(s.buyer).createOrderPaid(s.input,message())).to.be.revertedWithCustomError(s.market,"OrderIdConsumed");
  });
  it("rejects HBAR/native value, zero/unsupported assets, zero amounts and a wrong buyer snapshot",async function () {
    const s=await loadFixture(setup);
    await expect(s.market.connect(s.buyer).createOrderPaid(s.input,message(),{value:1})).to.be.reverted;
    await expect(s.market.connect(s.buyer).createOrderInitial({...s.input,priceToken:ethers.ZeroAddress},message())).to.be.revertedWithCustomError(s.market,"UnsupportedToken");
    await expect(s.market.connect(s.buyer).createOrderInitial({...s.input,priceAmount:0},message())).to.be.revertedWithCustomError(s.market,"InvalidInput");
    await expect(s.market.connect(s.stranger).createOrderInitial(s.input,message())).to.be.revertedWithCustomError(s.market,"InvalidInput");
  });
  it("rejects catalog changes between preparation and creation or pay-later funding",async function () {
    const s=await loadFixture(setup);await s.market.connect(s.buyer).createOrderInitial(s.input,message());
    await s.market.connect(s.seller).updateCatalog(catalogId,publicKey("buyer"),"updated");
    await expect(s.market.connect(s.payer).buyOrder(orderId)).to.be.revertedWithCustomError(s.market,"StaleCatalog");
    const otherId="0x"+"ab".repeat(16),input={...s.input,orderId:otherId,buyerIdentityId:identity(await s.market.getAddress(),s.buyer.address,otherId,s.input.buyerPublicKey,false)};
    await expect(s.market.connect(s.buyer).createOrderInitial(input,message())).to.be.revertedWithCustomError(s.market,"StaleCatalog");
  });
  it("keeps paid order snapshots after catalog deletion",async function () {
    const s=await loadFixture(setup);await paid(s);await s.market.connect(s.seller).deleteCatalog(catalogId);
    await s.market.connect(s.seller).startDelivering(orderId,message("delivery"));await s.market.connect(s.buyer).confirmOrder(orderId);
    expect((await s.market.getOrder(orderId)).status).to.equal(4);
  });
  for (const canceller of ["buyer","payer","admin"]) {
    it(`lets ${canceller} cancel paid orders and refunds the payer`,async function () {
      const s=await loadFixture(setup);await paid(s);const balance=await s.token.balanceOf(s.payer);
      await s.market.connect(s[canceller]).cancelOrder(orderId);
      expect((await s.market.getOrder(orderId)).status).to.equal(8);expect(await s.token.balanceOf(s.payer)).to.equal(balance+amount);
    });
  }
  it("lets the seller refuse and refunds the payer",async function () {
    const s=await loadFixture(setup);await paid(s);await s.market.connect(s.seller).refuseOrder(orderId,message("refusal"));
    expect(await s.token.balanceOf(s.payer)).to.equal(amount*10n);expect((await s.market.getOrder(orderId)).status).to.equal(8);
  });
  for (const recipient of ["Buyer","Seller"]) {
    it(`lets only the admin resolve a refund to ${recipient.toLowerCase()}`,async function () {
      const s=await loadFixture(setup);await refund(s);const method="processRefundTo"+recipient;
      await expect(s.market.connect(s.stranger)[method](orderId)).to.be.revertedWithCustomError(s.market,"OwnableUnauthorizedAccount");
      await s.market.connect(s.admin)[method](orderId);
      expect((await s.market.getOrder(orderId)).status).to.equal(recipient === "Buyer" ? 6 : 7);
      expect(await s.token.balanceOf(recipient === "Buyer" ? s.payer : s.seller)).to.equal(recipient === "Buyer" ? amount*10n : amount);
    });
  }
  for (const [stage,prepare,finalState,recipient] of [
    ["unpaid",async s=>s.market.connect(s.buyer).createOrderInitial(s.input,message()),8,null],
    ["paid",paid,8,"payer"],["delivery",delivering,4,"seller"],["refund",refund,6,"payer"],
  ]) {
    it(`settles ${stage} at the exact deadline through an unrelated caller`,async function () {
      const s=await loadFixture(setup);await prepare(s);const order=await s.market.getOrder(orderId);
      await time.setNextBlockTimestamp(order.deadline-1n);
      await expect(s.market.connect(s.stranger).checkTimeouts(orderId)).to.be.revertedWithCustomError(s.market,"DeadlineNotReached");
      await time.setNextBlockTimestamp(order.deadline);await s.market.connect(s.stranger).checkTimeouts(orderId);
      expect((await s.market.getOrder(orderId)).status).to.equal(finalState);expect(await s.market.escrowedAmounts(s.token)).to.equal(0);
      if (recipient) expect(await s.token.balanceOf(s[recipient])).to.equal(recipient === "payer" ? amount*10n : amount);
      await expect(s.market.checkTimeouts(orderId)).to.be.revertedWithCustomError(s.market,"DeadlineNotReached");
    });
  }
  it("cannot extend a expired stage or change the refund winner after its deadline",async function () {
    const s=await loadFixture(setup);await paid(s);let order=await s.market.getOrder(orderId);
    await time.setNextBlockTimestamp(order.deadline);await expect(s.market.connect(s.seller).startDelivering(orderId,message("late"))).to.be.revertedWithCustomError(s.market,"DeadlinePassed");
    await s.market.checkTimeouts(orderId);
    // The separately restored fixture proves the administrator is bounded too.
    const r=await loadFixture(setup);await refund(r);order=await r.market.getOrder(orderId);
    await time.setNextBlockTimestamp(order.deadline);await expect(r.market.connect(r.admin).processRefundToSeller(orderId)).to.be.revertedWithCustomError(r.market,"DeadlinePassed");
    await r.market.checkTimeouts(orderId);expect((await r.market.getOrder(orderId)).status).to.equal(6);
  });
  it("cannot transition at the unpaid or delivery deadline",async function () {
    const s=await loadFixture(setup);await s.market.connect(s.buyer).createOrderInitial(s.input,message());
    await time.setNextBlockTimestamp((await s.market.getOrder(orderId)).deadline);
    await expect(s.market.connect(s.payer).buyOrder(orderId)).to.be.revertedWithCustomError(s.market,"DeadlinePassed");
    const d=await loadFixture(setup);await delivering(d);await time.setNextBlockTimestamp((await d.market.getOrder(orderId)).deadline);
    await expect(d.market.connect(d.buyer).requireRefund(orderId)).to.be.revertedWithCustomError(d.market,"DeadlinePassed");
  });
  it("enforces a maximum twenty-day decision horizon across all four stages",async function () {
    const s=await loadFixture(setup);await s.market.connect(s.buyer).createOrderInitial(s.input,message());const created=(await s.market.getOrder(orderId)).createdTs;
    await time.setNextBlockTimestamp((await s.market.getOrder(orderId)).deadline-1n);await s.market.connect(s.payer).buyOrder(orderId);
    await time.setNextBlockTimestamp((await s.market.getOrder(orderId)).deadline-1n);await s.market.connect(s.seller).startDelivering(orderId,message("delivery"));
    await time.setNextBlockTimestamp((await s.market.getOrder(orderId)).deadline-1n);await s.market.connect(s.buyer).requireRefund(orderId);
    expect((await s.market.getOrder(orderId)).deadline-created).to.be.lessThanOrEqual(20n*86400n);
  });
  it("restricts lifecycle roles and disallows paying/settling twice",async function () {
    const s=await loadFixture(setup);await paid(s);
    await expect(s.market.connect(s.stranger).cancelOrder(orderId)).to.be.revertedWithCustomError(s.market,"Unauthorized");
    await expect(s.market.connect(s.buyer).startDelivering(orderId,message())).to.be.revertedWithCustomError(s.market,"Unauthorized");
    await expect(s.market.connect(s.payer).buyOrder(orderId)).to.be.revertedWithCustomError(s.market,"InvalidState");
    await s.market.connect(s.seller).startDelivering(orderId,message("delivery"));
    await expect(s.market.connect(s.payer).confirmOrder(orderId)).to.be.revertedWithCustomError(s.market,"Unauthorized");
    await s.market.connect(s.buyer).confirmOrder(orderId);
    await expect(s.market.connect(s.buyer).confirmOrder(orderId)).to.be.revertedWithCustomError(s.market,"InvalidState");
  });
  it("preserves tombstones after unpaid and terminal deletion",async function () {
    const s=await loadFixture(setup);await s.market.connect(s.buyer).createOrderInitial(s.input,message());await s.market.connect(s.buyer).deleteOrder(orderId);
    expect((await s.market.getOrder(orderId)).status).to.equal(0);expect(await s.market.consumedOrderIds(orderId)).to.equal(true);
    await expect(s.market.connect(s.buyer).createOrderInitial(s.input,message())).to.be.revertedWithCustomError(s.market,"OrderIdConsumed");
    const t=await loadFixture(setup);await paid(t);await expect(t.market.connect(t.buyer).deleteOrder(orderId)).to.be.revertedWithCustomError(t.market,"InvalidState");
    await t.market.connect(t.seller).refuseOrder(orderId,message("refuse"));await t.market.connect(t.seller).deleteOrder(orderId);
    await expect(t.market.connect(t.buyer).createOrderPaid(t.input,message())).to.be.revertedWithCustomError(t.market,"OrderIdConsumed");
  });
  it("rejects invalid sequences, envelope bounds and identical envelopes",async function () {
    const s=await loadFixture(setup);
    await expect(s.market.connect(s.buyer).createOrderInitial(s.input,{...message(),sequence:2})).to.be.revertedWithCustomError(s.market,"InvalidInput");
    await expect(s.market.connect(s.buyer).createOrderInitial(s.input,{...message(),buyerEnvelope:"0x"+"01".repeat(8193)})).to.be.revertedWithCustomError(s.market,"InvalidReference");
    const m=message();await expect(s.market.connect(s.buyer).createOrderInitial(s.input,{...m,sellerEnvelope:m.buyerEnvelope})).to.be.revertedWithCustomError(s.market,"InvalidReference");
    expect(await s.market.consumedOrderIds(orderId)).to.equal(false);
  });
  it("binds emitted ciphertext to deployment, order, author, type and snapshots",async function () {
    const s=await loadFixture(setup),m=message(),tx=await s.market.connect(s.buyer).createOrderInitial(s.input,m),receipt=await tx.wait();
    const event=receipt.logs.map(log=>{try{return s.market.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name === "OrderMessage");
    const encoded=ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","uint8","bytes32","uint256","address","bytes16","uint8","uint32","address","bytes32","bytes32","bytes32","bytes32"],
      [ethers.id("picomart-reference-commitment-v1"),1,ethers.id("picomart-sealed-reference-v1"),42431,await s.market.getAddress(),orderId,1,1,s.buyer.address,s.input.buyerIdentityId,s.input.expectedSellerIdentityId,ethers.keccak256(m.buyerEnvelope),ethers.keccak256(m.sellerEnvelope)]);
    expect(event.args.commitment).to.equal(ethers.keccak256(encoded));expect(event.args.commitment).to.equal((await s.market.getOrder(orderId)).buyerCommitment);
    expect(event.args.buyerEnvelope).to.equal(ethers.hexlify(m.buyerEnvelope));expect(event.args.author).to.equal(s.buyer.address);
  });
  it("rolls back diverted deposits and does not consume the order ID",async function () {
    const s=await loadFixture(setup);await s.token.configure(s.market,true,0,false);
    await expect(s.market.connect(s.buyer).createOrderPaid(s.input,message())).to.be.revertedWithCustomError(s.market,"InexactTransfer");
    expect(await s.market.consumedOrderIds(orderId)).to.equal(false);expect(await s.market.escrowedAmounts(s.token)).to.equal(0);
    expect(await s.token.balanceOf(s.buyer)).to.equal(amount*10n);expect(await s.token.balanceOf(await s.token.GUARD())).to.equal(0);
  });
  for (const [name,prepare,recipient,settle] of [
    ["confirmation",delivering,"seller",s=>s.market.connect(s.buyer).confirmOrder(orderId)],
    ["cancellation",paid,"payer",s=>s.market.connect(s.buyer).cancelOrder(orderId)],
    ["refusal",paid,"payer",s=>s.market.connect(s.seller).refuseOrder(orderId,message("refusal"))],
    ["admin payer refund",refund,"payer",s=>s.market.connect(s.admin).processRefundToBuyer(orderId)],
    ["admin seller refund",refund,"seller",s=>s.market.connect(s.admin).processRefundToSeller(orderId)],
  ]) {
    it(`rolls back ${name} when the token diverts the payout`,async function () {
      const s=await loadFixture(setup);await prepare(s);const before=await s.market.getOrder(orderId);
      await s.token.configure(s[recipient].address,true,0,false);await expect(settle(s)).to.be.revertedWithCustomError(s.market,"InexactTransfer");
      expect(await s.market.getOrder(orderId)).to.deep.equal(before);expect(await s.token.balanceOf(s.market)).to.equal(amount);
      expect(await s.market.escrowedAmounts(s.token)).to.equal(amount);expect(await s.token.balanceOf(await s.token.GUARD())).to.equal(0);
    });
  }
  it("retains overdue escrow until the recipient policy allows an exact retry",async function () {
    const s=await loadFixture(setup);await paid(s);await s.token.configure(s.payer.address,true,0,false);
    await time.setNextBlockTimestamp((await s.market.getOrder(orderId)).deadline);
    await expect(s.market.checkTimeouts(orderId)).to.be.revertedWithCustomError(s.market,"InexactTransfer");
    expect((await s.market.getOrder(orderId)).status).to.equal(2);
    await s.token.configure(s.payer.address,false,0,false);await s.market.connect(s.stranger).checkTimeouts(orderId);
    expect((await s.market.getOrder(orderId)).status).to.equal(8);
  });
  it("settles existing escrow even after the admin removes its token",async function () {
    const s=await loadFixture(setup);await paid(s);await s.market.connect(s.admin).setPaymentTokenAllowed(s.token,false);
    await s.market.connect(s.buyer).cancelOrder(orderId);expect(await s.token.balanceOf(s.payer)).to.equal(amount*10n);
  });
  it("rolls back false-returning and reverting tokens, including allowances",async function () {
    const s=await loadFixture(setup);await s.token.configureReturn(1);
    await expect(s.market.connect(s.buyer).createOrderPaid(s.input,message())).to.be.revertedWithCustomError(s.market,"SafeERC20FailedOperation");
    expect(await s.market.consumedOrderIds(orderId)).to.equal(false);expect(await s.token.allowance(s.buyer,s.market)).to.equal(amount*10n);
    await s.token.configureReturn(0);await paid(s);await s.token.configure(s.payer.address,false,0,true);
    await expect(s.market.connect(s.buyer).cancelOrder(orderId)).to.be.revertedWith("policy failure");
    expect((await s.market.getOrder(orderId)).status).to.equal(2);expect(await s.market.escrowedAmounts(s.token)).to.equal(amount);
  });
  it("accepts exact transfers without return data",async function () {
    const s=await loadFixture(setup);await s.token.configureReturn(2);await paid(s);await s.market.connect(s.buyer).cancelOrder(orderId);
    expect(await s.token.balanceOf(s.payer)).to.equal(amount*10n);
  });
  it("rejects callback reentrancy during deposits and payouts",async function () {
    const s=await loadFixture(setup),callback=s.market.interface.encodeFunctionData("cancelOrder",[orderId]);
    await s.token.configureCallback(s.market,callback);
    await expect(s.market.connect(s.buyer).createOrderPaid(s.input,message())).to.be.revertedWithCustomError(s.market,"ReentrancyGuardReentrantCall");
    expect(await s.market.consumedOrderIds(orderId)).to.equal(false);
    await s.token.configureCallback(ethers.ZeroAddress,"0x");await paid(s);await s.token.configureCallback(s.market,callback);
    await expect(s.market.connect(s.buyer).cancelOrder(orderId)).to.be.revertedWithCustomError(s.market,"ReentrancyGuardReentrantCall");
    expect((await s.market.getOrder(orderId)).status).to.equal(2);expect(await s.market.escrowedAmounts(s.token)).to.equal(amount);
  });
});
