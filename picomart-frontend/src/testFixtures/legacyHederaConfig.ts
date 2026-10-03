import type {NetworkConfig} from '@/config';

// Historical test data only. No application module imports this configuration.
export function getLegacyHederaConfig(network: string): NetworkConfig {
  if (network !== 'testnet' && network !== 'mainnet') throw new Error('Unsupported legacy fixture network');
  return {
    name: network,
    contractAddress: '0.0.456',
    contractEvmAddress: '0x00000000000000000000000000000000000001c8',
    apiUrl: 'https://sync.example.com/api/' + network,
    fileApiUrl: 'https://sync.example.com/api/cdn',
    cdnBasePath: 'https://cdn.example.com',
    hedera: {
      rpcUrl: 'https://rpc.example.com',
      mirrorNodeUrl: 'https://mirror.example.com',
      faucetUrl: '',
    },
    explorerBaseUrl: 'https://explorer.example.com',
    approvedShopWallets: [],
    supportedTokens: [
      {id: 0, name: 'HBAR', decimals: 8, img: null, tokenId: '0.0.0'},
      {id: 1, name: 'USDC', decimals: 6, img: null, tokenId: '0.0.429274'},
    ],
  };
}
