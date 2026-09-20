const {expect} = require("chai");
const {deploymentFees} = require("../scripts/deployment-fees.cjs");
describe("Tempo deployment fee bounds",function () {
  it("adds a gas buffer and rounds attodollars up to token base units",function () {
    const q=deploymentFees(1n,{gasPrice:1n},1n);
    expect(q.gasLimit).to.equal(2n);expect(q.maximumFee).to.equal(1n);
    const normal=deploymentFees(15_000_000n,{maxFeePerGas:12_000_000_000n,maxPriorityFeePerGas:1n},216000n);
    expect(normal.gasLimit).to.equal(18_000_000n);expect(normal.maximumFee).to.equal(216000n);
  });
  it("caps the buffer without permitting an estimate beyond the transaction limit",function () {
    expect(deploymentFees(29_000_000n,{gasPrice:1n},100n).gasLimit).to.equal(30_000_000n);
    expect(()=>deploymentFees(30_000_001n,{gasPrice:1n},100n)).to.throw("gas limit");
  });
  it("rejects invalid quotes and insufficient balances before deployment",function () {
    for(const data of [{gasPrice:null},{gasPrice:0n},{maxFeePerGas:1n,maxPriorityFeePerGas:2n}]) expect(()=>deploymentFees(1n,data,100n)).to.throw("fee parameters");
    expect(()=>deploymentFees(15_000_000n,{gasPrice:12_000_000_000n},215999n)).to.throw("Insufficient PathUSD");
  });
});
