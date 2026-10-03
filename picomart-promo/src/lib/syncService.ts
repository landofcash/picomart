import {getConfig,getCurrentConfig,TEMPO_CHAIN_ID,TEMPO_CONTRACT_ADDRESS} from '@/config';
import {tempoSeedToId,createTempoReceivingContext,createTempoReceivingIdentity} from '@picomart/order-protocol/tempo-protocol';
import type {NetworkId} from '@/context/wallet/types';
export interface ProductData {seed:string;shopWallet:string;productsUrl:string;sellerPubKey:string;}
export function getCatalogMetadataUrl(seed:string,network?:NetworkId){tempoSeedToId(seed);return `${(network?getConfig(network):getCurrentConfig()).apiUrl}/catalogs/${encodeURIComponent(seed)}`;}
export async function fetchProductBySeed(seed:string,network?:NetworkId,signal?:AbortSignal):Promise<ProductData|null>{
  const response=await fetch(getCatalogMetadataUrl(seed,network),{signal,cache:'no-store',redirect:'error'});
  if(response.status===404)return null;if(!response.ok)throw new Error('Catalog index is unavailable or catching up.');
  const body=await response.json(),catalog=body.data?.catalog;
  if(!body.success||body.data.chainId!==TEMPO_CHAIN_ID||body.data.address!==TEMPO_CONTRACT_ADDRESS||!Number.isSafeInteger(body.data.throughBlock)||
    !catalog||catalog.seed!==seed||catalog.catalogId!==tempoSeedToId(seed)||catalog.deleted||!/^0x[0-9a-f]{40}$/.test(catalog.seller)||catalog.seller==='0x'+'0'.repeat(40)||!/^0x[0-9a-f]{64}$/.test(catalog.sellerPublicKey))throw new Error('Invalid Tempo catalog identity.');
  const identity=createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:TEMPO_CHAIN_ID,contractAddress:TEMPO_CONTRACT_ADDRESS,role:'seller',account:catalog.seller,catalogSeed:seed}),btoa(String.fromCharCode(...Uint8Array.from(String(catalog.sellerPublicKey).slice(2).match(/../g)!,v=>parseInt(v,16)))));
  if(identity.identityId!==catalog.sellerIdentityId)throw new Error('Catalog receiving identity does not match.');
  return {seed,shopWallet:catalog.seller,productsUrl:catalog.catalogUrl,sellerPubKey:catalog.sellerPublicKey};
}
