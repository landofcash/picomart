import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {getCurrentConfig, type TokenConfig} from "@/config.ts";
import {solidityEntityAddressToId} from "@picomart/order-protocol";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function getSupportedTokens() {
  return getCurrentConfig().supportedTokens;
}

function normalizeTokenType(coinType: string): string {
  const key = coinType.trim();
  if (getCurrentConfig().name === PICOMART_TEMPO_CONFIG.network) return key.toLowerCase();
  if (!key) {
    return key;
  }

  if (key === "0" || key === "0.0.0" || key.toUpperCase() === "HBAR" || key.toLowerCase() === ZERO_ADDRESS) {
    return "0.0.0";
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(key)) {
    try {
      return solidityEntityAddressToId(key) ?? key;
    } catch {
      return key;
    }
  }

  return key;
}

// Resolver that accepts only coinType string (no backward compatibility)
export function getTokenByType(coinType: string): TokenConfig {
  const tokens = getSupportedTokens();
  const key = normalizeTokenType(coinType);
  const byType = tokens.find(t => normalizeTokenType(t.tokenId) === key);
  if (!byType) throw new Error('Token not found');
  return byType;
}

export function getTokenName(coinType: string) {
  return getTokenByType(coinType).name;
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

export function priceToDisplayString(tokenType: string, price: number | bigint, displayName: boolean = true): string {
  const token = getTokenByType(tokenType);
  const priceNum = typeof price === 'bigint' ? Number(price) : price;
  const value = priceNum / 10 ** token.decimals;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: token.decimals,
  });
  let res = `${formatted}`;
  if (res.length < 3 && res.indexOf(".") < 0) {
    res = `${res}.00`;
  }
  if (displayName) {
    res = `${res} ${token.name}`;
  }
  return res;
}

export function tryGetTokenByType(coinType: string) {
  const tokens = getSupportedTokens()
  const key = normalizeTokenType(coinType)
  return tokens.find(t => normalizeTokenType(t.tokenId) === key) ?? null
}

export function safePriceToDisplayString(tokenType: string, price: number | bigint, displayName: boolean = true): string {
  try {
    return priceToDisplayString(tokenType, price, displayName)
  } catch {
    const priceNum = typeof price === 'bigint' ? Number(price) : price
    const formatted = priceNum.toLocaleString(undefined, { maximumFractionDigits: 8 })
    return displayName ? `${formatted}` : formatted
  }
}
