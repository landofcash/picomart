import {Interface,keccak256} from 'ethers';
import {tempoSeedToId,createTempoReceivingContext,createTempoReceivingIdentity} from '@picomart/order-protocol/tempo-protocol';
import {PICOMART_TEMPO_ABI,PICOMART_TEMPO_BUILD} from '@picomart/order-protocol/tempo-contract';
import type {Config} from './config.ts';
import {ApiError} from './domain/errors.ts';
export const TEMPO_CHAIN_ID=42431;
export const TEMPO_CONTRACT_ADDRESS='0x3c91183f0454eab6eff6f570ac402be278dbd6f4';
export const PATH_USD='0x20c0000000000000000000000000000000000000';
const abi=new Interface(PICOMART_TEMPO_ABI);
export function validateCatalog(catalog:any,seed:string,owner?:string) {
  try {
    if(catalog.seed!==seed||catalog.catalogId!==tempoSeedToId(seed)||catalog.deleted||
      !/^0x[0-9a-f]{40}$/.test(catalog.seller)||catalog.seller==='0x'+'0'.repeat(40))throw new Error();
    const identity=createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:TEMPO_CHAIN_ID,
      contractAddress:TEMPO_CONTRACT_ADDRESS,role:'seller',account:catalog.seller,catalogSeed:seed}),Buffer.from(catalog.sellerPublicKey.slice(2),'hex').toString('base64'));
    if(identity.identityId!==catalog.sellerIdentityId||!/^0x[0-9a-f]{64}$/.test(catalog.sellerPublicKey)||typeof catalog.catalogUrl!=='string')throw new Error();
  }catch{throw new ApiError(503,'catalog_identity_invalid');}
  if(owner&&catalog.seller!==owner)throw new ApiError(403,'catalog_not_owned');
  return catalog;
}
export async function readOwnedCatalog(config:Config,seed:string,owner:string,transport:typeof fetch=fetch) {
  let requestId=0;
  async function rpc(method:string,params:unknown[]) {
    const id=++requestId;
    try {
      const response=await transport(config.tempoRpcOrigin,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
      const text=await response.text();if(!response.ok||text.length>128*1024)throw new Error();
      const body=JSON.parse(text);if(body.error||body.id!==id||typeof body.result!=='string')throw new Error();return body.result as string;
    }catch{throw new ApiError(503,'identity_provider_unavailable');}
  }
  if(BigInt(await rpc('eth_chainId',[]))!==BigInt(TEMPO_CHAIN_ID))throw new ApiError(503,'catalog_identity_invalid');
  const block=await rpc('eth_blockNumber',[]);
  if(keccak256(await rpc('eth_getCode',[TEMPO_CONTRACT_ADDRESS,block]))!==PICOMART_TEMPO_BUILD.runtimeBytecodeHash)throw new ApiError(503,'catalog_identity_invalid');
  let result;try{result=abi.decodeFunctionResult('catalogs',await rpc('eth_call',[{to:TEMPO_CONTRACT_ADDRESS,data:abi.encodeFunctionData('catalogs',[tempoSeedToId(seed)])},block]));}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'catalog_identity_invalid');}
  const catalog={seed,catalogId:tempoSeedToId(seed),seller:result.seller.toLowerCase(),sellerPublicKey:result.sellerPublicKey.toLowerCase(),sellerIdentityId:result.sellerIdentityId.toLowerCase(),catalogUrl:result.catalogUrl};
  if(catalog.seller==='0x'+'0'.repeat(40))throw new ApiError(404,'catalog_not_found');
  return validateCatalog(catalog,seed,owner);
}
