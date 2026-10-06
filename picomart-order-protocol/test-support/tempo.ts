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

import {assertTempoChainId as assertChain, compactCatalogLink as encode, parseCompactCatalogLink as decode} from '../src/tempo.js';
export const assertTempoChainId=(chain:number|bigint)=>assertChain(chain,42431);
export const compactCatalogLink=(seed:string,product?:string,origin='https://app.picomart.zkbytes.com',network='moderato')=>encode(seed,product,origin,network,{'2':'moderato'});
export const parseCompactCatalogLink=(value:string)=>decode(value,{'2':'moderato'});
