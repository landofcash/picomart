import {isPaymentCurrency} from '@picomart/config';
import { Contract, Interface, JsonRpcProvider, ZeroAddress, hexlify, keccak256, toUtf8Bytes, toUtf8String } from 'ethers';
import { get, set } from 'idb-keyval';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {compactCatalogLink, parseCompactCatalogLink} from '@/lib/tempoLinks';
import { PICOMART_TEMPO_ABI, PICOMART_TEMPO_BUILD } from '@picomart/order-protocol/tempo-contract';
import { TempoOrderContextSchema, TempoMessagePayloadSchema, createTempoReceivingContext, createTempoReceivingIdentity,
  createTempoMessageBinding, canonicalJson, tempoSeedToId, tempoIdToSeed, tempoReferenceCommitment,
  type TempoOrderContext, type TempoExpectedMessage, type TempoMessagePayload } from '@picomart/order-protocol/tempo-protocol';
import { createTempoCommerceService, type TempoOperationSummary } from './internalWallet/tempoCommerce';
import { configuredProofClient } from './internalWallet/tempoRecoveryProof';
import { createTempoWalletTransactions, tempoWalletRevision, assertTempoWalletRevision } from './internalWallet/providers/tempoInternalWalletProvider';
import { type TempoContractCall, type TempoTransactionRecord, type TempoPaymentQuote, type TempoTransactionOptions } from './internalWallet/tempoTransactions';
import type { WalletAdapter } from '@/context/wallet/types';
import {TEMPO_UI_DEPLOYMENT,TEMPO_UI_ENABLED} from './tempoDeployment';

export const TEMPO_MARKET_DEPLOYMENT = TEMPO_UI_DEPLOYMENT;
export const TEMPO_MARKET_ENABLED = TEMPO_UI_ENABLED;
export const TEMPO_SYNC_URL = `${(import.meta.env.VITE_PICOMART_SYNC_ORIGIN || (import.meta.env.DEV ? 'http://localhost:3000' : PICOMART_TEMPO_CONFIG.services.syncOrigin)).replace(/\/$/, '')}${PICOMART_TEMPO_CONFIG.services.syncPath}`;
export const TEMPO_CDN_ORIGIN = PICOMART_TEMPO_CONFIG.services.catalogOrigin;
export const PATH_USD = PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId;
export const marketRpc = new JsonRpcProvider(PICOMART_TEMPO_CONFIG.rpcUrl);
export const marketContract = new Contract(TEMPO_MARKET_DEPLOYMENT.address, PICOMART_TEMPO_ABI, marketRpc);
export const marketInterface = new Interface(PICOMART_TEMPO_ABI);
export const marketTransactions = createTempoWalletTransactions({deployment:()=>TEMPO_MARKET_ENABLED ? TEMPO_MARKET_DEPLOYMENT : null});
export interface MarketCatalog {catalogId:string;seed:string;seller:string;sellerPublicKey:string;sellerIdentityId:string;catalogUrl:string;}
export interface MarketProduct {ProductId:string;Name:string;Description:string;Image:string;PriceToken:string;Price:string;}
export interface MarketMessage {messageType:number;sequence:number;author:string;commitment:string;buyerEnvelope:string;sellerEnvelope:string;transactionHash:string;blockNumber:number;transactionIndex:number;logIndex:number;}
export interface MarketOrder {orderId:string;seed:string;catalogId:string;priceAmount:string;priceToken:string;buyer:string;seller:string;payer:string;status:number;deleted:boolean;deadline:number;context:TempoOrderContext;messages:MarketMessage[];payment?:{transactionHash:string;blockNumber:number;payer:string;amount:string;token:string};}
export interface CheckoutSelection {catalog:MarketCatalog;products:Array<MarketProduct & {quantity:number}>;}
export interface CheckoutDraft {version:1;account:string;selectionHash:string;order:TempoOrderContext;input:Record<string,string>;expiresAt:string;preparedAt:number;operationId:string;method:'createOrderPaid'|'createOrderInitial';}
export const statusNames = ['None','Awaiting payment','Paid','Delivering','Completed','Refund requested','Refunded to payer','Paid to seller','Canceled'];
const pubkey = (key:string) => btoa(String.fromCharCode(...new Uint8Array(key.slice(2).match(/.{2}/g)!.map(b=>parseInt(b,16)))));
const keyBytes = (key:string) => hexlify(Uint8Array.from(atob(key), c=>c.charCodeAt(0)));
export function marketAddress(value:string):string {
  if(!/^0x[0-9a-f]{40}$/i.test(value)||value.toLowerCase()===ZeroAddress)throw new Error('Use a nonzero EVM address.');
  return value.toLowerCase();
}
export function receivingContext(role:'buyer'|'seller',account:string,seed:string) {
  return createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:PICOMART_TEMPO_CONFIG.chainId,
    contractAddress:TEMPO_MARKET_DEPLOYMENT.address,account:marketAddress(account),
    ...(role==='buyer'?{role:'buyer',orderSeed:seed}:{role:'seller',catalogSeed:seed})});
}
export function catalogIdentity(catalog:MarketCatalog) {
  if(tempoSeedToId(catalog.seed)!==catalog.catalogId.toLowerCase())throw new Error('Invalid catalog ID.');
  const identity=createTempoReceivingIdentity(receivingContext('seller',catalog.seller,catalog.seed),pubkey(catalog.sellerPublicKey));
  if(identity.identityId!==catalog.sellerIdentityId.toLowerCase())throw new Error('Invalid catalog receiving identity.');
  return identity;
}
export async function verifyMarketDeployment() {
  if(Number(BigInt(await marketRpc.send('eth_chainId',[])))!==PICOMART_TEMPO_CONFIG.chainId || keccak256(await marketRpc.getCode(TEMPO_MARKET_DEPLOYMENT.address))!==PICOMART_TEMPO_BUILD.runtimeBytecodeHash)throw new Error('Tempo chain or deployment does not match this app.');
}
export async function marketApi<T>(path:string,signal?:AbortSignal):Promise<T> {
  const response=await fetch(TEMPO_SYNC_URL+path,{signal,redirect:'error'});
  if(response.status===503)throw new Error('Order history is catching up or temporarily unavailable. Refresh shortly.');
  if(!response.ok)throw new Error(`History request failed (${response.status}).`);
  const json=await response.json();
  if(!json.success||json.data.chainId!==PICOMART_TEMPO_CONFIG.chainId||json.data.address?.toLowerCase()!==TEMPO_MARKET_DEPLOYMENT.address||!Number.isSafeInteger(json.data.throughBlock))throw new Error('History belongs to another chain or deployment.');
  return json.data as T;
}
export async function catalogs(account?:string,signal?:AbortSignal) {
  const data=await marketApi<{catalogs:MarketCatalog[]}>(account?`/catalogs/seller/${marketAddress(account)}`:'/catalogs',signal);
  data.catalogs.forEach(catalogIdentity); return data.catalogs;
}
export async function orders(role:'buyer'|'seller'|'payer',account:string,signal?:AbortSignal) {
  const data=await marketApi<{orders:MarketOrder[]}>(`/orders/${role}/${marketAddress(account)}`,signal);
  return data.orders.map(validateMarketOrder);
}
export function validateMarketOrder(order:MarketOrder):MarketOrder {
  const context=TempoOrderContextSchema.parse(order.context);
  if(context.contractAddress!==TEMPO_MARKET_DEPLOYMENT.address||tempoSeedToId(context.orderSeed)!==order.orderId || tempoSeedToId(context.catalogSeed)!==order.catalogId||context.buyerIdentity.context.account!==marketAddress(order.buyer)||context.sellerIdentity.context.account!==marketAddress(order.seller)||!Number.isInteger(order.status)||order.status<1||order.status>8||!/^\d+$/.test(order.priceAmount)||BigInt(order.priceAmount)<=0n||!isPaymentCurrency(order.priceToken))throw new Error('Invalid Tempo order binding.');
  const seen=new Set<number>();
  for(const message of order.messages) {
    const type=messageType(message.messageType);
    if(seen.has(message.messageType)||message.sequence!==1)throw new Error('Duplicate order message.');seen.add(message.messageType);
    const expected={messageType:type,sequence:1},binding=createTempoMessageBinding(context,expected);
    if(binding.author!==message.author.toLowerCase()||tempoReferenceCommitment(binding,message.buyerEnvelope,message.sellerEnvelope,context,expected)!==message.commitment)throw new Error('Order reference commitment mismatch.');
  }
  return {...order,context};
}
export function messageType(type:number):TempoExpectedMessage['messageType'] {
  if(type===1)return 'buyer-order';if(type===2)return 'seller-delivery';if(type===3)return 'seller-refusal';
  throw new Error('Unsupported order message type.');
}
export function validateProducts(input:unknown):MarketProduct[] {
  if(!Array.isArray(input)||input.length===0||input.length>1000)throw new Error('Catalog must contain 1–1000 products.');
  const ids=new Set<string>();
  return input.map(raw=>{
    if(!raw||typeof raw!=='object')throw new Error('Invalid catalog product.');
    const p=raw as MarketProduct;
    const amount=typeof p.Price==='number'&&Number.isSafeInteger(p.Price)?String(p.Price):p.Price;
    if(typeof p.ProductId!=='string'||!p.ProductId||ids.has(p.ProductId)||typeof p.Name!=='string'||!p.Name||typeof p.Description!=='string'||typeof amount!=='string'||!/^\d+$/.test(amount)||BigInt(amount)<=0n||!isPaymentCurrency(p.PriceToken)||new URL(p.Image).protocol!=='https:')throw new Error('Catalog products require unique IDs, positive integer prices and a supported payment currency.');
    ids.add(p.ProductId);return {...p,Price:amount,PriceToken:p.PriceToken.toLowerCase()};
  });
}
export async function fetchCatalogProducts(url:string,signal?:AbortSignal) {
  if(new URL(url).origin!==TEMPO_CDN_ORIGIN)throw new Error('Use the configured Picomart catalog CDN.');
  const response=await fetch(url,{signal,redirect:'error'});
  if(!response.ok)throw new Error('Catalog could not be loaded.');
  const text=await response.text(),bytes=new TextEncoder().encode(text);if(bytes.length>1_000_000)throw new Error('Catalog exceeds its size limit.');
  const expectedHash=new URL(url).pathname.match(/^\/moderato\/v1\/0x[0-9a-f]{40}\/catalogs\/([0-9a-f]{64})\.json$/)?.[1];
  if(expectedHash&&hexlify(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).slice(2)!==expectedHash)throw new Error('Published catalog content does not match its revision URL.');
  return validateProducts(JSON.parse(text));
}
export function validateSelection(selection:CheckoutSelection) {
  catalogIdentity(selection.catalog);
  const products=validateProducts(selection.products),amount=selection.products.reduce((sum,p)=>{
    if(!Number.isSafeInteger(p.quantity)||p.quantity<=0||p.quantity>1000000)throw new Error('Choose positive whole quantities.');
    return sum+BigInt(p.Price)*BigInt(p.quantity);
  },0n);
  if (!products.length || new Set(products.map(p=>p.PriceToken)).size!==1) throw new Error('An order must use one payment currency.');
  return {products,amount,token:products[0].PriceToken};
}
export async function revalidateSelection(selection:CheckoutSelection) {
  const {amount}=validateSelection(selection);await verifyMarketDeployment();
  const actual=await marketContract.catalogs(selection.catalog.catalogId);
  if(actual.seller.toLowerCase()!==selection.catalog.seller.toLowerCase()||actual.sellerPublicKey!==selection.catalog.sellerPublicKey||actual.sellerIdentityId!==selection.catalog.sellerIdentityId||actual.catalogUrl!==selection.catalog.catalogUrl)throw new Error('Catalog changed; reload it before ordering.');
  const listed=await fetchCatalogProducts(actual.catalogUrl);
  for(const product of selection.products) {
    const current=listed.find(p=>p.ProductId===product.ProductId);
    const {quantity,...terms}=product;void quantity;
    if(!current||canonicalJson(current)!==canonicalJson(terms))throw new Error('Product or price changed; review the catalog again.');
  }
  return amount;
}
export function commerceService() {
  const client=configuredProofClient();if(!client)throw new Error('The private message service is not configured.');
  return createTempoCommerceService({client,origins:{apiOrigin:client.apiOrigin,downloadOrigin:client.downloadOrigin},
    deployment:()=>TEMPO_MARKET_DEPLOYMENT.address,maxRetentionSeconds:2592000});
}
const draftKey=(account:string,id:string)=>`picomart_tempo_checkout_v1_${TEMPO_MARKET_DEPLOYMENT.address}_${marketAddress(account)}_${id}`;
export const selectionHash=(selection:CheckoutSelection)=>keccak256(toUtf8Bytes(canonicalJson(selection)));
export async function checkoutIntent(selection:CheckoutSelection,account:string,fresh=false) {
  validateSelection(selection);
  const key=`picomart_tempo_checkout_intent_${marketAddress(account)}_${selectionHash(selection)}`;
  if(!navigator.locks)throw new Error('Web Locks are required for safe order recovery.');
  return navigator.locks.request(key,async()=>{
    const saved=await get<string>(key);
    if(saved){
      if(!fresh)return saved;
      const draft=await loadCheckout(account,saved);
      const receipt=draft?await marketTransactions.recoverOperation(account,draft.operationId):null;
      // A fresh cart checkout starts a new intent only after the previous order
      // is confirmed. Prepared and uncertain operations always resume unchanged.
      if(receipt?.state!=='confirmed'||receipt.method!=='createOrderPaid')return saved;
    }
    const id=hexlify(crypto.getRandomValues(new Uint8Array(16)));await set(key,id);return id;
  });
}
export async function prepareCheckout(wallet:WalletAdapter,selection:CheckoutSelection,delivery:Record<string,unknown>,id:string,method:CheckoutDraft['method']):Promise<CheckoutDraft> {
  if(!TEMPO_MARKET_ENABLED)throw new Error('Testnet commerce is not enabled.');
  if(delivery.noPhysicalDelivery!==true&&['fullName','address','city','postalCode','country','phone','email'].some(field=>typeof delivery[field]!=='string'||!String(delivery[field]).trim()))throw new Error('Complete the required physical delivery details.');
  const account=marketAddress((await wallet.getAddress())??''),revision=tempoWalletRevision();
  const amount=await revalidateSelection(selection);assertTempoWalletRevision(revision);
  const service=commerceService(),sellerIdentity=catalogIdentity(selection.catalog);
  const buyerIdentity=await service.receivingIdentity(wallet,receivingContext('buyer',account,tempoIdToSeed(id)));
  const order=TempoOrderContextSchema.parse({version:1,chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:TEMPO_MARKET_DEPLOYMENT.address,
    catalogSeed:selection.catalog.seed,orderSeed:tempoIdToSeed(id),buyerIdentity,sellerIdentity});
  const saved=await get<CheckoutDraft>(draftKey(account,id));
  const expiresAt=saved?.expiresAt??new Date(Date.now()+2592000_000-1000).toISOString().replace(/\.\d{3}Z$/,'Z');
  const payload=TempoMessagePayloadSchema.parse({version:1,profile:'picomart-message-v1',binding:createTempoMessageBinding(order,{messageType:'buyer-order',sequence:1}),data:{catalogSeed:order.catalogSeed,orderSeed:order.orderSeed,
    items:selection.products.map(p=>({productId:p.ProductId,name:p.Name,quantity:p.quantity,unitAmount:p.Price,lineAmount:String(BigInt(p.Price)*BigInt(p.quantity))})),
    delivery,deliveryAmount:'0',payment:{tokenAddress:validateSelection(selection).token,amount:String(amount)}}});
  const input={orderId:id,catalogId:selection.catalog.catalogId,priceAmount:String(amount),priceToken:validateSelection(selection).token,
    expectedSeller:selection.catalog.seller,expectedSellerPublicKey:selection.catalog.sellerPublicKey,
    expectedSellerIdentityId:selection.catalog.sellerIdentityId,buyerPublicKey:keyBytes(buyerIdentity.publicKey),buyerIdentityId:buyerIdentity.identityId};
  if(saved&&(canonicalJson(saved.order)!==canonicalJson(order)||canonicalJson(saved.input)!==canonicalJson(input)||saved.method!==method))throw new Error('This saved order has different terms.');
  const draft:CheckoutDraft=saved??{version:1,account,selectionHash:selectionHash(selection),order,input,expiresAt,preparedAt:Date.now(),operationId:`order:${id}`,method};
  await set(draftKey(account,id),draft);
  await service.prepare(wallet,order,payload,{messageType:'buyer-order',sequence:1},expiresAt);
  assertTempoWalletRevision(revision);return draft;
}
export async function loadCheckout(account:string,id:string) {return get<CheckoutDraft>(draftKey(account,id));}
export function validateCheckoutDraft(draft:CheckoutDraft,selection:CheckoutSelection) {
  const {amount}=validateSelection(selection),order=TempoOrderContextSchema.parse(draft.order);
  const expected={orderId:tempoSeedToId(order.orderSeed),catalogId:selection.catalog.catalogId,priceAmount:String(amount),priceToken:validateSelection(selection).token,
    expectedSeller:selection.catalog.seller,expectedSellerPublicKey:selection.catalog.sellerPublicKey,expectedSellerIdentityId:selection.catalog.sellerIdentityId,
    buyerPublicKey:keyBytes(order.buyerIdentity.publicKey),buyerIdentityId:order.buyerIdentity.identityId};
  if(draft.version!==1||draft.selectionHash!==selectionHash(selection)||order.contractAddress!==TEMPO_MARKET_DEPLOYMENT.address||
    marketAddress(draft.account)!==order.buyerIdentity.context.account||canonicalJson(order.sellerIdentity)!==canonicalJson(catalogIdentity(selection.catalog))||
    order.catalogSeed!==selection.catalog.seed||canonicalJson(expected)!==canonicalJson(draft.input)||
    draft.operationId!==`order:${expected.orderId}`||!['createOrderPaid','createOrderInitial'].includes(draft.method))throw new Error('Prepared order terms differ from the reviewed selection.');
}
export async function readyReference(wallet:WalletAdapter,order:TempoOrderContext,type:TempoExpectedMessage['messageType'],signal?:AbortSignal) {
  const op=await commerceService().resumeUpload(wallet,order,{messageType:type,sequence:1},{waitForReady:true,signal});
  if(!op.ready)throw new Error(op.state==='pending'
    ? 'Order details are still being verified. Resume preparation to check the saved details again.'
    : `Saved order details are ${op.state}. Resume the saved preparation before submitting.`);
  if(Date.parse(op.expiresAt)-Date.now()<29*86400_000-2000)throw new Error('Message retention is insufficient. Keep this operation for recovery; prepare a fresh intentional action.');
  return op;
}
const reference=(op:TempoOperationSummary)=>({sequence:1,buyerEnvelope:hexlify(toUtf8Bytes(op.buyerEnvelope)),sellerEnvelope:hexlify(toUtf8Bytes(op.sellerEnvelope))});
export async function checkoutCall(wallet:WalletAdapter,draft:CheckoutDraft,signal?:AbortSignal):Promise<TempoContractCall> {
  const op=await readyReference(wallet,draft.order,'buyer-order',signal);
  return {method:draft.method,args:[draft.input,reference(op)]};
}
async function checkoutSubmission(wallet:WalletAdapter,draft:CheckoutDraft,selection:CheckoutSelection,signal?:AbortSignal,assertApproval?:()=>void) {
  if(draft.selectionHash!==selectionHash(selection))throw new Error('Checkout selection differs from the prepared order.');
  validateCheckoutDraft(draft,selection);
  const call=await checkoutCall(wallet,draft,signal);
  const beforeSign=async()=>{assertApproval?.();validateCheckoutDraft(draft,selection);await revalidateSelection(selection);const verified=await checkoutCall(wallet,draft,signal);assertApproval?.();
    if(marketInterface.encodeFunctionData(call.method,call.args)!==marketInterface.encodeFunctionData(verified.method,verified.args))throw new Error('Prepared references changed.');};
  const options={operationId:draft.operationId,expectedAccount:draft.account,signal,beforeSign};
  return {call,options};
}
export async function submitCheckout(wallet:WalletAdapter,draft:CheckoutDraft,selection:CheckoutSelection,approveOnly=false,signal?:AbortSignal,assertApproval?:()=>void,maximumFeeBaseUnits?:string):Promise<TempoTransactionRecord|null> {
  const submission=await checkoutSubmission(wallet,draft,selection,signal,assertApproval);
  const {call}=submission,options={...submission.options,maximumFeeBaseUnits};
  if(approveOnly)return marketTransactions.approvePayment(call,options);
  return call.method==='createOrderPaid'?marketTransactions.payOrder(call,options):marketTransactions.sendContract(call,options);
}
export async function submitBuiltinCheckout(wallet:WalletAdapter,draft:CheckoutDraft,selection:CheckoutSelection,quote:TempoPaymentQuote,signal?:AbortSignal,assertApproval?:()=>void,onSaved?:TempoTransactionOptions['onSaved']) {
  const {call,options}=await checkoutSubmission(wallet,draft,selection,signal,assertApproval);
  return marketTransactions.payOrderAutomatically(call,quote,{...options,onSaved});
}
/** Independently authenticate a reference against its exact successful onchain event. */
export async function decryptOrderMessage(wallet:WalletAdapter,orderInput:MarketOrder,message:MarketMessage,role:'buyer'|'seller'):Promise<TempoMessagePayload> {
  const order=validateMarketOrder(orderInput);await authenticateOrder(order);
  const receipt=await marketRpc.getTransactionReceipt(message.transactionHash);
  const log=receipt?.logs.find(l=>l.index===message.logIndex && l.address.toLowerCase()===TEMPO_MARKET_DEPLOYMENT.address);
  const event=log?marketInterface.parseLog(log):null;
  if(receipt?.status!==1||event?.name!=='OrderMessage'||event.args.orderId!==order.orderId||Number(event.args.messageType)!==message.messageType||Number(event.args.sequence)!==message.sequence||event.args.commitment!==message.commitment||toUtf8String(event.args.buyerEnvelope)!==message.buyerEnvelope||toUtf8String(event.args.sellerEnvelope)!==message.sellerEnvelope)throw new Error('Message does not match a successful Picomart receipt.');
  const payload=await commerceService().receive(wallet,order.context,{messageType:messageType(message.messageType),sequence:1},role,message.buyerEnvelope,message.sellerEnvelope,message.commitment);
  if(payload.binding.messageType==='buyer-order'&&('payment' in payload.data)&&
    (payload.data.payment.amount!==order.priceAmount||payload.data.payment.tokenAddress!==order.priceToken))throw new Error('Private order payment differs from the onchain terms.');
  return payload;
}
export async function authenticateOrder(order:MarketOrder) {
  validateMarketOrder(order);await verifyMarketDeployment();
  const first=order.messages.find(m=>m.messageType===1);if(!first)throw new Error('Order has no creation reference.');
  const receipt=await marketRpc.getTransactionReceipt(first.transactionHash);
  const created=receipt?.logs.filter(l=>l.address.toLowerCase()===TEMPO_MARKET_DEPLOYMENT.address).map(l=>marketInterface.parseLog(l)).find(e=>e?.name==='OrderCreated'&&e.args.orderId===order.orderId);
  if(receipt?.status!==1||!created)throw new Error('Order creation receipt is not verified.');
  const a=created.args;
  if(a.buyer.toLowerCase()!==order.buyer||a.seller.toLowerCase()!==order.seller||a.catalogId!==order.catalogId||a.token.toLowerCase()!==order.priceToken||String(a.amount)!==order.priceAmount||a.buyerIdentityId!==order.context.buyerIdentity.identityId||a.sellerIdentityId!==order.context.sellerIdentity.identityId)throw new Error('Order terms differ from the creation receipt.');
}
export async function verifyOrderTerms(order:MarketOrder) {
  await authenticateOrder(order);
  const actual=await marketContract.getOrder(order.orderId);
  if(Number(actual.version)!==1||Number(actual.status)!==order.status||actual.buyer.toLowerCase()!==order.buyer||actual.seller.toLowerCase()!==order.seller||actual.payer.toLowerCase()!==order.payer||actual.priceToken.toLowerCase()!==order.priceToken||String(actual.priceAmount)!==order.priceAmount||actual.buyerIdentityId!==order.context.buyerIdentity.identityId||actual.sellerIdentityId!==order.context.sellerIdentity.identityId)throw new Error('Order state changed; refresh history before acting.');
}
export async function sellerMessage(wallet:WalletAdapter,order:MarketOrder,type:'seller-delivery'|'seller-refusal',data:Record<string,string>,signal?:AbortSignal) {
  const revision=tempoWalletRevision();await verifyMarketDeployment();assertTempoWalletRevision(revision);
  validateMarketOrder(order);const key=`picomart_tempo_seller_message_${TEMPO_MARKET_DEPLOYMENT.address}_${order.orderId}_${type}`;
  const expiresAt=await get<string>(key)??new Date(Date.now()+2592000_000-1000).toISOString().replace(/\.\d{3}Z$/,'Z');
  await set(key,expiresAt);
  const service=commerceService(),expected={messageType:type,sequence:1};
  await service.prepare(wallet,order.context,TempoMessagePayloadSchema.parse({version:1,profile:'picomart-message-v1',binding:createTempoMessageBinding(order.context,expected),data}),expected,expiresAt);
  const op=await readyReference(wallet,order.context,type,signal);
  return {method:type==='seller-delivery'?'startDelivering':'refuseOrder',args:[order.orderId,reference(op)]} satisfies TempoContractCall;
}
export async function prepareOrResumeSellerMessage(wallet:WalletAdapter,order:MarketOrder,type:'seller-delivery'|'seller-refusal',data:Record<string,string>,signal?:AbortSignal) {
  return await commerceService().hasPreparedOperation(order.context,{messageType:type,sequence:1})
    ? resumeSellerMessage(wallet,order,type,signal) : sellerMessage(wallet,order,type,data,signal);
}
export async function resumeSellerMessage(wallet:WalletAdapter,order:MarketOrder,type:'seller-delivery'|'seller-refusal',signal?:AbortSignal) {
  const op=await readyReference(wallet,order.context,type,signal);
  return {method:type==='seller-delivery'?'startDelivering':'refuseOrder',args:[order.orderId,reference(op)]} satisfies TempoContractCall;
}
export async function previewPreparedMessage(wallet:WalletAdapter,order:TempoOrderContext,type:TempoExpectedMessage['messageType'],signal?:AbortSignal) {
  const op=await readyReference(wallet,order,type,signal);
  return commerceService().receive(wallet,order,{messageType:type,sequence:1},type==='buyer-order'?'buyer':'seller',op.buyerEnvelope,op.sellerEnvelope,op.commitment);
}
export function catalogLink(seed:string,productId?:string,origin='https://app.picomart.zkbytes.com') {
  tempoSeedToId(seed);return compactCatalogLink(seed,productId,origin);
}
export function parseCatalogLink(url:string) {
  const {seed,productId}=parseCompactCatalogLink(url);tempoSeedToId(seed);return {seed,productId};
}
