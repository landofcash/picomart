import type {NetworkId} from './context/wallet/types';
export const APP_VERSION='1.4.0-tempo.1';
export const APP_NAME='Picomart';
export const BASE_URL='https://picomart.zkbytes.com';
export const BASE_APP_URL='https://app.picomart.zkbytes.com';
export const APP_KEY_PREFIX='PicomartTempoStorefront';
export const DEFAULT_NETWORK:NetworkId='moderato';
export const DEFAULT_CATALOG_SEED='AQEBAQEBAQEBAQEBAQEBAQ';
export const TEMPO_CHAIN_ID=42431;
export const TEMPO_CONTRACT_ADDRESS='0x3c91183f0454eab6eff6f570ac402be278dbd6f4';
export const PATH_USD='0x20c0000000000000000000000000000000000000';
export const CATALOG_CDN='https://cdn.picomart.zkbytes.com';
export interface TokenConfig {id:number;name:string;decimals:number;img:string|null;tokenId:string;}
const config={name:DEFAULT_NETWORK,apiUrl:'https://sync.picomart.zkbytes.com/api/v1/moderato',cdnBasePath:CATALOG_CDN,
  supportedTokens:[{id:0,name:'PathUSD',decimals:6,img:null,tokenId:PATH_USD}]};
export type NetworkConfig=typeof config;
export const getAvailableNetworkIds=():NetworkId[]=>[DEFAULT_NETWORK];
export const isNetworkId=(value:string|null|undefined):value is NetworkId=>value===DEFAULT_NETWORK;
export function getConfig(network:NetworkId):NetworkConfig {if(!isNetworkId(network))throw new Error('Only Tempo Moderato is supported.');return config;}
export const getCurrentConfig=()=>config;
export function setCurrentNetwork(network:NetworkId){getConfig(network);}
