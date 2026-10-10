import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {randomBytes} from 'node:crypto';
import QRCode from 'qrcode';
import {AgentQuoteRequestSchema,AgentProfileSchema,AgentSeedSchema,AGENT_CONTRACT,AGENT_TOKEN,AGENT_NETWORK,AGENT_RESOLVE_PATH,
  PicomartDeliveryDetailsV1Schema,canonicalHash,canonicalEqual,agentRequestCommitment,encryptAgentDelivery,decodeAgentPaymentRequired,encodeAgentPaymentSignature,validateAgentResolution,type PicomartDeliveryDetailsV1} from './agentProtocol.js';
import {tempoSeedToId,tempoRecipientValid,loadTempoCatalog,tempoFulfillmentSnapshot} from '@picomart/order-protocol/tempo-protocol';
import type {McpConfig} from './config.js';
import {PendingIntentStore,type PendingIntent} from './intentStore.js';
export type CreateOrderInput={catalogSeed:string;items:Array<{productId:string;quantity:number}>;delivery:PicomartDeliveryDetailsV1;fulfillment:{methodId:string;optionId?:string}};
export class PicomartOrderFlow{
  constructor(private config:McpConfig,private store:PendingIntentStore,private fetcher:typeof fetch=fetch,private now=()=>Math.floor(Date.now()/1000)){}
  private async json(response:Response){const text=await response.text();if(text.length>512000)throw new Error('response_too_large');return JSON.parse(text);}
  async catalog(seed:string){
    AgentSeedSchema.parse(seed);
    const response=await this.fetcher(this.config.syncOrigin+PICOMART_TEMPO_CONFIG.services.syncPath+'/catalogs/'+seed,{redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('catalog_unavailable');const body=await this.json(response);
    if(!body.success||body.data.chainId!==PICOMART_TEMPO_CONFIG.chainId||body.data.address!==AGENT_CONTRACT||body.data.catalog.seed!==seed)throw new Error('catalog_deployment_mismatch');
    const catalogUrl=body.data.catalog.catalogUrl;
    return {...await loadTempoCatalog(catalogUrl,PICOMART_TEMPO_CONFIG.services.catalogOrigin,this.fetcher,AbortSignal.timeout(8000)),catalogUrl};
  }
  async create(input:CreateOrderInput){
    const profile=AgentProfileSchema.parse({version:2,profileId:`picomart-mcp-${PICOMART_TEMPO_CONFIG.network}-v2`,quoteOrigin:this.config.x402Origin,resourceOrigin:this.config.x402Origin,
      network:AGENT_NETWORK,chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:AGENT_CONTRACT,trustedQuoteKeys:Object.entries(this.config.quotePublicKeys).map(([kid,publicKey])=>({kid,publicKey}))});
    const catalog=await this.catalog(input.catalogSeed),selection=tempoFulfillmentSnapshot(catalog.catalogUrl,catalog.deliveryOptionsUrl,catalog.deliveryOptions,input.fulfillment.methodId,input.fulfillment.optionId);
    const delivery=PicomartDeliveryDetailsV1Schema.parse(input.delivery);
    if(!tempoRecipientValid(selection.type,delivery)||delivery.noPhysicalDelivery!==(selection.type==='digital'))throw new Error('Complete the recipient fields required by the selected delivery method.');
    const orderSeed=randomBytes(16).toString('base64url'),key=randomBytes(32),nonce=randomBytes(12);
    let approvalKey:string,request;
    try{request=AgentQuoteRequestSchema.parse({version:2,orderSeed,catalogSeed:input.catalogSeed,items:input.items,encryptedDelivery:await encryptAgentDelivery(delivery,orderSeed,key,nonce),
      deliveryDetailsHash:await canonicalHash(delivery),physicalDelivery:!delivery.noPhysicalDelivery,fulfillment:input.fulfillment});approvalKey=key.toString('base64url');}finally{key.fill(0);nonce.fill(0);}
    const response=await this.fetcher(this.config.x402Origin+(PICOMART_TEMPO_CONFIG.services.agentPath + '/order-quotes'),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(10000)});
    if(response.status!==402)throw new Error('quote_creation_'+response.status);
    const header=response.headers.get('PAYMENT-REQUIRED');if(!header)throw new Error('missing_payment_required');const required=decodeAgentPaymentRequired(header);
    const resolvedResponse=await this.fetcher(this.config.x402Origin+AGENT_RESOLVE_PATH,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderSeed}),signal:AbortSignal.timeout(10000)});
    if(!resolvedResponse.ok)throw new Error('quote_resolution_failed');const resolved=await validateAgentResolution(await this.json(resolvedResponse),profile,this.now());
    if(resolved.quote.orderSeed!==orderSeed||resolved.quote.requestHash!==await agentRequestCommitment(request)||!canonicalEqual(required,resolved.paymentRequired))throw new Error('quote_commitment_mismatch');
    const approvalUrl=new URL('/agent-orders/approve',this.config.frontendOrigin);
    approvalUrl.hash=new URLSearchParams({v:'2',chain:String(PICOMART_TEMPO_CONFIG.chainId),deployment:AGENT_CONTRACT,orderSeed,deliveryKey:approvalKey}).toString();
    const intent:PendingIntent={version:2,intentId:orderSeed,orderSeed,catalogSeed:input.catalogSeed,requestHash:resolved.quote.requestHash,requirements:required.accepts[0],
      resource:required.resource,confirmationUrl:required.resource.url,quoteDigest:resolved.quoteDigest,quoteJws:resolved.quoteJws,encryptedDelivery:request.encryptedDelivery,
      seller:resolved.quote.catalog.sellerEvmAddress,expiresAt:resolved.quote.expiresAt,recoverUntil:resolved.recoverUntil,createdAt:this.now(),status:'awaiting_settlement'};
    await this.store.save(intent);const qr=await QRCode.toDataURL(approvalUrl.toString(),{errorCorrectionLevel:'M',margin:1});
    return {result:{status:'approval_required' as const,intentId:orderSeed,orderSeed,approvalUrl:approvalUrl.toString(),expiresAt:intent.expiresAt},qrBase64:qr.slice(qr.indexOf(',')+1)};
  }
  async status(intentId:string){
    AgentSeedSchema.parse(intentId);const intent=await this.store.load(intentId);if(!intent)return {status:'failed',orderSeed:intentId,code:'intent_not_found'};
    if(intent.status==='confirmed')return {status:'confirmed',orderSeed:intent.orderSeed,order:intent.order};
    if(intent.status==='failed'||intent.status==='expired')return {status:intent.status,orderSeed:intent.orderSeed,...intent.failure};
    if(this.now()>=intent.recoverUntil){intent.status='expired';await this.store.save(intent);return {status:'expired',orderSeed:intent.orderSeed};}
    const pending=async()=>{intent.status=this.now()>=intent.expiresAt?'proof_pending':'awaiting_settlement';await this.store.save(intent);return {status:intent.status,orderSeed:intent.orderSeed};};
    let response;try{response=await this.fetcher(this.config.syncOrigin+(PICOMART_TEMPO_CONFIG.services.syncPath + '/orders/')+intent.orderSeed,{redirect:'error',signal:AbortSignal.timeout(8000)});}catch{return pending();}
    if(!response.ok)return pending();const body=await this.json(response),data=body.data,order=data?.order,payment=order?.payment;
    if(!body.success||data.chainId!==PICOMART_TEMPO_CONFIG.chainId||data.address!==AGENT_CONTRACT||!Number.isSafeInteger(data.throughBlock)||!payment)return pending();
    if(order.orderId!==tempoSeedToId(intent.orderSeed)||order.catalogId!==tempoSeedToId(intent.catalogSeed)||order.seller!==intent.seller||order.buyer!==payment.payer||
      payment.amount!==intent.requirements.amount||payment.token!==intent.requirements.asset||!/^0x[0-9a-f]{64}$/.test(payment.transactionHash))return pending();
    // Public sync data supplies only a candidate hash. The quote server verifies it independently against RPC.
    const payload={x402Version:2,resource:intent.resource,accepted:intent.requirements,payload:{transactionHash:payment.transactionHash,buyer:payment.payer},extensions:{}};
    const target=new URL(intent.confirmationUrl);if(target.origin!==this.config.x402Origin)throw new Error('untrusted_confirmation_origin');
    let confirmed;try{confirmed=await this.fetcher(target,{method:'POST',redirect:'error',headers:{'PAYMENT-SIGNATURE':encodeAgentPaymentSignature(payload)},signal:AbortSignal.timeout(10000)});}catch{return pending();}
    if(confirmed.status===503)return pending();
    if(!confirmed.ok){intent.status='failed';intent.failure={code:'confirmation_'+confirmed.status,message:'Public payment proof was rejected.'};await this.store.save(intent);return {status:'failed',orderSeed:intent.orderSeed,...intent.failure};}
    const result=await this.json(confirmed);if(result.orderSeed!==intent.orderSeed||result.transactionHash!==payment.transactionHash||result.order?.orderId!==order.orderId||
      result.order?.buyer!==payment.payer||result.order?.priceAmount!==intent.requirements.amount||result.order?.priceToken!==intent.requirements.asset)throw new Error('confirmation_mismatch');
    intent.status='confirmed';intent.order=result.order;await this.store.save(intent);return {status:'confirmed',orderSeed:intent.orderSeed,order:intent.order};
  }
}
