import {getConfig, getCurrentConfig} from '@/config';
import {Client} from "@hiero-ledger/sdk";
import {createPublicClient, http} from "viem";
import type {NetworkId} from "@/context/wallet/types.ts";

export function getHederaClient(network?: NetworkId) {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  let sdkClient;
  if(cfg.name=="testnet") {
    sdkClient = Client.forTestnet();}
  else if(cfg.name=="mainnet") {
    sdkClient = Client.forMainnet();}
  else {
    throw new Error(`Unsupported network ${cfg.name}`);
  }
  const publicClient = createPublicClient({
    transport: http(cfg.hedera.rpcUrl)
  });

  return {sdkClient, publicClient};
}
