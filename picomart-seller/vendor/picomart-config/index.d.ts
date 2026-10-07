export interface CurrencyConfig {
  id: number; name: string; symbol: string; decimals: number; address: `0x${string}`; icon: string;
  accountEnabled: boolean;
}
export interface TokenConfig extends CurrencyConfig { key: string; tokenId: `0x${string}`; img: string; }
export interface Services { syncOrigin: string; syncPath: string; agentPath: string; catalogOrigin: string; x402Origin: string; builderOrigin: string; }
export interface EnabledNetwork {
  enabled: true; label: string; modeLabel: string; qrProfile: string; chainId: number; rpcUrl: string; explorerUrl: string;
  contract: { address: `0x${string}`; deploymentBlock: number }; adminAddress: `0x${string}`; services: Services;
  defaultPaymentCurrency: string; defaultFeeCurrency: string; currencies: Record<string, CurrencyConfig>;
}
export interface DisabledNetwork { enabled: false; label: string; modeLabel: string; qrProfile: string; chainId: number | null;
  rpcUrl: string | null; explorerUrl: string | null; contract: EnabledNetwork['contract'] | null; currencies: Record<string, CurrencyConfig>; }
export interface AppConfig { app: {name: string; buyerUrl: string; sellerUrl: string}; defaultNetwork: string; networks: Record<string, EnabledNetwork | DisabledNetwork>; }
export interface TempoConfig { network: string; chainId: number; rpcUrl: string; explorerUrl: string; label: string; mainnetEnabled: boolean;
  deployment: {address: `0x${string}`; block: number}; tokens: readonly TokenConfig[]; paymentTokens: readonly TokenConfig[];
  defaultPaymentToken: TokenConfig; feeToken: TokenConfig; services: Services; adminAddress: `0x${string}`; }
export const PICOMART_CONFIG: AppConfig;
export const PICOMART_TEMPO_CONFIG: TempoConfig;
export const COMPACT_LINK_CONFIG: { origin: string; network: string; profiles: Readonly<Record<string, string>> };
export const TEMPO_NETWORK_PROFILES: readonly {id: string; label: string; badge: string; qrProfile: string; available: boolean; chainId: number | null; rpcUrl: string | null; explorerUrl: string | null; deployment: TempoConfig['deployment'] | null}[];
export function validateConfig(value: unknown): AppConfig;
export function getNetworkConfig(id?: string): EnabledNetwork;
export function getTempoConfig(id?: string): TempoConfig;
export function assertTempoChainId(chainId: number | bigint, expected?: number): void;
export function getAgentConfig(id?: string): {chainId: number; contractAddress: string; paymentTokens: readonly TokenConfig[]; defaultPaymentToken: string; apiPath: string};

export function isPaymentCurrency(token: unknown, network?: string): boolean;
export function getCurrency(token: string, network?: string): TokenConfig;
