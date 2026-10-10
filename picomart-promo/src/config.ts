import {PICOMART_CONFIG, PICOMART_TEMPO_CONFIG} from '@picomart/config';
import type {NetworkId} from './context/wallet/types';
declare const __APP_VERSION__: string;
export const APP_VERSION=__APP_VERSION__;
export const APP_NAME='Picomart';
export const BASE_URL=PICOMART_CONFIG.app.promoUrl;
export const BASE_APP_URL=PICOMART_CONFIG.app.buyerUrl;
export const APP_KEY_PREFIX='PicomartTempoStorefront';
export const DEFAULT_NETWORK:NetworkId=PICOMART_TEMPO_CONFIG.network as NetworkId;
export const DEFAULT_CATALOG_SEED='AQEBAQEBAQEBAQEBAQEBAQ';
export const TEMPO_CHAIN_ID=PICOMART_TEMPO_CONFIG.chainId;
export const TEMPO_CONTRACT_ADDRESS=PICOMART_TEMPO_CONFIG.deployment.address;
export const PATH_USD=PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId;
export const CATALOG_CDN=PICOMART_TEMPO_CONFIG.services.catalogOrigin;
export interface TokenConfig {id:number;name:string;symbol:string;decimals:number;img:string|null;tokenId:string;}
const config={name:DEFAULT_NETWORK,apiUrl:PICOMART_TEMPO_CONFIG.services.syncOrigin+PICOMART_TEMPO_CONFIG.services.syncPath,cdnBasePath:CATALOG_CDN,
  approvedShopWallets:[] as string[],supportedTokens:[...PICOMART_TEMPO_CONFIG.paymentTokens]};
export type NetworkConfig=typeof config;
export const getAvailableNetworkIds=():NetworkId[]=>[DEFAULT_NETWORK];
export const isNetworkId=(value:string|null|undefined):value is NetworkId=>value===DEFAULT_NETWORK;
export function getConfig(network:NetworkId):NetworkConfig {if(!isNetworkId(network))throw new Error('Only Tempo Moderato is supported.');return config;}
export const getCurrentConfig=()=>config;
export function setCurrentNetwork(network:NetworkId){getConfig(network);}
