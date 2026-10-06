/** Reusable network-neutral Tempo configuration and compact-link helpers. */
export type TempoAddress = `0x${string}`;
export interface TempoTokenConfig {
  readonly id: number; readonly name: string; readonly symbol: string;
  readonly decimals: number; readonly tokenId: TempoAddress; readonly img: string;
}
export function assertTempoChainId(chainId: number | bigint, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected <= 0 || BigInt(chainId) !== BigInt(expected))
    throw new Error(`Unsupported Tempo chain ${chainId}; expected ${expected}`);
}
/** Stable printed-link profile. Add future profiles explicitly; never default unknown digits. */
const COMPACT_ID = /^[A-Za-z0-9_-]{22}$/;

export function compactCatalogLink(seed: string, productId: string | undefined, origin: string, network: string, profiles: Readonly<Record<string, string>>): string {
  const profile = Object.keys(profiles).find(key => profiles[key] === network);
  if (!profile) throw new Error('Unsupported catalog link profile.');
  if (!COMPACT_ID.test(seed) || (productId !== undefined && !COMPACT_ID.test(productId))) throw new Error('Invalid catalog or product ID.');
  const url = new URL('/', origin);
  url.hash = seed + (productId ?? '') + profile;
  parseCompactCatalogLink(url.href, profiles);
  return url.href;
}

export function parseCompactCatalogLink(value: string, profiles: Readonly<Record<string, string>>): { seed: string; productId: string | null; network: string } {
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.pathname !== '/' || url.search) throw new Error('Unsupported catalog link.');
  const payload = url.hash.slice(1);
  if (payload.length !== 23 && payload.length !== 45) throw new Error('Invalid compact catalog link.');
  const seed = payload.slice(0, 22), productId = payload.length === 45 ? payload.slice(22, 44) : null;
  const network = profiles[payload.slice(-1)];
  if (!network) throw new Error('Unsupported catalog link profile.');
  if (!COMPACT_ID.test(seed) || (productId !== null && !COMPACT_ID.test(productId))) throw new Error('Invalid catalog or product ID.');
  return { seed, productId, network };
}
