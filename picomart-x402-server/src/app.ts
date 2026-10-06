import {getCurrency,isPaymentCurrency} from '@picomart/config';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import express,{type Request,type Response,type NextFunction} from 'express';
import cors from 'cors';
import {AgentQuoteRequestSchema,AgentQuoteSchema,AgentResolutionSchema,AgentPaymentRequiredSchema,AgentSeedSchema,
  canonicalHash,canonicalEqual,agentRequestCommitment,agentRequirements,agentConfirmPath,AGENT_CONTRACT,AGENT_TOKEN,AGENT_NETWORK,
  importQuotePrivateKey,importQuotePublicKey,signQuoteDigest,verifyQuoteDigestJws,decodeAgentPaymentSignature,encodeAgentPaymentRequired,encodeAgentPaymentResponse} from './agentProtocol.js';
import type {ServerConfig} from './config.js';
import {SyncClient,fetchCatalog,validateMetadata} from './tempoClients.js';
import {QuoteRecordSchema,type QuoteStore} from './quoteStore.js';
import {verifyTempoPayment,ProofPending} from './tempoProof.js';
type Dependencies={config:ServerConfig;store:QuoteStore;sync?:Pick<SyncClient,'order'|'catalog'>;fetchCatalog?:typeof fetchCatalog;verifyPayment?:typeof verifyTempoPayment};
class HttpError extends Error{constructor(public status:number,public code:string,public retryAfter?:number){super(code);}}
export async function createApp(d:Dependencies){
  const {config,store}=d,sync=d.sync??new SyncClient(config.syncOrigin),catalogFetcher=d.fetchCatalog??fetchCatalog,proof=d.verifyPayment??verifyTempoPayment;
  const signingKey=await importQuotePrivateKey(config.signingKeyPkcs8),keys=new Map();for(const [kid,key] of config.quotePublicKeys)keys.set(kid,await importQuotePublicKey(key));
  const startupDigest=await canonicalHash({purpose:'picomart-tempo-quote-key-check',version:2});
  await verifyQuoteDigestJws(await signQuoteDigest(startupDigest,config.signingKid,signingKey),startupDigest,keys);
  const app=express();app.disable('x-powered-by');
  app.use(cors({origin:(o,cb)=>cb(null,!o||config.corsOrigins.has(o)),allowedHeaders:['Content-Type','PAYMENT-SIGNATURE'],exposedHeaders:['PAYMENT-REQUIRED','PAYMENT-RESPONSE']}));
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use(express.json({limit:131072,strict:true}));
  const network=`v2:${PICOMART_TEMPO_CONFIG.chainId}:${AGENT_CONTRACT}`,load=async(seed:string)=>{try{return await store.get(network,seed);}catch{throw new HttpError(503,'redis_unavailable',config.retrySeconds);}};
  app.get('/healthz',route(async(_req,res)=>{try{await store.ping();}catch{throw new HttpError(503,'redis_unavailable',config.retrySeconds);}res.json({status:'ok'});}));
  app.post((PICOMART_TEMPO_CONFIG.services.agentPath + '/order-quotes'),route(async(req,res)=>{
    const r=AgentQuoteRequestSchema.parse(req.body),requestHash=await agentRequestCommitment(r),existing=await load(r.orderSeed);
    if(existing){if(existing.requestHash!==requestHash)throw new HttpError(409,'seed_conflict');if(existing.expiresAt<=config.now())throw new HttpError(409,'quote_expired');
      res.set('PAYMENT-REQUIRED',encodeAgentPaymentRequired(existing.paymentRequired));res.status(402).json({paymentRequired:existing.paymentRequired});return;}
    let metadata;try{if(await sync.order(r.orderSeed))throw new HttpError(409,'seed_conflict');metadata=await sync.catalog(r.catalogSeed);}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(503,'sync_unavailable',config.retrySeconds);}
    if(!metadata)throw new HttpError(404,'catalog_not_found');metadata=validateMetadata(metadata,r.catalogSeed);
    const catalog=await catalogFetcher(metadata.catalogUrl,config),items=r.items.map(i=>{
      const p=catalog.find(p=>p.ProductId===i.productId);if(!p)throw new HttpError(422,'product_not_found');if(!isPaymentCurrency(p.PriceToken))throw new HttpError(422,'unsupported_asset');
      return {...i,name:p.Name,unitAmount:p.Price,lineAmount:String(BigInt(p.Price)*BigInt(i.quantity))};});
    const selectedTokens=r.items.map(i=>catalog.find(p=>p.ProductId===i.productId)!.PriceToken);
    if(new Set(selectedTokens).size!==1)throw new HttpError(422,'mixed_payment_currencies');
    const currency=getCurrency(selectedTokens[0]);
    const issuedAt=config.now(),expiresAt=issuedAt+600;
    const quote=AgentQuoteSchema.parse({version:2,orderSeed:r.orderSeed,requestHash,network:AGENT_NETWORK,
      x402:{protocolVersion:2,scheme:'picomart-order',schemeVersion:2,resourceMethod:'POST',resourcePath:agentConfirmPath(r.orderSeed),maxTimeoutSeconds:600},
      catalog:{seed:r.catalogSeed,sellerEvmAddress:metadata.seller,sellerPublicKey:metadata.sellerPublicKey,sellerIdentityId:metadata.sellerIdentityId,catalogUrl:metadata.catalogUrl},items,
      delivery:{required:r.physicalDelivery,optionId:'pilot-seller-arranged',optionName:'Seller-arranged delivery',amount:'0',deliveryDetailsHash:r.deliveryDetailsHash,encryptedDeliveryHash:await canonicalHash(r.encryptedDelivery)},
      payment:{symbol:currency.symbol,name:currency.name,assetType:'tip20',asset:currency.tokenId,decimals:currency.decimals,payTo:AGENT_CONTRACT,amount:String(items.reduce((s,i)=>s+BigInt(i.lineAmount),0n))},
      picomart:{chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:AGENT_CONTRACT},issuedAt,expiresAt});
    const quoteDigest=await canonicalHash(quote),quoteJws=await signQuoteDigest(quoteDigest,config.signingKid,signingKey);
    const paymentRequired=AgentPaymentRequiredSchema.parse({x402Version:2,error:'Browser approval and PAYMENT-SIGNATURE are required',
      resource:{url:config.resourceOrigin+agentConfirmPath(r.orderSeed),description:'Create and pay for a Picomart order',mimeType:'application/json',serviceName:'Picomart'},accepts:[agentRequirements(quote,quoteDigest,quoteJws)],extensions:{}});
    const recoverUntil=expiresAt+config.recoverySeconds,record=QuoteRecordSchema.parse({version:2,quote,quoteDigest,quoteJws,paymentRequired,requestHash,encryptedDelivery:r.encryptedDelivery,createdAt:issuedAt,expiresAt,recoverUntil,verification:{signingKid:config.signingKid}});
    let created;try{created=await store.create(network,r.orderSeed,record,recoverUntil-issuedAt);}catch{throw new HttpError(503,'redis_unavailable',config.retrySeconds);}
    if(!created){const winner=await load(r.orderSeed);if(!winner||winner.requestHash!==requestHash)throw new HttpError(409,'seed_conflict');
      res.set('PAYMENT-REQUIRED',encodeAgentPaymentRequired(winner.paymentRequired));res.status(402).json({paymentRequired:winner.paymentRequired});return;}
    res.set('PAYMENT-REQUIRED',encodeAgentPaymentRequired(paymentRequired));res.status(402).json({paymentRequired});
  }));
  app.post((PICOMART_TEMPO_CONFIG.services.agentPath + '/order-quotes/resolve'),route(async(req,res)=>{
    const record=await load(AgentSeedSchema.parse(req.body?.orderSeed));if(!record||record.expiresAt<=config.now())throw new HttpError(404,'quote_not_found');
    res.json(AgentResolutionSchema.parse({paymentRequired:record.paymentRequired,quote:record.quote,quoteDigest:record.quoteDigest,quoteJws:record.quoteJws,encryptedDelivery:record.encryptedDelivery,recoverUntil:record.recoverUntil}));
  }));
  app.post((PICOMART_TEMPO_CONFIG.services.agentPath + '/orders/:orderSeed/confirm'),route(async(req,res)=>{
    const seed=AgentSeedSchema.parse(req.params.orderSeed),record=await load(seed);if(!record||record.recoverUntil<=config.now())throw new HttpError(404,'quote_not_found');
    if(req.body&&Object.keys(req.body).length)throw new HttpError(400,'confirmation_body_not_allowed');
    const header=req.get('PAYMENT-SIGNATURE');if(!header){res.set('PAYMENT-REQUIRED',encodeAgentPaymentRequired(record.paymentRequired));res.status(402).json({error:'approval_required'});return;}
    let payload;try{payload=decodeAgentPaymentSignature(header);}catch{throw new HttpError(400,'malformed_payment_signature');}
    if(!canonicalEqual(payload.accepted,record.paymentRequired.accepts[0])||!canonicalEqual(payload.resource,record.paymentRequired.resource)||await canonicalHash(record.quote)!==record.quoteDigest)throw new HttpError(402,'invalid_payment');
    try{await verifyQuoteDigestJws(record.quoteJws,record.quoteDigest,keys);}catch{throw new HttpError(402,'invalid_payment');}
    let order;try{order=await proof(record.quote,payload,config.tempoRpcUrl);}catch(e){if(e instanceof ProofPending)throw new HttpError(503,'proof_pending',config.retrySeconds);throw new HttpError(402,'invalid_payment');}
    res.set('PAYMENT-RESPONSE',encodeAgentPaymentResponse({success:true,payer:payload.payload.buyer,transaction:payload.payload.transactionHash,network:AGENT_NETWORK,amount:record.quote.payment.amount,extensions:{}}));
    res.json({orderSeed:seed,transactionHash:payload.payload.transactionHash,status:order.status,order});
  }));
  app.use((e:unknown,_req:Request,res:Response,_next:NextFunction)=>{const error=e instanceof HttpError?e:new HttpError(400,'malformed_request');if(error.retryAfter)res.set('Retry-After',String(error.retryAfter));res.status(error.status).json({error:error.code});});return app;
}
function route(f:(req:Request,res:Response)=>Promise<unknown>){return(req:Request,res:Response,next:NextFunction)=>{void f(req,res).catch(next);};}
