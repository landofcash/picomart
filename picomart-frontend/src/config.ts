export {TEMPO_NETWORK_PROFILES} from './lib/tempoNetworks';
import {PICOMART_CONFIG, getTempoConfig} from '@picomart/config';

import type {NetworkId} from "@/context/wallet/types.ts";
import isMobile from 'ismobilejs';
import type {TrustedPicomartProfileV1} from '@picomart/order-protocol';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__
export const APP_NAME=PICOMART_CONFIG.app.name
export const BASE_URL='https://picomart.zkbytes.com'
export const CREDIT_CARD_PAYMENTS_ENABLED = false

// Sign prefix for encryption seed generation
export const signPrefix = "picomart-legacy-eip191-v1-";
export const APP_KEY_PREFIX = 'Picomart';

// Keep TokenConfig backward-compatible (numeric id) for current UI/helpers
export interface TokenConfig {
  id: number; // synthetic numeric id for UI (0 reserved for HBAR)
  name: string;
  decimals: number;
  img: string | null;
  // Hedera token ID (e.g., "0.0.123456")
  tokenId: string;
}

export interface HederaEndpoints {
  mirrorNodeUrl: string;
  rpcUrl: string;
  faucetUrl?: string;
}

export interface NetworkConfig {
  cdnBasePath: string;
  name: NetworkId;
  contractAddress: string;
  contractEvmAddress?: `0x${string}`;
  apiUrl: string;
  fileApiUrl:string;
  hedera: HederaEndpoints;
  explorerBaseUrl: string;
  approvedShopWallets: string[];
  supportedTokens: TokenConfig[];
  trustedPicomartProfile?: TrustedPicomartProfileV1;
}

const configs: Record<NetworkId, NetworkConfig> = Object.fromEntries(
  Object.entries(PICOMART_CONFIG.networks).filter(([, entry]) => entry.enabled).map(([id]) => {
    const network = getTempoConfig(id);
    const syncOrigin = import.meta.env.VITE_PICOMART_SYNC_ORIGIN || (import.meta.env.DEV ? 'http://localhost:3000' : network.services.syncOrigin);
    return [id, {name:id, contractAddress:network.deployment.address,
      apiUrl:syncOrigin+network.services.syncPath, fileApiUrl:syncOrigin+'/api/cdn',
      cdnBasePath:network.services.catalogOrigin, hedera:{rpcUrl:'',mirrorNodeUrl:'',faucetUrl:''},
      explorerBaseUrl:network.explorerUrl, approvedShopWallets:[], supportedTokens:[...network.paymentTokens]}];
  })
);

export const getConfig = (network: NetworkId): NetworkConfig => {
  if (!Object.prototype.hasOwnProperty.call(configs, network)) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return configs[network];
};

// Returns all available network IDs from the configuration
export const getAvailableNetworkIds = (): NetworkId[] => Object.keys(configs);

export const getCurrentConfig = (): NetworkConfig => getConfig(PICOMART_CONFIG.defaultNetwork);


// Hedera Explorer helpers
export function explorerTxUrl(transactionId: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  const hashscanTransactionId = transactionId.replace(
    /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/,
    '$1-$2-$3',
  );
  return `${cfg.explorerBaseUrl}/${n}/transactionsById/${hashscanTransactionId}`;
}

export function explorerAccountUrl(address: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  return `${cfg.explorerBaseUrl}/${n}/account/${address}`;
}

export function explorerObjectUrl(objectAddress: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  return `${cfg.explorerBaseUrl}/${n}/contract/${objectAddress}`;
}

export function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const { any } = isMobile(navigator.userAgent || '');
  return any;
}
