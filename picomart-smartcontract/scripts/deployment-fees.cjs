const MAX_GAS = 30_000_000n;
const ATTO_PER_MICRO = 1_000_000_000_000n;
// Tempo fee RPC units are attodollars; TIP-20 balances have six decimals.
function deploymentFees(estimate, feeData, balance) {
  if (estimate <= 0n || estimate > MAX_GAS) throw new Error("Deployment estimate exceeds the supported transaction gas limit");
  const buffered = (estimate * 120n + 99n) / 100n;
  const gasLimit = buffered > MAX_GAS ? MAX_GAS : buffered;
  const fees = feeData.maxFeePerGas != null && feeData.maxPriorityFeePerGas != null
    ? {maxFeePerGas:feeData.maxFeePerGas,maxPriorityFeePerGas:feeData.maxPriorityFeePerGas}
    : {gasPrice:feeData.gasPrice};
  const cap = fees.maxFeePerGas ?? fees.gasPrice;
  if (cap == null || cap <= 0n || (fees.maxPriorityFeePerGas != null && (fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > cap))) throw new Error("RPC returned invalid fee parameters");
  const maximumFee = (gasLimit * cap + ATTO_PER_MICRO - 1n) / ATTO_PER_MICRO;
  if (balance < maximumFee) throw new Error("Insufficient PathUSD for the maximum deployment fee");
  return {gasLimit,fees,maximumFee};
}
module.exports = {deploymentFees};
