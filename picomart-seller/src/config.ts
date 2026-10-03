export {TEMPO_NETWORK_PROFILES} from './lib/tempoNetworks';
import {PICOMART_TEMPO_CONFIG} from "@picomart/order-protocol/tempo";
import type {NetworkId} from "@/context/wallet/types.ts";
import isMobile from 'ismobilejs';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__
export const APP_NAME='Picomart'
export const CRYPTO_NAME='Tempo'
export const CRYPTO_NAME_BLOCKCHAIN='ledger'
export const BASE_URL='https://seller.picomart.zkbytes.com'
export const BASE_APP_URL='https://app.picomart.zkbytes.com'

// Sign prefix for encryption seed generation
export const signPrefix = "picomart-legacy-eip191-v1-";
export const APP_KEY_PREFIX = 'Picomart';


// Keep TokenConfig backward-compatible (numeric id) for current UI/helpers
export interface TokenConfig {
  id: number; // synthetic numeric id for UI (0 reserved for APT)
  name: string;
  decimals: number;
  img: string | null;
  tokenId: string;
}

export interface HederaEndpoints {
  mirrorNodeUrl: string;
  rpcUrl: string;
  faucetUrl: string;
}

export interface NetworkConfig {
  cdnBasePath: string;
  name: NetworkId;
  account: string;

  adminWalletAddress: string;
  apiUrl: string;
  fileApiUrl:string;
  hedera: HederaEndpoints;
  explorerBaseUrl: string;
  approvedShopWallets: string[];
  supportedTokens: TokenConfig[];
  defaultGasUnitPrice?: number; // Octas per unit
  maxGasAmount?: number; // in gas units
}

const configs: Record<NetworkId, NetworkConfig> = {
  moderato: { name:'moderato', account:'0x3c91183f0454eab6eff6f570ac402be278dbd6f4',adminWalletAddress:'0xa7965ff717af7a9689930bf8b438080e1d7ffaca',
    apiUrl:(import.meta.env.VITE_PICOMART_SYNC_ORIGIN || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://sync.picomart.zkbytes.com'))+'/api/v1/moderato',
    fileApiUrl:(import.meta.env.VITE_PICOMART_SYNC_ORIGIN || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://sync.picomart.zkbytes.com'))+'/api/cdn',
    cdnBasePath:'https://cdn.picomart.zkbytes.com',hedera:{rpcUrl:'',mirrorNodeUrl:'',faucetUrl:''},
    explorerBaseUrl:PICOMART_TEMPO_CONFIG.explorerUrl,approvedShopWallets:[],supportedTokens:[...PICOMART_TEMPO_CONFIG.paymentTokens],
  },
};

export function isAdminWalletAddress(walletAddress: string|null, network: NetworkId): boolean {
  if (!walletAddress) return false;
  if (!Object.prototype.hasOwnProperty.call(configs, network)) return false;
  const cfg = (configs as Record<string, NetworkConfig>)[network];
  if (!cfg?.adminWalletAddress) return false;
  return walletAddress.trim().toLowerCase() === cfg.adminWalletAddress.trim().toLowerCase();
}

export const getConfig = (network: NetworkId): NetworkConfig => {
  if (!Object.prototype.hasOwnProperty.call(configs, network)) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return configs[network];
};

export const getAvailableNetworkIds = (): NetworkId[] => Object.keys(configs);

export const getCurrentConfig = (): NetworkConfig => getConfig('moderato');



export function explorerAccountUrl(address: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  return `${cfg.explorerBaseUrl}/${cfg.name}/account/${address}`
}

export function faucetAccountUrl(faucetUrl: string, address?: string | null): string {
  if (!address) {
    return faucetUrl;
  }

  const separator = faucetUrl.includes("?") ? "&" : "?";
  return `${faucetUrl}${separator}address=${encodeURIComponent(address)}`;
}

// Lightweight environment helper to detect mobile web
export function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const { any } = isMobile(navigator.userAgent || '');
  return any;
}

