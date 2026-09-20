const hre = require("hardhat");
const {PICOMART_TEMPO_CONFIG} = require("@picomart/order-protocol/tempo");
const {PICOMART_TEMPO_BUILD} = require("@picomart/order-protocol/tempo-contract");

async function preflight() {
  if (hre.network.name !== "moderato") throw new Error("Select the moderato network explicitly");
  const chain = await hre.ethers.provider.getNetwork();
  if (chain.chainId !== BigInt(PICOMART_TEMPO_CONFIG.chainId)) throw new Error("RPC is not Tempo Moderato");
  const admin = process.env.TEMPO_ADMIN_ADDRESS?.trim();
  if (!admin || !hre.ethers.isAddress(admin) || admin === hre.ethers.ZeroAddress) throw new Error("Set the public TEMPO_ADMIN_ADDRESS in the contract .env");
  const artifact = await hre.artifacts.readArtifact("Picomart");
  if (hre.ethers.keccak256(artifact.bytecode) !== PICOMART_TEMPO_BUILD.creationBytecodeHash) throw new Error("Packed Tempo ABI/build differs from the compiled artifact; regenerate and repack");
  const token = PICOMART_TEMPO_CONFIG.paymentTokens[0];
  const instance = new hre.ethers.Contract(token.tokenId,["function name() view returns (string)","function symbol() view returns (string)","function decimals() view returns (uint8)","function balanceOf(address) view returns (uint256)"],hre.ethers.provider);
  const [name,symbol,decimals] = await Promise.all([instance.name(),instance.symbol(),instance.decimals()]);
  if (name !== token.name || symbol !== token.symbol || Number(decimals) !== token.decimals) throw new Error("PathUSD metadata differs from shared configuration");
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = deployer ? await deployer.getAddress() : null;
  if (deployerAddress?.toLowerCase() === admin.toLowerCase()) throw new Error("Deployer and administrator must have different addresses");
  const balance = deployerAddress ? (await instance.balanceOf(deployerAddress)).toString() : null;
  return {chainId:Number(chain.chainId),admin:hre.ethers.getAddress(admin),deployer:deployerAddress,token:token.tokenId,tokenName:name,tokenSymbol:symbol,decimals:Number(decimals),deployerPathUsdBalance:balance,build:PICOMART_TEMPO_BUILD};
}
module.exports = {preflight};
if (require.main === module) preflight().then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error("Tempo preflight failed. Check public admin/configuration, RPC connectivity, token metadata and the packed build.");process.exitCode=1;});
