import {isPaymentCurrency} from '@picomart/config';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {AGENT_CONTRACT,AGENT_TOKEN,AgentSeedSchema,AgentAmountSchema} from './agentProtocol.js';
import {tempoSeedToId,createTempoReceivingContext,createTempoReceivingIdentity} from '@picomart/order-protocol/tempo-protocol';
import type {ServerConfig} from './config.js';
export type CatalogMetadata={seed:string;catalogId:string;catalogUrl:string;seller:string;sellerPublicKey:string;sellerIdentityId:string};
export function validateMetadata(value:any,seed:string):CatalogMetadata {
  if(value.seed!==seed||value.catalogId!==tempoSeedToId(seed)||!/^0x[0-9a-f]{40}$/.test(value.seller)||!/^0x[0-9a-f]{64}$/.test(value.sellerPublicKey))throw new Error('catalog_identity_invalid');
  const identity=createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:AGENT_CONTRACT,
    role:'seller',account:value.seller,catalogSeed:seed}),Buffer.from(value.sellerPublicKey.slice(2),'hex').toString('base64'));
  if(identity.identityId!==value.sellerIdentityId)throw new Error('catalog_identity_invalid');return value;
}
export async function boundedJson(response:Response,maxBytes:number){
  if(!response.body)throw new Error('empty_response');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new Error('response_too_large');chunks.push(value);}}finally{await reader.cancel();}
  return Buffer.concat(chunks);
}
export class SyncClient {
  constructor(private origin:string,private fetcher:typeof fetch=fetch){}
  private async get(path:string){
    const response=await this.fetcher(this.origin+path,{redirect:'error',signal:AbortSignal.timeout(8000)});
    if(response.status===404)return null;if(!response.ok)throw new Error('sync_unavailable');
    const body=JSON.parse((await boundedJson(response,512000)).toString());
    if(!body.success||body.data.chainId!==PICOMART_TEMPO_CONFIG.chainId||body.data.address!==AGENT_CONTRACT||!Number.isSafeInteger(body.data.throughBlock))throw new Error('sync_deployment_invalid');return body.data;
  }
  async catalog(seed:string){const v=await this.get((PICOMART_TEMPO_CONFIG.services.syncPath + '/catalogs/')+AgentSeedSchema.parse(seed));return v?validateMetadata(v.catalog,seed):null;}
  async order(seed:string){const v=await this.get((PICOMART_TEMPO_CONFIG.services.syncPath + '/orders/')+AgentSeedSchema.parse(seed));return v?.order??null;}
}
const productSchema=z.object({ProductId:z.string().regex(/^[A-Za-z0-9_-]{22}$/),PriceToken:z.string().refine(isPaymentCurrency),
  Price:z.union([z.string(),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String).pipe(AgentAmountSchema),Name:z.string().min(1).max(2000)}).passthrough();
export async function fetchCatalog(input:string,config:Pick<ServerConfig,'catalogOrigins'|'catalogMaxBytes'>,fetcher:typeof fetch=fetch){
  const url=new URL(input);if(url.origin!==PICOMART_TEMPO_CONFIG.services.catalogOrigin||!config.catalogOrigins.has(url.origin)||url.username||url.password)throw new Error('catalog_url_not_allowed');
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('catalog_unavailable');
  const bytes=await boundedJson(response,config.catalogMaxBytes),hash=url.pathname.match(/^\/moderato\/v1\/0x[0-9a-f]{40}\/catalogs\/([0-9a-f]{64})\.json$/)?.[1];
  if(hash&&createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('catalog_digest_mismatch');
  const products=z.array(productSchema).min(1).max(1000).parse(JSON.parse(bytes.toString()));
  if(new Set(products.map(p=>p.ProductId)).size!==products.length)throw new Error('duplicate_products');return products;
}
