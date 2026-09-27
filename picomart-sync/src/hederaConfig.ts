import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export type HederaNetwork = 'testnet' | 'mainnet';

export interface HederaNetworkConfig {
  network: HederaNetwork;
  rpcUrl: string;
  mirrorNodeUrl: string;
  contractAddress: string;
  contractId?: string;
  startBlock: number;
  blockBatchSize: number;
}

export class HederaConfigManager {
  private configs = new Map<string, HederaNetworkConfig>();

  constructor() {
    this.initializeDefaultConfigs();
  }

  private addConfig(key: string, cfg: HederaNetworkConfig) {
    this.configs.set(key.toLowerCase(), cfg);
  }

  private initializeDefaultConfigs() {
    const blockBatchSize = Number(process.env.HEDERA_BLOCK_BATCH_SIZE || 10_000);

    const testnetConfig: HederaNetworkConfig = {
      network: 'testnet',
      rpcUrl: process.env.HEDERA_TESTNET_RPC_URL || 'https://testnet.hashio.io/api',
      mirrorNodeUrl: process.env.HEDERA_TESTNET_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com',
      contractAddress: process.env.HEDERA_TESTNET_CONTRACT_ADDRESS || '0x',
      contractId: process.env.HEDERA_TESTNET_CONTRACT_ID || '0.0.0',
      startBlock: Number(process.env.HEDERA_TESTNET_START_BLOCK || 0),
      blockBatchSize,
    };

    const mainnetConfig: HederaNetworkConfig = {
      network: 'mainnet',
      rpcUrl: process.env.HEDERA_MAINNET_RPC_URL || 'https://mainnet.hashio.io/api',
      mirrorNodeUrl: process.env.HEDERA_MAINNET_MIRROR_NODE_URL || 'https://mainnet-public.mirrornode.hedera.com',
      contractAddress: process.env.HEDERA_MAINNET_CONTRACT_ADDRESS || '0x',
      contractId: process.env.HEDERA_MAINNET_CONTRACT_ID || '0.0.0',
      startBlock: Number(process.env.HEDERA_MAINNET_START_BLOCK || 0),
      blockBatchSize,
    };

    this.addConfig('testnet', testnetConfig);
    //this.addConfig('mainnet', mainnetConfig);
  }

  public getConfig(networkName: string): HederaNetworkConfig | undefined {
    return this.configs.get(networkName.toLowerCase());
  }

  public getAllConfigs(): Map<string, HederaNetworkConfig> {
    return this.configs;
  }
}

export const hederaConfigManager = new HederaConfigManager();
