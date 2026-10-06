import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {Interface,keccak256,toUtf8String} from 'ethers';
import {PICOMART_TEMPO_ABI,PICOMART_TEMPO_BUILD} from '@picomart/order-protocol/tempo-contract';
import {AGENT_CONTRACT,AGENT_TOKEN,type AgentQuote,type AgentPaymentPayload} from './agentProtocol.js';
import {tempoSeedToId,createTempoReceivingContext,createTempoReceivingIdentity,TempoOrderContextSchema,createTempoMessageBinding,tempoReferenceCommitment} from '@picomart/order-protocol/tempo-protocol';
import {boundedJson} from './tempoClients.js';
export class ProofPending extends Error{}
export class InvalidProof extends Error{}
const abi=new Interface(PICOMART_TEMPO_ABI);
export async function verifyTempoPayment(quote:AgentQuote,payload:AgentPaymentPayload,rpcUrl:string,fetcher:typeof fetch=fetch){
  let id=0;
  async function rpc(method:string,params:unknown[]){
    try{const requestId=++id,response=await fetcher(rpcUrl,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
      if(!response.ok)throw new Error();const b=JSON.parse((await boundedJson(response,512000)).toString());if(b.error||b.id!==requestId||!('result'in b))throw new Error();return b.result;
    }catch{throw new ProofPending('rpc_unavailable');}
  }
  if(BigInt(await rpc('eth_chainId',[]))!==BigInt(PICOMART_TEMPO_CONFIG.chainId))throw new InvalidProof('wrong_chain');
  const receipt=await rpc('eth_getTransactionReceipt',[payload.payload.transactionHash]);if(!receipt)throw new ProofPending('receipt_pending');
  if(receipt.status!=='0x1'||receipt.transactionHash!==payload.payload.transactionHash)throw new InvalidProof('failed_receipt');
  if(BigInt(receipt.blockNumber)<37694566n)throw new InvalidProof('receipt_before_deployment');
  const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
  if(!block||block.hash!==receipt.blockHash)throw new ProofPending('noncanonical_receipt');
  const timestamp=Number(BigInt(block.timestamp));if(timestamp<quote.issuedAt||timestamp>quote.expiresAt)throw new InvalidProof('payment_outside_quote_window');
  if(keccak256(await rpc('eth_getCode',[AGENT_CONTRACT,receipt.blockNumber]))!==PICOMART_TEMPO_BUILD.runtimeBytecodeHash)throw new InvalidProof('wrong_runtime');
  const events=receipt.logs.filter((l:any)=>l.address?.toLowerCase()===AGENT_CONTRACT).map((l:any)=>{
    if(l.transactionHash!==receipt.transactionHash||l.blockHash!==receipt.blockHash||l.blockNumber!==receipt.blockNumber||l.removed)throw new InvalidProof('invalid_log');
    return abi.parseLog(l);
  }).filter(Boolean);
  const orderId=tempoSeedToId(quote.orderSeed),find=(name:string)=>events.filter((e:any)=>e.name===name&&e.args.orderId===orderId);
  if(find('OrderCreated').length!==1||find('OrderPaid').length!==1||find('OrderMessage').length!==1)throw new InvalidProof('missing_order_events');
  const created=find('OrderCreated')[0]!.args,paid=find('OrderPaid')[0]!.args,message=find('OrderMessage')[0]!.args;
  const buyer=payload.payload.buyer;
  if(created.buyer.toLowerCase()!==buyer||paid.payer.toLowerCase()!==buyer||created.seller.toLowerCase()!==quote.catalog.sellerEvmAddress||
    created.catalogId!==tempoSeedToId(quote.catalog.seed)||String(created.amount)!==quote.payment.amount||created.token.toLowerCase()!==quote.payment.asset||
    created.sellerPublicKey!==quote.catalog.sellerPublicKey||created.sellerIdentityId!==quote.catalog.sellerIdentityId||
    Number(message.messageType)!==1||Number(message.sequence)!==1||message.author.toLowerCase()!==buyer)throw new InvalidProof('event_terms_mismatch');
  const receiving=(role:'buyer'|'seller',account:string,seed:string,key:string)=>createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:AGENT_CONTRACT,
    account,...(role==='buyer'?{role,orderSeed:seed}:{role,catalogSeed:seed})}),Buffer.from(key.slice(2),'hex').toString('base64'));
  const context=TempoOrderContextSchema.parse({version:1,chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:AGENT_CONTRACT,orderSeed:quote.orderSeed,catalogSeed:quote.catalog.seed,
    buyerIdentity:receiving('buyer',buyer,quote.orderSeed,created.buyerPublicKey),sellerIdentity:receiving('seller',quote.catalog.sellerEvmAddress,quote.catalog.seed,created.sellerPublicKey)});
  if(context.buyerIdentity.identityId!==created.buyerIdentityId)throw new InvalidProof('buyer_identity_mismatch');
  const expected={messageType:'buyer-order' as const,sequence:1},binding=createTempoMessageBinding(context,expected);
  if(tempoReferenceCommitment(binding,toUtf8String(message.buyerEnvelope),toUtf8String(message.sellerEnvelope),context,expected)!==message.commitment)throw new InvalidProof('message_commitment_mismatch');
  const state=abi.decodeFunctionResult('getOrder',await rpc('eth_call',[{to:AGENT_CONTRACT,data:abi.encodeFunctionData('getOrder',[orderId])},receipt.blockNumber]))[0];
  if(state.buyer.toLowerCase()!==buyer||state.payer.toLowerCase()!==buyer||state.seller.toLowerCase()!==quote.catalog.sellerEvmAddress||String(state.priceAmount)!==quote.payment.amount||
    state.priceToken.toLowerCase()!==quote.payment.asset||state.catalogId!==tempoSeedToId(quote.catalog.seed)||state.buyerCommitment!==message.commitment||
    state.sellerPublicKey!==created.sellerPublicKey||state.buyerPublicKey!==created.buyerPublicKey||state.sellerIdentityId!==created.sellerIdentityId||state.buyerIdentityId!==created.buyerIdentityId)throw new InvalidProof('order_state_mismatch');
  const finalBlock=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);if(finalBlock?.hash!==receipt.blockHash)throw new ProofPending('receipt_changed_during_verification');
  return {orderId,catalogId:created.catalogId,buyer,seller:quote.catalog.sellerEvmAddress,payer:buyer,priceAmount:quote.payment.amount,priceToken:quote.payment.asset,status:Number(state.status)};
}
