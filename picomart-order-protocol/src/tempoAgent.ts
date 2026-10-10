import {z} from 'zod';
import {TempoFulfillmentSnapshotSchema} from './tempoCatalog.js';
import {TempoAddressSchema,TempoHashSchema,TempoSeedSchema} from './tempoPrimitives.js';
import {PicomartDeliveryDetailsV1Schema,PicomartEncryptedDeliveryV1Schema} from './schemas.js';
import {canonicalBytes,canonicalHash,canonicalJson,canonicalEqual} from './canonical.js';
import {base64UrlToBytes,bytesToBase64Url} from './binary.js';
import {importQuotePublicKey,verifyQuoteDigestJws} from './jws.js';
import {encodePaymentRequiredHeader,decodePaymentRequiredHeader,encodePaymentSignatureHeader,decodePaymentSignatureHeader,encodePaymentResponseHeader} from '@x402/core/http';
export {canonicalHash,canonicalEqual,canonicalJson,importQuotePrivateKey,importQuotePublicKey,signQuoteDigest,verifyQuoteDigestJws} from './index.js';
export {PicomartDeliveryDetailsV1Schema,base64UrlToBytes,bytesToBase64Url};
export type {PicomartDeliveryDetailsV1} from './schemas.js';
export interface TempoAgentConfig {
  chainId: number; contractAddress: string; apiPath: string; defaultPaymentToken: string;
  paymentTokens: readonly {tokenId: string; name: string; symbol: string; decimals: number}[];
}
/** Bind all quote, approval and encryption checks to the application's trusted deployment. */
export function createTempoAgentProtocol(input: TempoAgentConfig) {
  const config = z.object({chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),contractAddress:TempoAddressSchema,
    apiPath:z.string().regex(/^\/api\/[a-zA-Z0-9/_-]+$/),defaultPaymentToken:TempoAddressSchema,
    paymentTokens:z.array(z.object({tokenId:TempoAddressSchema,name:z.string().min(1),symbol:z.string().min(1),decimals:z.literal(6)})).min(1)
  }).parse(input);
  if(!config.paymentTokens.some(t=>t.tokenId===config.defaultPaymentToken)||new Set(config.paymentTokens.map(t=>t.tokenId)).size!==config.paymentTokens.length)
    throw new Error('Invalid trusted payment currency configuration');
  const paymentAsset=TempoAddressSchema.refine(value=>config.paymentTokens.some(t=>t.tokenId===value),'Unsupported payment currency');
const AGENT_CHAIN_ID=config.chainId;
const AGENT_NETWORK=`eip155:${AGENT_CHAIN_ID}`;
const AGENT_CONTRACT=config.contractAddress;
const AGENT_TOKEN=config.defaultPaymentToken;
const AGENT_RESOLVE_PATH=`${config.apiPath}/order-quotes/resolve`;
const agentConfirmPath=(seed:string)=>`${config.apiPath}/orders/${TempoSeedSchema.parse(seed)}/confirm`;
const AgentSeedSchema=TempoSeedSchema;
const AgentDigestSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine(v=>bytesToBase64Url(base64UrlToBytes(v))===v);
const AgentAmountSchema=z.string().regex(/^[1-9][0-9]*$/).max(78).refine(v=>BigInt(v)<2n**256n);
const AgentEncryptedDeliverySchema=PicomartEncryptedDeliveryV1Schema.omit({version:true}).extend({version:z.literal(2)}).strict();
const AgentItemSchema=z.object({productId:z.string().regex(/^[A-Za-z0-9_-]{22}$/),quantity:z.number().int().min(1).max(1000000)}).strict();
const items=z.array(AgentItemSchema).min(1).max(100).refine(v=>new Set(v.map(i=>i.productId)).size===v.length,'Duplicate products');
const AgentQuoteRequestSchema=z.object({version:z.literal(2),orderSeed:AgentSeedSchema,catalogSeed:AgentSeedSchema,items,
  encryptedDelivery:AgentEncryptedDeliverySchema,deliveryDetailsHash:AgentDigestSchema,physicalDelivery:z.boolean(),fulfillment:z.object({methodId:z.string().min(1).max(100),optionId:z.string().min(1).max(100).optional()}).strict()}).strict();
const AgentQuoteSchema=z.object({version:z.literal(2),orderSeed:AgentSeedSchema,requestHash:AgentDigestSchema,network:z.literal(AGENT_NETWORK),
  x402:z.object({protocolVersion:z.literal(2),scheme:z.literal('picomart-order'),schemeVersion:z.literal(2),resourceMethod:z.literal('POST'),
    resourcePath:z.string(),maxTimeoutSeconds:z.literal(600)}).strict(),
  catalog:z.object({seed:AgentSeedSchema,sellerEvmAddress:TempoAddressSchema,sellerPublicKey:TempoHashSchema,sellerIdentityId:TempoHashSchema,catalogUrl:z.string().url()}).strict(),
  items:z.array(AgentItemSchema.extend({name:z.string().min(1).max(2000),unitAmount:AgentAmountSchema,lineAmount:AgentAmountSchema}).strict()).min(1).max(100),
  delivery:z.object({required:z.boolean(),snapshot:TempoFulfillmentSnapshotSchema,amount:z.string().regex(/^(0|[1-9][0-9]*)$/).max(78),
    deliveryDetailsHash:AgentDigestSchema,encryptedDeliveryHash:AgentDigestSchema}).strict(),
  payment:z.object({symbol:z.string().min(1),name:z.string().min(1),amount:AgentAmountSchema,payTo:z.literal(AGENT_CONTRACT),
    assetType:z.literal('tip20'),asset:paymentAsset,decimals:z.literal(6)}).strict(),
  picomart:z.object({chainId:z.literal(AGENT_CHAIN_ID),contractAddress:z.literal(AGENT_CONTRACT)}).strict(),
  issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive()}).strict().superRefine((q,c)=>{
    const token=config.paymentTokens.find(t=>t.tokenId===q.payment.asset);
    if(!token||token.symbol!==q.payment.symbol||token.name!==q.payment.name||token.decimals!==q.payment.decimals)c.addIssue({code:'custom',message:'Untrusted payment currency metadata'});
    if(q.items.some(i=>BigInt(i.unitAmount)*BigInt(i.quantity)!==BigInt(i.lineAmount))||
      q.items.reduce((s,i)=>s+BigInt(i.lineAmount),BigInt(q.delivery.amount))!==BigInt(q.payment.amount)||q.delivery.amount!==q.delivery.snapshot.amount||q.delivery.snapshot.currency!==q.payment.asset||q.delivery.snapshot.catalogUrl!==q.catalog.catalogUrl||q.delivery.required!==(q.delivery.snapshot.type!=='digital')||new Set(q.items.map(i=>i.productId)).size!==q.items.length||
      q.expiresAt-q.issuedAt!==600||q.x402.resourcePath!==agentConfirmPath(q.orderSeed))c.addIssue({code:'custom',message:'Invalid quote terms'});
  });
const AgentResourceSchema=z.object({url:z.string().url(),description:z.string(),mimeType:z.literal('application/json'),serviceName:z.literal('Picomart')}).strict();
const AgentRequirementsSchema=z.object({scheme:z.literal('picomart-order'),network:z.literal(AGENT_NETWORK),amount:AgentAmountSchema,
  asset:paymentAsset,payTo:z.literal(AGENT_CONTRACT),maxTimeoutSeconds:z.literal(600),
  extra:z.object({schemeVersion:z.literal(2),orderSeed:AgentSeedSchema,quoteDigest:AgentDigestSchema,quotePath:z.literal(AGENT_RESOLVE_PATH),quoteJws:z.string().max(2048).regex(/^[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]+$/)}).strict()}).strict();
const AgentPaymentRequiredSchema=z.object({x402Version:z.literal(2),error:z.string(),resource:AgentResourceSchema,accepts:z.array(AgentRequirementsSchema).length(1),extensions:z.object({}).strict()}).strict();
const AgentPaymentPayloadSchema=z.object({x402Version:z.literal(2),resource:AgentResourceSchema,accepted:AgentRequirementsSchema,
  payload:z.object({transactionHash:TempoHashSchema,buyer:TempoAddressSchema}).strict(),extensions:z.object({}).strict()}).strict();
const AgentSettlementSchema=z.object({success:z.literal(true),payer:TempoAddressSchema,transaction:TempoHashSchema,network:z.literal(AGENT_NETWORK),amount:AgentAmountSchema,extensions:z.object({}).strict()}).strict();
const AgentResolutionSchema=z.object({paymentRequired:AgentPaymentRequiredSchema,quote:AgentQuoteSchema,quoteDigest:AgentDigestSchema,quoteJws:z.string().max(2048),
  encryptedDelivery:AgentEncryptedDeliverySchema,recoverUntil:z.number().int().positive()}).strict().refine(r=>r.recoverUntil>r.quote.expiresAt);
const httpsOrigin=z.string().url().refine(v=>{const u=new URL(v);return (u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))&&u.origin===v;},'Expected bare HTTPS origin or local HTTP origin');
const AgentProfileSchema=z.object({version:z.literal(2),profileId:z.string().min(1),quoteOrigin:httpsOrigin,resourceOrigin:httpsOrigin,
  network:z.literal(AGENT_NETWORK),chainId:z.literal(AGENT_CHAIN_ID),contractAddress:z.literal(AGENT_CONTRACT),
  trustedQuoteKeys:z.array(z.object({kid:z.string().min(1),publicKey:AgentDigestSchema}).strict()).min(1)}).strict()
  .refine(p=>new Set(p.trustedQuoteKeys.map(k=>k.kid)).size===p.trustedQuoteKeys.length,'Duplicate key IDs');
const AgentHandoffSchema=z.object({version:z.literal(2),chainId:z.literal(AGENT_CHAIN_ID),contractAddress:z.literal(AGENT_CONTRACT),orderSeed:AgentSeedSchema,deliveryKey:AgentDigestSchema}).strict();
type AgentQuote=z.infer<typeof AgentQuoteSchema>;
type AgentQuoteRequest=z.infer<typeof AgentQuoteRequestSchema>;
type AgentResolution=z.infer<typeof AgentResolutionSchema>;
type AgentPaymentPayload=z.infer<typeof AgentPaymentPayloadSchema>;
type AgentProfile=z.infer<typeof AgentProfileSchema>;
type AgentHandoff=z.infer<typeof AgentHandoffSchema>;
const agentRequestCommitment=(r:AgentQuoteRequest)=>canonicalHash(AgentQuoteRequestSchema.parse(r));
function agentRequirements(q:AgentQuote,digest:string,jws:string){return AgentRequirementsSchema.parse({scheme:'picomart-order',network:AGENT_NETWORK,amount:q.payment.amount,
  asset:q.payment.asset,payTo:AGENT_CONTRACT,maxTimeoutSeconds:600,extra:{schemeVersion:2,orderSeed:q.orderSeed,quoteDigest:digest,quotePath:AGENT_RESOLVE_PATH,quoteJws:jws}});}
async function validateAgentResolution(value:unknown,profile:AgentProfile,now=Math.floor(Date.now()/1000)) {
  const r=AgentResolutionSchema.parse(value),p=AgentProfileSchema.parse(profile),q=r.quote;
  if(q.issuedAt>now||q.expiresAt<=now||await canonicalHash(q)!==r.quoteDigest||
    !canonicalEqual(r.paymentRequired.accepts[0],agentRequirements(q,r.quoteDigest,r.quoteJws))||r.paymentRequired.resource.url!==p.resourceOrigin+agentConfirmPath(q.orderSeed))throw new Error('Quote terms/profile mismatch');
  const keys=new Map();for(const k of p.trustedQuoteKeys)keys.set(k.kid,await importQuotePublicKey(k.publicKey));
  await verifyQuoteDigestJws(r.quoteJws,r.quoteDigest,keys);
  const request:AgentQuoteRequest={version:2,orderSeed:q.orderSeed,catalogSeed:q.catalog.seed,items:q.items.map(({productId,quantity})=>({productId,quantity})),
    encryptedDelivery:r.encryptedDelivery,deliveryDetailsHash:q.delivery.deliveryDetailsHash,physicalDelivery:q.delivery.required,fulfillment:{methodId:q.delivery.snapshot.methodId,...(q.delivery.snapshot.optionId?{optionId:q.delivery.snapshot.optionId}:{})}};
  if(await agentRequestCommitment(request)!==q.requestHash||await canonicalHash(r.encryptedDelivery)!==q.delivery.encryptedDeliveryHash)throw new Error('Quote request commitment mismatch');
  return r;
}
function deliveryAad(seed:string){return canonicalBytes({version:2,purpose:'picomart-order-delivery',chainId:AGENT_CHAIN_ID,contractAddress:AGENT_CONTRACT,orderSeed:AgentSeedSchema.parse(seed)});}
async function encryptAgentDelivery(details:z.infer<typeof PicomartDeliveryDetailsV1Schema>,seed:string,keyBytes:Uint8Array,nonce:Uint8Array) {
  if(keyBytes.length!==32||nonce.length!==12)throw new Error('Invalid delivery key/nonce');
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(keyBytes),'AES-GCM',false,['encrypt']);
  const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:Uint8Array.from(nonce),additionalData:Uint8Array.from(deliveryAad(seed))},key,new TextEncoder().encode(canonicalJson(PicomartDeliveryDetailsV1Schema.parse(details)))));
  return AgentEncryptedDeliverySchema.parse({version:2,algorithm:'A256GCM',nonce:bytesToBase64Url(nonce),ciphertext:bytesToBase64Url(bytes.subarray(0,-16)),tag:bytesToBase64Url(bytes.subarray(-16))});
}
async function decryptAgentDelivery(value:z.infer<typeof AgentEncryptedDeliverySchema>,seed:string,keyBytes:Uint8Array) {
  const e=AgentEncryptedDeliverySchema.parse(value);if(keyBytes.length!==32)throw new Error('Invalid delivery key');
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(keyBytes),'AES-GCM',false,['decrypt']);
  const data=new Uint8Array([...base64UrlToBytes(e.ciphertext),...base64UrlToBytes(e.tag)]);
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(base64UrlToBytes(e.nonce)),additionalData:Uint8Array.from(deliveryAad(seed))},key,data);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),details=PicomartDeliveryDetailsV1Schema.parse(JSON.parse(text));
  if(canonicalJson(details)!==text)throw new Error('Noncanonical delivery');return details;
}
const encodeAgentPaymentRequired=(v:unknown)=>encodePaymentRequiredHeader(AgentPaymentRequiredSchema.parse(v) as never);
const decodeAgentPaymentRequired=(v:string)=>{if(v.length>65536)throw new Error('Header too large');return AgentPaymentRequiredSchema.parse(decodePaymentRequiredHeader(v));};
const encodeAgentPaymentSignature=(v:unknown)=>encodePaymentSignatureHeader(AgentPaymentPayloadSchema.parse(v) as never);
const decodeAgentPaymentSignature=(v:string)=>{if(v.length>65536)throw new Error('Header too large');return AgentPaymentPayloadSchema.parse(decodePaymentSignatureHeader(v));};
const encodeAgentPaymentResponse=(v:unknown)=>encodePaymentResponseHeader(AgentSettlementSchema.parse(v) as never);
const parseAgentHandoff=(hash:string)=>{
  const p=new URLSearchParams(hash.replace(/^#/,'')),allowed=['v','chain','deployment','orderSeed','deliveryKey'];
  if([...p.keys()].some(k=>!allowed.includes(k))||allowed.some(k=>p.getAll(k).length!==1)||p.get('v')!=='2'||p.get('chain')!==String(AGENT_CHAIN_ID))throw new Error('Invalid approval link');
  return AgentHandoffSchema.parse({version:2,chainId:AGENT_CHAIN_ID,contractAddress:p.get('deployment'),orderSeed:p.get('orderSeed'),deliveryKey:p.get('deliveryKey')});
};

return { AGENT_CHAIN_ID, AGENT_NETWORK, AGENT_CONTRACT, AGENT_TOKEN, AGENT_RESOLVE_PATH, agentConfirmPath, AgentSeedSchema, AgentDigestSchema, AgentAmountSchema, AgentEncryptedDeliverySchema, AgentItemSchema, AgentQuoteRequestSchema, AgentQuoteSchema, AgentResourceSchema, AgentRequirementsSchema, AgentPaymentRequiredSchema, AgentPaymentPayloadSchema, AgentSettlementSchema, AgentResolutionSchema, AgentProfileSchema, AgentHandoffSchema, agentRequestCommitment, agentRequirements, validateAgentResolution, encryptAgentDelivery, decryptAgentDelivery, encodeAgentPaymentRequired, decodeAgentPaymentRequired, encodeAgentPaymentSignature, decodeAgentPaymentSignature, encodeAgentPaymentResponse, parseAgentHandoff };
}
export type AgentQuote=z.infer<ReturnType<typeof createTempoAgentProtocol>['AgentQuoteSchema']>;
export type AgentQuoteRequest=z.infer<ReturnType<typeof createTempoAgentProtocol>['AgentQuoteRequestSchema']>;
export type AgentResolution=z.infer<ReturnType<typeof createTempoAgentProtocol>['AgentResolutionSchema']>;
export type AgentPaymentPayload=z.infer<ReturnType<typeof createTempoAgentProtocol>['AgentPaymentPayloadSchema']>;
export type AgentProfile=z.infer<ReturnType<typeof createTempoAgentProtocol>['AgentProfileSchema']>;
export type AgentHandoff=z.infer<ReturnType<typeof createTempoAgentProtocol>['AgentHandoffSchema']>;
