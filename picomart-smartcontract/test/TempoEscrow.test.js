const {expect} = require("chai");
const {ethers} = require("hardhat");
describe("Tempo exact-transfer escrow primitives", function () {
  let escrow, token, payer, seller;
  beforeEach(async function () {
    [payer,seller] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("PolicyToken")).deploy();
    escrow = await (await ethers.getContractFactory("TempoEscrowHarness")).deploy();
    await token.mint(payer.address,1000); await token.approve(escrow,1000);
  });
  it("deposits and pays the exact amount", async function () {
    await escrow.deposit(token,100); expect(await token.balanceOf(escrow)).to.equal(100);
    await escrow.payout(token,seller.address,100); expect(await token.balanceOf(seller)).to.equal(100);
  });
  it("rolls back a successful but diverted deposit", async function () {
    await token.configure(escrow,true,0,false);
    await expect(escrow.deposit(token,100)).to.be.revertedWithCustomError(escrow,"InexactTransfer");
    expect(await token.balanceOf(payer)).to.equal(1000); expect(await token.allowance(payer,escrow)).to.equal(1000);
    expect(await token.balanceOf(await token.GUARD())).to.equal(0);
  });
  it("rolls back payout diversion without moving the escrow", async function () {
    await escrow.deposit(token,100); await token.configure(seller.address,true,0,false);
    await expect(escrow.payout(token,seller.address,100)).to.be.revertedWithCustomError(escrow,"InexactTransfer");
    expect(await token.balanceOf(escrow)).to.equal(100); expect(await token.balanceOf(await token.GUARD())).to.equal(0);
  });
  it("rejects transfer fees at either boundary", async function () {
    await token.configure(escrow,false,1,false);
    await expect(escrow.deposit(token,100)).to.be.revertedWithCustomError(escrow,"InexactTransfer");
    await token.configure(escrow,false,0,false); await escrow.deposit(token,100);
    await token.configure(seller.address,false,1,false);
    await expect(escrow.payout(token,seller.address,100)).to.be.revertedWithCustomError(escrow,"InexactTransfer");
    expect(await token.balanceOf(escrow)).to.equal(100);
  });
  it("rejects native value and invalid destinations", async function () {
    await expect(escrow.deposit(token,100,{value:1})).to.be.reverted;
    await expect(escrow.deposit(token,0)).to.be.revertedWithCustomError(escrow,"InexactTransfer");
    await expect(escrow.payout(token,ethers.ZeroAddress,100)).to.be.revertedWithCustomError(escrow,"InexactTransfer");
    await expect(escrow.payout(token,escrow,100)).to.be.revertedWithCustomError(escrow,"InexactTransfer");
  });
});
