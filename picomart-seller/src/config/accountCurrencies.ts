import {PICOMART_CONFIG, getTempoConfig, type TokenConfig} from '@picomart/config';
export type AccountCurrencyConfig = TokenConfig;
export const ACCOUNT_CURRENCY_CONFIG: Readonly<Record<string, readonly TokenConfig[]>> = Object.fromEntries(
  Object.entries(PICOMART_CONFIG.networks).filter(([, n])=>n.enabled).map(([id])=>[id,getTempoConfig(id).tokens])
);
export const TEMPO_ACCOUNT_CURRENCIES = getTempoConfig().tokens;
export const DEFAULT_PAYMENT_CURRENCY = getTempoConfig().defaultPaymentToken;
