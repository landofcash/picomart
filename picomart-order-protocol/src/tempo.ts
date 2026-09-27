/** Preparation for Tempo adapters; importing this module does not enable checkout. */
export type TempoAddress = `0x${string}`;

export interface TempoTokenConfig {
  /** Presentation ID only. It never identifies a native asset or a payment destination. */
  readonly id: number;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly tokenId: TempoAddress;
  readonly img: string;
}

export const TEMPO_TOKENS = Object.freeze({
  pathUSD: Object.freeze({
    id: 0,
    name: "PathUSD",
    symbol: "PathUSD",
    decimals: 6,
    tokenId: "0x20c0000000000000000000000000000000000000",
    img: "/tokens/0-icon.png",
  } as const satisfies TempoTokenConfig),
  alphaUSD: Object.freeze({
    id: 1,
    name: "AlphaUSD",
    symbol: "AlphaUSD",
    decimals: 6,
    tokenId: "0x20c0000000000000000000000000000000000001",
    img: "/tokens/1-icon.png",
  } as const satisfies TempoTokenConfig),
});

export const PICOMART_TEMPO_CONFIG = Object.freeze({
  network: "moderato",
  chainId: 42431,
  rpcUrl: "https://rpc.moderato.tempo.xyz",
  explorerUrl: "https://explore.testnet.tempo.xyz",
  mainnetEnabled: false,
  /** Set address and deployment block together after a verified deployment. */
  deployment: null,
  tokens: Object.freeze([TEMPO_TOKENS.pathUSD, TEMPO_TOKENS.alphaUSD]),
  /** AlphaUSD metadata does not grant payment support. */
  paymentTokens: Object.freeze([TEMPO_TOKENS.pathUSD]),
  feeToken: TEMPO_TOKENS.pathUSD,
} as const);

/** Call before any Tempo wallet signing or network-dependent operation. */
export function assertTempoChainId(chainId: number | bigint): void {
  if (chainId !== PICOMART_TEMPO_CONFIG.chainId && chainId !== BigInt(PICOMART_TEMPO_CONFIG.chainId)) {
    throw new Error(`Unsupported Tempo chain ${chainId}; expected Moderato (${PICOMART_TEMPO_CONFIG.chainId})`);
  }
}

/** Stable printed-link profile. Add future profiles explicitly; never default unknown digits. */
const COMPACT_LINK_PROFILES: Readonly<Record<string, string>> = Object.freeze({ '2': 'moderato' });
const COMPACT_ID = /^[A-Za-z0-9_-]{22}$/;

export function compactCatalogLink(seed: string, productId?: string, origin = 'https://app.picomart.zkbytes.com', network = 'moderato'): string {
  const profile = Object.keys(COMPACT_LINK_PROFILES).find(key => COMPACT_LINK_PROFILES[key] === network);
  if (!profile) throw new Error('Unsupported catalog link profile.');
  if (!COMPACT_ID.test(seed) || (productId !== undefined && !COMPACT_ID.test(productId))) throw new Error('Invalid catalog or product ID.');
  const url = new URL('/', origin);
  url.hash = seed + (productId ?? '') + profile;
  parseCompactCatalogLink(url.href);
  return url.href;
}

export function parseCompactCatalogLink(value: string): { seed: string; productId: string | null; network: string } {
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.pathname !== '/' || url.search) throw new Error('Unsupported catalog link.');
  const payload = url.hash.slice(1);
  if (payload.length !== 23 && payload.length !== 45) throw new Error('Invalid compact catalog link.');
  const seed = payload.slice(0, 22), productId = payload.length === 45 ? payload.slice(22, 44) : null;
  const network = COMPACT_LINK_PROFILES[payload.slice(-1)];
  if (!network) throw new Error('Unsupported catalog link profile.');
  if (!COMPACT_ID.test(seed) || (productId !== null && !COMPACT_ID.test(productId))) throw new Error('Invalid catalog or product ID.');
  return { seed, productId, network };
}
