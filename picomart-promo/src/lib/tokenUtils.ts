import {getConfig, getCurrentConfig, type TokenConfig} from "@/config.ts";
import type {NetworkId} from '@/context/wallet/types';
import {exactBaseUnits, formatBaseUnits} from './pricing/amount';

export function getSupportedTokens(network?:NetworkId){return (network?getConfig(network):getCurrentConfig()).supportedTokens;}
function normalizeTokenType(value:string){return value.trim().toLowerCase();}

export function getTokenByType(tokenType: string, network?: NetworkId): TokenConfig {
  const tokens = getSupportedTokens(network);
  const key = normalizeTokenType(tokenType);
  const byType = tokens.find(t => normalizeTokenType(t.tokenId) === key);
  if (!byType) throw new Error('Token not found');
  return byType;
}

export function getTokenName(tokenType: string) {
  return getTokenByType(tokenType).name;
}

export function priceFromBaseUnits(tokenType: string, price: number | bigint): number {
  const token = getTokenByType(tokenType);
  const priceNum = typeof price === 'bigint' ? Number(price) : price;
  return priceNum / (10 ** token.decimals);
}

export function priceToBaseUnits(token: string | TokenConfig, price: string | number): bigint {
  const tokenConfig = (typeof token === 'string') ? getTokenByType(token) : token;
  const priceNum = typeof price === 'string' ? parseFloat(price) : price;
  return BigInt(Math.round(priceNum * (10 ** tokenConfig.decimals)));
}

export function priceToDisplayString(tokenType: string, price: number | bigint, displayName = true, network?: NetworkId): string {
  const token = getTokenByType(tokenType, network);
  const formatted = formatBaseUnits(exactBaseUnits(price), token.decimals);
  return displayName ? `${formatted} ${token.name}` : formatted;
}

export function tryGetTokenByType(tokenType: string, network?: NetworkId) {
  const tokens = getSupportedTokens(network)
  const key = normalizeTokenType(tokenType)
  return tokens.find(t => normalizeTokenType(t.tokenId) === key) ?? null
}

export function safePriceToDisplayString(tokenType: string, price: number | bigint, displayName = true, network?: NetworkId): string {
  try {
    return priceToDisplayString(tokenType, price, displayName, network)
  } catch {
    return `${price.toString()} base units${displayName ? ` (${tokenType})` : ''}`
  }
}
