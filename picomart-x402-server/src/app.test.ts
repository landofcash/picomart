import {beforeAll,describe,it,expect,vi} from 'vitest';
import request from 'supertest';
import {generateKeyPair,exportPKCS8,exportJWK} from 'jose';
import fs from 'node:fs';
import {AGENT_CONTRACT,AGENT_TOKEN,encodeAgentPaymentSignature} from '@picomart/order-protocol/tempo-agent';
import {createApp} from './app.js';
import {InMemoryQuoteStore} from './quoteStore.js';
import {ProofPending,InvalidProof} from './tempoProof.js';
import type {ServerConfig} from './config.js';
const f=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@picomart/order-protocol/fixtures/tempo/agent-order-v2.json')),'utf8'));
let config:ServerConfig;beforeAll(async()=>{const keys=await generateKeyPair('Ed25519',{extractable:true}),publicKey=(await exportJWK(keys.publicKey)).x!;
  config={tempoRpcUrl:'https://rpc.example.test',port:3402,syncOrigin:'https://sync.example.test',resourceOrigin:'https://x402.example.test',catalogOrigins:new Set(['https://cdn.picomart.zkbytes.com']),
    signingKid:'test',signingKeyPkcs8:await exportPKCS8(keys.privateKey),quotePublicKey:publicKey,quotePublicKeys:new Map([['test',publicKey]]),redisUrl:'memory://',corsOrigins:new Set(['https://app.example.test']),
    catalogMaxBytes:1000000,recoverySeconds:86400,retrySeconds:2,now:()=>1700000000};});
async function setup(proof:any=async()=>({orderId:'0x'+'02'.repeat(16),status:2})){const store=new InMemoryQuoteStore(config.now),q=f.resolution.quote;
  const app=await createApp({config,store,sync:{order:async()=>null,catalog:async()=>({seed:q.catalog.seed,catalogId:'0x'+'01'.repeat(16),catalogUrl:q.catalog.catalogUrl,
    seller:q.catalog.sellerEvmAddress,sellerPublicKey:q.catalog.sellerPublicKey,sellerIdentityId:q.catalog.sellerIdentityId})},
    fetchCatalog:async()=>[{ProductId:q.items[0].productId,PriceToken:AGENT_TOKEN,Price:q.items[0].unitAmount,Name:q.items[0].name}],verifyPayment:proof});return {app,store};}
const path='/api/v2/moderato/order-quotes',confirm='/api/v2/moderato/orders/'+f.request.orderSeed+'/confirm';
async function payment(app:any){const response=await request(app).post(path).send(f.request),r=response.body.paymentRequired;
  return {x402Version:2,resource:r.resource,accepted:r.accepts[0],payload:{transactionHash:'0x'+'aa'.repeat(32),buyer:f.order.buyerIdentity.context.account},extensions:{}};}
describe('Tempo quote API and private delivery boundary',()=>{
  it('returns signed PathUSD terms and only ciphertext; identical retries retain the original quote',async()=>{const {app}=await setup();
    const a=await request(app).post(path).send(f.request),b=await request(app).post(path).send(f.request);expect(a.status).toBe(402);expect(b.body).toEqual(a.body);expect(a.headers['cache-control']).toBe('no-store');
    const resolved=await request(app).post(path+'/resolve').send({orderSeed:f.request.orderSeed});expect(resolved.status).toBe(200);
    expect(resolved.body.quote.payment).toMatchObject({asset:AGENT_TOKEN,payTo:AGENT_CONTRACT,decimals:6,amount:'2500000'});
    expect(JSON.stringify(resolved.body)).not.toContain('deliveryKey');expect(JSON.stringify(resolved.body)).not.toContain('Test recipient');});
  it('rejects delivery keys/plaintext, duplicate products, zero seeds and conflicting retries',async()=>{const {app}=await setup();
    for(const body of [{...f.request,deliveryKey:f.deliveryKey},{...f.request,delivery:f.delivery},{...f.request,items:[...f.request.items,...f.request.items]},{...f.request,orderSeed:'A'.repeat(22)}])expect((await request(app).post(path).send(body)).status).toBe(400);
    await request(app).post(path).send(f.request);expect((await request(app).post(path).send({...f.request,physicalDelivery:false})).status).toBe(409);
    expect((await request(app).post('/api/v1/testnet/order-quotes').send(f.request)).status).toBe(404);});
  it('does not accept confirmation without a payment header or with mutated accepted terms',async()=>{const proof=vi.fn(),{app}=await setup(proof),p=await payment(app);
    expect((await request(app).post(confirm)).status).toBe(402);
    const changed=structuredClone(p);changed.accepted.amount='1';expect((await request(app).post(confirm).set('PAYMENT-SIGNATURE',encodeAgentPaymentSignature(changed))).status).toBe(402);expect(proof).not.toHaveBeenCalled();
    expect((await request(app).post(confirm).set('PAYMENT-SIGNATURE',encodeAgentPaymentSignature(p)).send({deliveryKey:f.deliveryKey})).status).toBe(400);});
  it('keeps missing evidence pending and rejects invalid payment evidence',async()=>{
    for(const [failure,status] of [[new ProofPending(),503],[new InvalidProof(),402]] as const){const {app}=await setup(async()=>{throw failure;}),p=await payment(app);
      const r=await request(app).post(confirm).set('PAYMENT-SIGNATURE',encodeAgentPaymentSignature(p));expect(r.status).toBe(status);if(status===503)expect(r.headers['retry-after']).toBe('2');}});
  it('repeated confirmation returns the same public receipt without another mutation',async()=>{const {app}=await setup(),p=await payment(app);
    const a=await request(app).post(confirm).set('PAYMENT-SIGNATURE',encodeAgentPaymentSignature(p)),b=await request(app).post(confirm).set('PAYMENT-SIGNATURE',encodeAgentPaymentSignature(p));
    expect(a.status).toBe(200);expect(a.body).toEqual(b.body);expect(a.headers['payment-response']).toBeTruthy();});
  it('expired quotes cannot be resolved; late confirmation remains within the recovery deadline',async()=>{let now=1700000000;const original=config;config={...config,now:()=>now};
    try{const {app}=await setup(),p=await payment(app);now+=601;expect((await request(app).post(path+'/resolve').send({orderSeed:f.request.orderSeed})).status).toBe(404);
      expect((await request(app).post(confirm).set('PAYMENT-SIGNATURE',encodeAgentPaymentSignature(p))).status).toBe(200);now+=86400;expect((await request(app).post(confirm).set('PAYMENT-SIGNATURE',encodeAgentPaymentSignature(p))).status).toBe(404);
    }finally{config=original;}});
  it('readiness fails when storage is unavailable',async()=>{const {app,store}=await setup();expect((await request(app).get('/healthz')).status).toBe(200);store.ping=async()=>{throw new Error();};expect((await request(app).get('/healthz')).status).toBe(503);});
  it('concurrent identical quote requests retain one immutable quote',async()=>{const {app}=await setup();const [a,b]=await Promise.all([request(app).post(path).send(f.request),request(app).post(path).send(f.request)]);expect(a.status).toBe(402);expect(b.status).toBe(402);expect(a.body).toEqual(b.body);});
});
