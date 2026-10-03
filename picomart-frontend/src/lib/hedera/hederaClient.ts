import {Client} from "@hiero-ledger/sdk";
import {createPublicClient, http} from "viem";
import {getConfig, getCurrentConfig} from "@/config";
import type {NetworkId} from "@/context/wallet/types.ts";

export function getHederaClient(network?: NetworkId) {
  const cfg = network ? getConfig(network) : getCurrentConfig();

  if (cfg.name !== "testnet" && cfg.name !== "mainnet") {
    throw new Error(`Unsupported network ${cfg.name}`);
  }

  const sdkClient = cfg.name === "mainnet"
    ? Client.forMainnet()
    : Client.forTestnet();

  const publicClient = createPublicClient({
    transport: http(cfg.hedera.rpcUrl),
  });

  return {sdkClient, publicClient};
}
