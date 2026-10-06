import {beforeAll,describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPair,exportJWK} from 'jose';
import {canonicalHash,signQuoteDigest,agentRequestCommitment,agentRequirements,agentConfirmPath,encodeAgentPaymentRequired,decodeAgentPaymentSignature,AGENT_CONTRACT,AGENT_TOKEN} from './agentProtocol.js';
import {PendingIntentStore} from './intentStore.js';
import {PicomartOrderFlow} from './orderFlow.js';
import type {McpConfig} from './config.js';
const f=JSON.parse(await fs.readFile(new URL(import.meta.resolve('@picomart/order-protocol/fixtures/tempo/agent-order-v2.json')),'utf8'));
let key:CryptoKey,config:McpConfig;beforeAll(async()=>{const keys=await generateKeyPair('Ed25519',{extractable:true});key=keys.privateKey;
  config={x402Origin:'https://x402.example.test',syncOrigin:'https://sync.example.test',frontendOrigin:'https://app.example.test',dataDir:'',quotePublicKeys:{test:(await exportJWK(keys.publicKey)).x!}};});
async function withFlow(run:(value:{flow:PicomartOrderFlow;store:PendingIntentStore;posts:any[];state:any;directory:string})=>Promise<void>){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'picomart-tempo-mcp-')),store=new PendingIntentStore(directory),posts:any[]=[],state:any={now:1700000000,publicOrder:null,confirmationStatus:200,corrupt:false};
  const fetcher=(async(url:any,init:any)=>{
    const target=String(url);if(target.endsWith('/order-quotes')){
      const body=JSON.parse(init.body);posts.push(body);const quote={...structuredClone(f.resolution.quote),orderSeed:body.orderSeed,requestHash:await agentRequestCommitment(body),
        x402:{...f.resolution.quote.x402,resourcePath:agentConfirmPath(body.orderSeed)},delivery:{...f.resolution.quote.delivery,required:body.physicalDelivery,deliveryDetailsHash:body.deliveryDetailsHash,encryptedDeliveryHash:await canonicalHash(body.encryptedDelivery)}};
      const digest=await canonicalHash(quote),jws=await signQuoteDigest(digest,'test',key),required={...f.resolution.paymentRequired,resource:{...f.resolution.paymentRequired.resource,url:config.x402Origin+agentConfirmPath(body.orderSeed)},accepts:[agentRequirements(quote,digest,jws)]};
      state.resolution={quote,quoteDigest:digest,quoteJws:jws,encryptedDelivery:body.encryptedDelivery,paymentRequired:required,recoverUntil:quote.expiresAt+86400};
      return Response.json({},{status:402,headers:{'PAYMENT-REQUIRED':encodeAgentPaymentRequired(required)}});
    }
    if(target.endsWith('/resolve')){const r=structuredClone(state.resolution);if(state.corrupt)r.quote.items[0].name='changed';return Response.json(r);}
    if(target.endsWith('/confirm')){const payload=decodeAgentPaymentSignature(init.headers['PAYMENT-SIGNATURE']);state.payload=payload;
      return Response.json({orderSeed:payload.accepted.extra.orderSeed,transactionHash:payload.payload.transactionHash,order:{...state.publicOrder}}, {status:state.confirmationStatus});}
    return state.publicOrder?Response.json({success:true,data:{chainId:42431,address:AGENT_CONTRACT,throughBlock:37694570,order:state.publicOrder}}):new Response('',{status:404});
  }) as typeof fetch;
  const flow=new PicomartOrderFlow(config,store,fetcher,()=>state.now);
  try{await run({flow,store,posts,state,directory});}finally{await fs.rm(directory,{recursive:true,force:true});}
}
const input={catalogSeed:f.request.catalogSeed,items:f.request.items,delivery:f.delivery};
function paid(seed:string){const id='0x'+Buffer.from(seed,'base64url').toString('hex'),buyer=f.order.buyerIdentity.context.account;
  return {orderId:id,catalogId:'0x'+'01'.repeat(16),seller:f.resolution.quote.catalog.sellerEvmAddress,buyer,payer:buyer,priceAmount:'2500000',priceToken:AGENT_TOKEN,status:2,
    payment:{transactionHash:'0x'+'ab'.repeat(32),payer:buyer,amount:'2500000',token:AGENT_TOKEN}};}
describe('Tempo MCP handoff and confirmation',()=>{
  it('sends only delivery ciphertext and commitments; keeps the key only in the local URL/QR',async()=>withFlow(async({flow,store,posts,directory})=>{
    const {result,qrBase64}=await flow.create(input),url=new URL(result.approvalUrl),key=new URLSearchParams(url.hash.slice(1)).get('deliveryKey');
    expect(result.status).toBe('approval_required');expect(url.pathname).toBe('/agent-orders/approve');expect(url.hash).toContain('v=2');expect(qrBase64).toBeTruthy();
    expect(posts[0].deliveryKey).toBeUndefined();expect(JSON.stringify(posts[0])).not.toContain('Test recipient');
    const raw=await fs.readFile(path.join(directory,result.intentId+'.json'),'utf8');expect(raw).not.toContain(key!);expect(raw).not.toContain('Test recipient');expect((await store.load(result.intentId))?.version).toBe(2);
  }));
  it('rejects a tampered quote before presenting an approval link',async()=>withFlow(async({flow,state})=>{state.corrupt=true;await expect(flow.create(input)).rejects.toThrow();}));
  it('keeps delayed indexing pending, then confirms the exact retained order and recovers it after restart',async()=>withFlow(async({flow,store,state,directory})=>{
    const {result}=await flow.create(input);expect((await flow.status(result.intentId)).status).toBe('awaiting_settlement');state.now=1700000601;
    expect((await flow.status(result.intentId)).status).toBe('proof_pending');state.publicOrder=paid(result.orderSeed);state.confirmationStatus=503;
    expect((await flow.status(result.intentId)).status).toBe('proof_pending');state.confirmationStatus=200;expect((await flow.status(result.intentId)).status).toBe('confirmed');
    expect(state.payload.payload).toEqual({transactionHash:state.publicOrder.payment.transactionHash,buyer:state.publicOrder.buyer});
    expect((await new PendingIntentStore(directory).load(result.intentId))?.status).toBe('confirmed');expect((await flow.status(result.intentId)).status).toBe('confirmed');
  }));
  it('does not send unrelated amount/token/order candidates for confirmation',async()=>withFlow(async({flow,state})=>{const {result}=await flow.create(input);state.publicOrder=paid(result.orderSeed);state.publicOrder.payment.amount='1';
    expect((await flow.status(result.intentId)).status).toBe('awaiting_settlement');expect(state.payload).toBeUndefined();}));
  it('expires at the recovery deadline and never resurrects rejected proof',async()=>withFlow(async({flow,state})=>{const {result}=await flow.create(input);state.publicOrder=paid(result.orderSeed);state.confirmationStatus=402;
    expect((await flow.status(result.intentId)).status).toBe('failed');state.confirmationStatus=200;expect((await flow.status(result.intentId)).status).toBe('failed');
  }));
  it('ends an unconfirmed intent after its recovery window',async()=>withFlow(async({flow,state})=>{const {result}=await flow.create(input);state.now=1700087000;expect((await flow.status(result.intentId)).status).toBe('expired');}));
});
