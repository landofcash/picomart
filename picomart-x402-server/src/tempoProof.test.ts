import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {Interface,hexlify,toUtf8Bytes} from 'ethers';
import {PICOMART_TEMPO_ABI} from '@picomart/order-protocol/tempo-contract';
import {AGENT_CONTRACT,AGENT_TOKEN,AgentQuoteSchema,AgentPaymentPayloadSchema} from './agentProtocol.js';
import {tempoSeedToId} from '@picomart/order-protocol/tempo-protocol';
import {verifyTempoPayment,ProofPending} from './tempoProof.js';
const f=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@picomart/order-protocol/fixtures/tempo/agent-order-v2.json')),'utf8'));
const runtime=fs.readFileSync(new URL('../../picomart-storefront-builder/tests/fixtures/tempo-runtime.hex',import.meta.url),'utf8').trim(),abi=new Interface(PICOMART_TEMPO_ABI),q=AgentQuoteSchema.parse(f.resolution.quote);
const orderId=tempoSeedToId(q.orderSeed),catalogId=tempoSeedToId(q.catalog.seed),buyer=f.order.buyerIdentity.context.account,seller=q.catalog.sellerEvmAddress;
const hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32),blockNumber='0x23f2c6a',deadline=1700000001+432000;
const buyerPublicKey='0x'+Buffer.from(f.order.buyerIdentity.publicKey,'base64').toString('hex');
const payload=AgentPaymentPayloadSchema.parse({x402Version:2,resource:f.resolution.paymentRequired.resource,accepted:f.resolution.paymentRequired.accepts[0],payload:{transactionHash:hash,buyer},extensions:{}});
function fixture(){
  const state={version:1,catalogId,status:2,priceAmount:q.payment.amount,priceToken:AGENT_TOKEN,seller,buyer,payer:buyer,buyerPublicKey,sellerPublicKey:q.catalog.sellerPublicKey,
    buyerIdentityId:f.order.buyerIdentity.identityId,sellerIdentityId:q.catalog.sellerIdentityId,buyerCommitment:f.commitment,sellerCommitment:'0x'+'00'.repeat(32),createdTs:1700000001,updatedTs:1700000001,deadline};
  const created=[orderId,buyer,seller,catalogId,AGENT_TOKEN,q.payment.amount,buyerPublicKey,q.catalog.sellerPublicKey,state.buyerIdentityId,state.sellerIdentityId,deadline];
  const paid=[orderId,buyer,deadline],message=[orderId,1,buyer,1,f.commitment,hexlify(toUtf8Bytes(f.buyerEnvelope)),hexlify(toUtf8Bytes(f.sellerEnvelope))];
  return {state,created,paid,message,status:'0x1',chain:'0xa5bf',code:runtime,timestamp:1700000001,emitter:AGENT_CONTRACT,empty:false,missing:false,canonical:true};
}
function transport(v:ReturnType<typeof fixture>):typeof fetch{return (async(_url,init)=>{const r=JSON.parse(String(init?.body));let result:any;
  if(r.method==='eth_chainId')result=v.chain;
  if(r.method==='eth_getTransactionReceipt')result=v.missing?null:{transactionHash:hash,blockHash,blockNumber,status:v.status,logs:v.empty?[]:['OrderCreated','OrderMessage','OrderPaid'].map((name,i)=>{
    const values=name==='OrderCreated'?v.created:name==='OrderPaid'?v.paid:v.message;return {...abi.encodeEventLog(abi.getEvent(name)!,values),address:v.emitter,transactionHash:hash,blockHash,blockNumber,logIndex:'0x'+i.toString(16)};})};
  if(r.method==='eth_getBlockByNumber')result={hash:v.canonical?blockHash:'0x'+'ef'.repeat(32),timestamp:'0x'+v.timestamp.toString(16)};
  if(r.method==='eth_getCode')result=v.code;
  if(r.method==='eth_call')result=abi.encodeFunctionResult('getOrder',[v.state]);
  return Response.json({jsonrpc:'2.0',id:r.id,result});}) as typeof fetch;}
describe('independent Tempo escrow proof',()=>{
  it('accepts only the exact creation/message/payment receipt and order state',async()=>{expect(await verifyTempoPayment(q,payload,'https://rpc.example.test',transport(fixture()))).toMatchObject({orderId,buyer,payer:buyer,priceToken:AGENT_TOKEN,status:2});});
  it('distinguishes missing or noncanonical receipts from rejected evidence',async()=>{for(const change of [{missing:true},{canonical:false}])await expect(verifyTempoPayment(q,payload,'https://rpc.example.test',transport({...fixture(),...change}))).rejects.toBeInstanceOf(ProofPending);});
  for(const [name,modify] of [
    ['wrong chain',(v:any)=>v.chain='0x1'],['wrong runtime',(v:any)=>v.code='0x00'],['revert',(v:any)=>v.status='0x0'],['ordinary transfer',(v:any)=>v.empty=true],['wrong contract',(v:any)=>v.emitter='0x'+'99'.repeat(20)],
    ['wrong amount',(v:any)=>v.created[5]='1'],['wrong token',(v:any)=>v.created[4]='0x20c0000000000000000000000000000000000001'],['wrong payer',(v:any)=>v.paid[1]=seller],['wrong catalog',(v:any)=>v.created[3]=orderId],
    ['wrong seller',(v:any)=>v.created[2]=buyer],['other order replay',(v:any)=>v.created[0]=catalogId],['tampered message',(v:any)=>v.message[4]='0x'+'99'.repeat(32)],['state mismatch',(v:any)=>v.state.priceAmount='1'],
    ['expired payment',(v:any)=>v.timestamp=1700000601],['payment before quote',(v:any)=>v.timestamp=1699999999],
  ] as const)it('rejects '+name,async()=>{const v=fixture();modify(v);await expect(verifyTempoPayment(q,payload,'https://rpc.example.test',transport(v))).rejects.toThrow();});
});
