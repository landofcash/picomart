const hre = require("hardhat");
const fs = require("node:fs/promises");
const path = require("node:path");
const {preflight} = require("./preflight-tempo.cjs");
const {deploymentFees} = require("./deployment-fees.cjs");

async function main() {
  if (process.env.TEMPO_DEPLOY_ENABLED !== "1") throw new Error("Deployment is disabled. Review preflight and enable TEMPO_DEPLOY_ENABLED explicitly for deployment.");
  const checked = await preflight();
  if (!checked.deployer) throw new Error("Configure the deployer PRIVATE_KEY privately in the contract .env");
  if (BigInt(checked.deployerPathUsdBalance) === 0n) throw new Error("Fund the deployer's PathUSD fee balance before deployment");
  const Picomart = await hre.ethers.getContractFactory("Picomart");
  // Contract creation uses the account preference, then PathUSD fallback. Do not
  // silently quote one token and pay deployment fees in another.
  const manager = new hre.ethers.Contract("0xfeec000000000000000000000000000000000000",["function userTokens(address) view returns (address)"],hre.ethers.provider);
  const preference = await manager.userTokens(checked.deployer);
  if (preference !== hre.ethers.ZeroAddress && preference.toLowerCase() !== checked.token.toLowerCase()) throw new Error("Deployer fee preference is not PathUSD; review it before deployment");
  const unsigned = await Picomart.getDeployTransaction(checked.admin,checked.token);
  const estimate = await hre.ethers.provider.estimateGas({...unsigned,from:checked.deployer});
  const quote = deploymentFees(estimate,await hre.ethers.provider.getFeeData(),BigInt(checked.deployerPathUsdBalance));
  const fees = {estimatedGas:estimate.toString(),gasLimit:quote.gasLimit.toString(),maximumFeeBaseUnits:quote.maximumFee.toString(),maximumFeePathUSD:hre.ethers.formatUnits(quote.maximumFee,6)};
  console.log(JSON.stringify({deploymentFeeQuote:fees},null,2));
  const marketplace = await Picomart.deploy(checked.admin,checked.token,{gasLimit:quote.gasLimit,...quote.fees});
  const transaction = marketplace.deploymentTransaction();
  const directory=path.join(__dirname,"../deployments");await fs.mkdir(directory,{recursive:true});
  // Record the returned transaction immediately; a later RPC error is not grounds
  // to create another contract. Inspect this receipt before any retry.
  await fs.writeFile(path.join(directory,`pending-${transaction.hash}.json`),JSON.stringify({chainId:checked.chainId,address:await marketplace.getAddress(),deployer:checked.deployer,admin:checked.admin,transactionHash:transaction.hash,fees},null,2)+"\n",{flag:"wx"});
  console.log(`Deployment transaction: ${transaction.hash}`);
  await marketplace.waitForDeployment();
  const address = await marketplace.getAddress();
  const receipt = await marketplace.deploymentTransaction().wait();
  const owner = await marketplace.owner();
  if (owner.toLowerCase() !== checked.admin.toLowerCase()) throw new Error("Deployed owner differs from the selected administrator");
  const runtime = await hre.ethers.provider.getCode(address);
  if (hre.ethers.keccak256(runtime) !== checked.build.runtimeBytecodeHash) throw new Error("Deployed runtime differs from the compiled artifact");
  const manifest = {...checked,address,owner,deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,deploymentFeeQuote:fees,
    stageWindowSeconds:Number(await marketplace.STAGE_WINDOW()),maximumDecisionHorizonSeconds:Number(await marketplace.MAX_LIFECYCLE()),
    targetMessageRetentionSeconds:Number(await marketplace.TARGET_RETENTION()),explorerVerified:false,liveTokenAcceptance:false};
  await fs.writeFile(path.join(directory,`moderato-${address.toLowerCase()}.json`),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(manifest,null,2));
}

main().catch(() => {
  console.error("Tempo deployment stopped. Check deployment enablement, public admin/preflight, fee funding and deployment receipts before retrying.");
  process.exitCode = 1;
});
