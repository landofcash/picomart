import {isPaymentCurrency, getCurrency} from '@picomart/config';
import {Contract, Interface, JsonRpcProvider, Transaction, ZeroAddress, keccak256, type TransactionRequest} from "ethers";
import {get,set} from "idb-keyval";
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';

import {PICOMART_TEMPO_ABI,PICOMART_TEMPO_BUILD} from "@picomart/order-protocol/tempo-contract";

export interface TempoDeployment {address:string;block:number;}
export interface TempoWalletSession {walletId:string;address:string;revision:number;}
/** The provider retains private keys; the transaction service only requests a signature. */
export interface TempoTransactionWallet {
  capture():Promise<TempoWalletSession>;
  assert(session:TempoWalletSession):Promise<void>;
  sign(session:TempoWalletSession,transaction:TransactionRequest):Promise<string>;
}
export interface TempoTransactionRecord {
  hash:string;account:string;method:string;nonce:number;
  state:"uncertain"|"confirmed"|"reverted"|"not-submitted";
  block?:number;fee?:string;maximumFeeBaseUnits?:string;gasLimit?:string;
  operationId?:string;deploymentAddress?:string;to?:string;dataHash?:string;chainId?:number;
}
export interface TempoTransactionOptions {
  /** Stable across retries of one user operation; use a new ID for a new operation. */
  operationId:string;
  /** Account shown to the user when this action was reviewed. */
  expectedAccount:string;
  signal?:AbortSignal;
  onSaved?:(transaction:TempoTransactionRecord)=>void;
  /** Revalidate storage references/trusted business terms immediately before signing. */
  beforeSign?:()=>Promise<void>;
}
export interface TempoContractCall {method:string;args:readonly unknown[];}
export interface TempoPaymentRequirements {token:string;spender:string;amount:string;allowance:string;approvalRequired:boolean;}
export interface TempoTransactionServiceOptions {
  wallet:TempoTransactionWallet;
  deployment?:()=>TempoDeployment|null;
  rpc?:JsonRpcProvider;
}
export const tempoContractInterface=new Interface(PICOMART_TEMPO_ABI);
export const tempoTokenInterface=new Interface([
  "function approve(address spender,uint256 amount) returns(bool)",
  "function transfer(address to,uint256 amount) returns(bool)",
  "function balanceOf(address account) view returns(uint256)",
  "function allowance(address account,address spender) view returns(uint256)",
]);
const TOKEN=PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId;
const chain=PICOMART_TEMPO_CONFIG.chainId;
// Keep the original test-runner key so unresolved old transactions continue blocking writes.
const pendingKey=(account:string)=>`picomart_tempo_contract_test_tx_${chain}_${account.toLowerCase()}`;
const operationKey=(account:string,deployment:string,id:string)=>`picomart_tempo_transaction_v1_${account.toLowerCase()}_${deployment.toLowerCase()}_${id}`;
const paymentKey=(account:string,deployment:string,id:string)=>`${operationKey(account,deployment,id)}_payment`;
let pageRevision=0;
if(typeof window!=="undefined")window.addEventListener("pagehide",()=>{pageRevision++;});
function address(value:string){if(!/^0x[0-9a-fA-F]{40}$/.test(value)||value.toLowerCase()===ZeroAddress)throw new Error("Invalid Tempo address.");return value.toLowerCase();}
function operationId(id:string,max=100){if(typeof id!=="string"||id.length>max||!/^[A-Za-z0-9:_-]+$/.test(id))throw new Error("Use a stable operation ID of at most 100 letters, digits, colons, underscores or hyphens.");return id;}
function record(input:unknown,account:string):TempoTransactionRecord {
  if(!input||typeof input!=="object")throw new Error("Invalid saved transaction record.");
  const r=input as TempoTransactionRecord;
  if(!/^0x[0-9a-fA-F]{64}$/.test(r.hash)||address(r.account)!==address(account)||!Number.isSafeInteger(r.nonce)||r.nonce<0||!['uncertain','confirmed','reverted','not-submitted'].includes(r.state)||typeof r.method!=="string")throw new Error("Invalid saved transaction record.");
  if(r.chainId!==undefined&&r.chainId!==chain)throw new Error("Saved transaction belongs to another chain.");
  return {...r};
}
export function tempoTransactionError(error:unknown):string {
  const e=error as {code?:string;data?:string;message?:string};
  if(e.code==='CALL_EXCEPTION'){try{const decoded=tempoContractInterface.parseError(e.data??'0x');if(decoded)return `Contract reverted: ${decoded.name}`;}catch{/* unknown revert */}return "Contract reverted. Check role, state, deadline, allowance and token policy.";}
  if(e.code)return "RPC action failed. Check the saved transaction receipt before retrying.";
  return e.message?.slice(0,300)??"Tempo action failed.";
}
export function createTempoTransactionService(options:TempoTransactionServiceOptions) {
  const rpc=options.rpc??new JsonRpcProvider(PICOMART_TEMPO_CONFIG.rpcUrl);
  const deployment=options.deployment??(()=>PICOMART_TEMPO_CONFIG.deployment as TempoDeployment|null);
  const token=new Contract(TOKEN,tempoTokenInterface,rpc);
  function selectedDeployment(){const d=deployment();if(!d)throw new Error("Tempo commerce deployment is not enabled. Use the isolated contract test runner.");if(!Number.isSafeInteger(d.block)||d.block<0)throw new Error("Invalid deployment start block.");return {address:address(d.address),block:d.block};}
  async function checkChain(){if(Number((await rpc.getNetwork()).chainId)!==chain)throw new Error(`RPC must match configured chain ${chain}.`);}
  async function checkDeployment(d:TempoDeployment){await checkChain();if(keccak256(await rpc.getCode(d.address))!==PICOMART_TEMPO_BUILD.runtimeBytecodeHash)throw new Error("Deployment runtime does not match the prepared Tempo contract.");}
  async function pending(account:string){const stored=await get(pendingKey(address(account)));return stored?record(stored,account):null;}
  async function save(r:TempoTransactionRecord,latest=true){
    // Store only public transaction metadata; no raw signed bytes, keys or private message payloads.
    if(r.operationId&&r.deploymentAddress)await set(operationKey(r.account,r.deploymentAddress,r.operationId),r);
    if(latest)await set(pendingKey(r.account),r);
  }
  async function update(r:TempoTransactionRecord){
    await save(r,false);const latest=await pending(r.account);
    if(latest?.hash===r.hash)await set(pendingKey(r.account),r);
  }
  async function refresh(r:TempoTransactionRecord){
    await checkChain();if(r.state==='not-submitted')return r;
    const receipt=await rpc.getTransactionReceipt(r.hash);
    if(!receipt){if(r.state==='confirmed'||r.state==='reverted'){r.state='uncertain';await update(r);}return r;}
    if(receipt.status!==0&&receipt.status!==1)throw new Error("Receipt has no definitive execution status.");
    if(r.to&&receipt.to&&address(receipt.to)!==address(r.to))throw new Error("Receipt destination differs from saved intent.");
    if(receipt.from&&address(receipt.from)!==address(r.account))throw new Error("Receipt sender differs from saved wallet.");
    r.state=receipt.status===1?'confirmed':'reverted';r.block=receipt.blockNumber;r.fee=receipt.fee.toString();await update(r);return r;
  }
  async function operation(session:TempoWalletSession,d:TempoDeployment,id:string){const stored=await get(operationKey(session.address,d.address,id));return stored?record(stored,session.address):null;}
  function notify(callback:TempoTransactionOptions['onSaved'],r:TempoTransactionRecord){try{callback?.({...r});}catch{/* A UI observer cannot change transaction execution. */}}
  async function locked<T>(opts:TempoTransactionOptions,work:(session:TempoWalletSession,d:TempoDeployment,checkpoint:()=>Promise<void>)=>Promise<T>):Promise<T>{
    operationId(opts.operationId);opts.signal?.throwIfAborted();
    if(typeof navigator==='undefined'||!navigator.locks)throw new Error("Web Locks are required for safe Tempo transactions.");
    const d=selectedDeployment(),session=await options.wallet.capture(),page=pageRevision;
    session.address=address(session.address);
    if(session.address!==address(opts.expectedAccount))throw new Error("Selected wallet differs from the reviewed account.");
    const checkpoint=async()=>{opts.signal?.throwIfAborted();if(page!==pageRevision||address(selectedDeployment().address)!==d.address||selectedDeployment().block!==d.block)throw new Error("Page or deployment changed during this action.");await options.wallet.assert(session);opts.signal?.throwIfAborted();if(page!==pageRevision)throw new Error("Page changed during this action.");};
    return navigator.locks.request(`picomart_tempo_transaction_${chain}_${session.address}`,async()=>{await checkpoint();await checkDeployment(d);await checkpoint();return work(session,d,checkpoint);});
  }
  function encode(target:'contract'|'token',call:TempoContractCall){const abi=target==='contract'?tempoContractInterface:tempoTokenInterface,f=abi.getFunction(call.method);if(!f||f.constant||f.stateMutability==='payable')throw new Error("Select a supported nonpayable write method.");return {abi,fragment:f,data:abi.encodeFunctionData(f,call.args)};}
  async function requirements(session:TempoWalletSession,d:TempoDeployment,call:TempoContractCall):Promise<TempoPaymentRequirements>{
    const {abi,data}=encode('contract',call),decoded=abi.decodeFunctionData(call.method,data);
    let paymentToken:string,amount:bigint;
    if(call.method==='createOrderPaid'){paymentToken=decoded[0].priceToken;amount=BigInt(decoded[0].priceAmount);}
    else if(call.method==='buyOrder'){const c=new Contract(d.address,tempoContractInterface,rpc);const order=await c.getOrder(decoded[0]);if(Number(order.version)!==1)throw new Error("Order does not exist.");paymentToken=order.priceToken;amount=BigInt(order.priceAmount);}
    else throw new Error("Payment helpers support createOrderPaid and buyOrder only.");
    if(!isPaymentCurrency(paymentToken)||amount<=0n)throw new Error("Only positive supported-currency payments are enabled.");
    const allowance:bigint=await new Contract(paymentToken,tempoTokenInterface,rpc).allowance(session.address,d.address);
    return {token:address(paymentToken),spender:d.address,amount:amount.toString(),allowance:allowance.toString(),approvalRequired:allowance<amount};
  }
  async function bindPayment(session:TempoWalletSession,d:TempoDeployment,call:TempoContractCall,id:string){
    const {data}=encode('contract',call),digest=keccak256(data),key=paymentKey(session.address,d.address,id),stored=await get<{dataHash:string}>(key);
    if(stored&&stored.dataHash!==digest)throw new Error("Payment operation ID already belongs to different order terms.");
    if(!stored)await set(key,{dataHash:digest});
  }
  async function sendLocked(target:'contract'|'token',call:TempoContractCall,opts:TempoTransactionOptions,session:TempoWalletSession,d:TempoDeployment,checkpoint:()=>Promise<void>,writeToken:string=TOKEN){
    if(target==="contract"&&["createOrderInitial","createOrderPaid","startDelivering","refuseOrder"].includes(call.method)&&!opts.beforeSign)throw new Error("Provide encrypted message/reference validation before signing this method.");
    const {abi,fragment,data}=encode(target,call),to=target==='contract'?d.address:address(writeToken),digest=keccak256(data);
    if(target==="contract"&&["createOrderPaid","buyOrder"].includes(call.method)){const bound=await get<{dataHash:string}>(paymentKey(session.address,d.address,opts.operationId));if(bound?.dataHash!==digest)throw new Error("Payment terms changed after review.");await checkpoint();}
    const existing=await operation(session,d,opts.operationId);await checkpoint();
    if(existing){if(existing.to!==to||existing.dataHash!==digest||existing.deploymentAddress!==d.address)throw new Error("Operation ID already belongs to different transaction terms.");if(existing.state!=='not-submitted'){const recovered=await refresh(existing);await checkpoint();notify(opts.onSaved,recovered);return recovered;}}
    const latest=await pending(session.address);await checkpoint();
    if(latest&&latest.state!=='not-submitted'){const recovered=await refresh(latest);await checkpoint();if(recovered.state==='uncertain')throw new Error("A transaction outcome is unresolved. Check its saved receipt; do not submit another transaction from this wallet.");}
    const preference:string=await new Contract('0xfeec000000000000000000000000000000000000',['function userTokens(address) view returns(address)'],rpc).userTokens(session.address);await checkpoint();
    if(preference!==ZeroAddress&&address(preference)!==address(PICOMART_TEMPO_CONFIG.feeToken.tokenId))throw new Error(`The wallet's fee preference must be ${PICOMART_TEMPO_CONFIG.feeToken.symbol} or the default fallback.`);
    const decoded=abi.decodeFunctionData(fragment,data);
    let spend=0n,spendToken=writeToken;
    if(target==='contract'&&(call.method==='createOrderPaid'||call.method==='buyOrder')){const payment=await requirements(session,d,call);await checkpoint();if(payment.approvalRequired)throw new Error("Approve the exact payment in a separate transaction first.");spend=BigInt(payment.amount);spendToken=payment.token;}
    else if(target==='token'&&call.method==='transfer')spend=BigInt(decoded[1]);
    const estimate=await rpc.estimateGas({from:session.address,to,data,value:0});await checkpoint();
    if(estimate<=0n||estimate>30_000_000n)throw new Error("Gas estimate exceeds the supported transaction limit.");
    const buffered=(estimate*120n+99n)/100n,gasLimit=buffered>30_000_000n?30_000_000n:buffered;
    const fees=await rpc.getFeeData();await checkpoint();
    if(!fees.maxFeePerGas||fees.maxPriorityFeePerGas==null||fees.maxPriorityFeePerGas<0n||fees.maxPriorityFeePerGas>fees.maxFeePerGas)throw new Error("RPC returned invalid EIP-1559 fee parameters.");
    const maximumFee=(gasLimit*fees.maxFeePerGas+999_999_999_999n)/1_000_000_000_000n;
    const balance:bigint=await new Contract(PICOMART_TEMPO_CONFIG.feeToken.tokenId,tempoTokenInterface,rpc).balanceOf(session.address);await checkpoint();
    if(spend>0n&&spendToken!==PICOMART_TEMPO_CONFIG.feeToken.tokenId&&BigInt(await new Contract(spendToken,tempoTokenInterface,rpc).balanceOf(session.address))<spend)throw new Error(`Insufficient ${getCurrency(spendToken).symbol} for payment.`);
    if(balance<maximumFee+(spendToken===PICOMART_TEMPO_CONFIG.feeToken.tokenId?spend:0n))throw new Error(`Insufficient ${PICOMART_TEMPO_CONFIG.feeToken.symbol} for payment and the maximum fee.`);
    await opts.beforeSign?.();await checkpoint();
    if(abi.encodeFunctionData(fragment,call.args)!==data)throw new Error("Transaction arguments changed after review.");
    const nonce=await rpc.getTransactionCount(session.address,'pending');await checkpoint();
    const unsigned:TransactionRequest={to,data,value:0,chainId:chain,nonce,gasLimit,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,type:2};
    const signed=await options.wallet.sign(session,unsigned);await checkpoint();
    const checked=Transaction.from(signed);
    if(checked.from?.toLowerCase()!==session.address||checked.to?.toLowerCase()!==to||checked.chainId!==BigInt(PICOMART_TEMPO_CONFIG.chainId)||checked.nonce!==nonce||checked.data!==data||checked.value!==0n||checked.gasLimit!==gasLimit||checked.maxFeePerGas!==fees.maxFeePerGas||checked.maxPriorityFeePerGas!==fees.maxPriorityFeePerGas||checked.type!==2)throw new Error("Signed transaction differs from the reviewed request.");
    const saved:TempoTransactionRecord={hash:keccak256(signed),account:session.address,method:call.method,nonce,state:'uncertain',gasLimit:gasLimit.toString(),maximumFeeBaseUnits:maximumFee.toString(),operationId:opts.operationId,deploymentAddress:d.address,to,dataHash:digest,chainId:PICOMART_TEMPO_CONFIG.chainId};
    try{await save(saved);}catch(error){saved.state="not-submitted";try{await save(saved);}catch{/* Nothing was broadcast; retain available intent evidence. */}throw error;}
    try{await checkpoint();}catch(error){saved.state='not-submitted';await save(saved);notify(opts.onSaved,saved);throw error;}
    notify(opts.onSaved,saved);
    try{const submitted=await rpc.broadcastTransaction(signed);if(submitted.hash.toLowerCase()!==saved.hash)throw new Error("Broadcast hash mismatch");await rpc.waitForTransaction(saved.hash,1,45_000);return await refresh(saved);}
    catch{try{const recovered=await refresh(saved);if(recovered.state!=='uncertain')return recovered;}catch{/* retain original uncertain intent */}return saved;}
  }
  return {
    pending,
    async recover(account:string){
      if(typeof navigator==="undefined"||!navigator.locks)throw new Error("Web Locks are required for safe receipt recovery.");
      return navigator.locks.request(`picomart_tempo_transaction_${chain}_${address(account)}`,async()=>{const saved=await pending(account);return saved?refresh(saved):null;});
    },
    async recoverOperation(account:string,id:string){const d=selectedDeployment();await checkDeployment(d);if(typeof navigator==="undefined"||!navigator.locks)throw new Error("Web Locks are required for safe receipt recovery.");return navigator.locks.request(`picomart_tempo_transaction_${chain}_${address(account)}`,async()=>{const stored=await get(operationKey(address(account),d.address,operationId(id,128)));return stored?refresh(record(stored,account)):null;});},
    async paymentRequirements(call:TempoContractCall){const d=selectedDeployment(),session=await options.wallet.capture();await options.wallet.assert(session);await checkDeployment(d);const result=await requirements(session,d,call);await options.wallet.assert(session);return result;},
    async sendContract(call:TempoContractCall,opts:TempoTransactionOptions){return locked(opts,async(session,d,checkpoint)=>{if(call.method==='createOrderPaid'||call.method==='buyOrder')await bindPayment(session,d,call,opts.operationId);await checkpoint();return sendLocked('contract',call,opts,session,d,checkpoint);});},
    async approvePayment(call:TempoContractCall,opts:TempoTransactionOptions){return locked(opts,async(session,d,checkpoint)=>{await bindPayment(session,d,call,opts.operationId);await checkpoint();const payment=await requirements(session,d,call);await checkpoint();return sendLocked('token',{method:'approve',args:[d.address,payment.amount]},{...opts,operationId:`${opts.operationId}:approval`},session,d,checkpoint,payment.token);});},
    async payOrder(call:TempoContractCall,opts:TempoTransactionOptions){if(!['createOrderPaid','buyOrder'].includes(call.method))throw new Error("Select createOrderPaid or buyOrder for payment.");return locked(opts,async(session,d,checkpoint)=>{await bindPayment(session,d,call,opts.operationId);await checkpoint();return sendLocked('contract',call,opts,session,d,checkpoint);});},
    async approve(amount:bigint,opts:TempoTransactionOptions){if(amount<0n)throw new Error("Approval amount cannot be negative.");return locked(opts,(session,d,checkpoint)=>sendLocked('token',{method:'approve',args:[d.address,amount]},opts,session,d,checkpoint));},
    async transfer(to:string,amount:bigint,opts:TempoTransactionOptions){address(to);if(amount<=0n)throw new Error("Transfer amount must be positive.");return locked(opts,(session,d,checkpoint)=>sendLocked('token',{method:'transfer',args:[to,amount]},opts,session,d,checkpoint));},
    async allowance(account:string){const d=selectedDeployment();await checkDeployment(d);return String(await token.allowance(address(account),d.address));},
    async balances(account:string){await checkChain();const walletAddress=address(account);return Promise.all(PICOMART_TEMPO_CONFIG.tokens.map(async asset=>{const t=new Contract(asset.tokenId,['function balanceOf(address) view returns(uint256)'],rpc);return {token:asset.tokenId,symbol:asset.symbol,decimals:asset.decimals,baseUnits:String(await t.balanceOf(walletAddress))};}));},
  };
}
export type TempoWalletTransactions=ReturnType<typeof createTempoTransactionService>;
