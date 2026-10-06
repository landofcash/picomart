require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
const {subtask} = require("hardhat/config");
const {TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD} = require("hardhat/builtin-tasks/task-names");
const fs = require("node:fs");
const crypto = require("node:crypto");
const {PICOMART_TEMPO_CONFIG} = require("@picomart/config");
const key = process.env.PRIVATE_KEY?.trim();
if (key && !/^(?:0x)?[0-9a-fA-F]{64}$/.test(key)) throw new Error("PRIVATE_KEY must be a valid 32-byte hex deployer key");

// Optional offline compiler path. Verify the official build before using it.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({solcVersion}, _hre, runSuper) => {
  const compilerPath = process.env.PICOMART_SOLCJS_PATH;
  if (!compilerPath) return runSuper();
  const digest = crypto.createHash("sha256").update(fs.readFileSync(compilerPath)).digest("hex");
  if (solcVersion !== "0.8.37" || digest !== "d73fead3cbc860438f56f4d1723677499cdef212d0f8890241748d2d5afc1c5f") throw new Error("Offline compiler does not match the pinned official Solidity 0.8.37 build");
  return {compilerPath, isSolcJs:true, version:"0.8.37", longVersion:"0.8.37+commit.f401782d"};
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.37",
    settings: {
      evmVersion: "osaka",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {chainId:PICOMART_TEMPO_CONFIG.chainId, hardfork:"osaka"},
    moderato: {url:PICOMART_TEMPO_CONFIG.rpcUrl, chainId:PICOMART_TEMPO_CONFIG.chainId, accounts:key ? [key.startsWith("0x") ? key : `0x${key}`] : []},
  },
};
