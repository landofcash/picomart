import {beforeEach,describe,expect,it,vi} from "vitest";
import {FeeData,JsonRpcProvider,Network,Transaction,Wallet,keccak256,ZeroAddress} from "ethers";
const state=vi.hoisted(()=>({db:new Map<string,unknown>(),balance:1_000_000n,tokenBalances:new Map<string,bigint>(),metadataValid:true,allowance:0n,feePreference:"0x0000000000000000000000000000000000000000",chain:42431,code:"0x6000",nonce:7,revision:0,locked:false,receipts:new Map<string,{status:number;blockNumber:number;fee:bigint;from:string;to:string|null}>(),broadcast:"confirmed" as "confirmed"|"uncertain"|"reverted",orderVersion:1,orderToken:'0x20c0000000000000000000000000000000000000',extraCheckout:false}));
vi.mock('@picomart/config',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@picomart/config')>();
 return {...actual,isPaymentCurrency:(token:unknown)=>actual.isPaymentCurrency(token)||(state.extraCheckout&&token==='0x20c0000000000000000000000000000000000001')};
});
vi.mock("idb-keyval",()=>({get:async(k:string)=>structuredClone(state.db.get(k)),set:async(k:string,v:unknown)=>{state.db.set(k,structuredClone(v));}}));
vi.mock("@picomart/order-protocol/tempo-contract",async(importOriginal)=>{const actual=await importOriginal<typeof import("@picomart/order-protocol/tempo-contract")>();const {keccak256:hash}=await import("ethers");return {...actual,PICOMART_TEMPO_BUILD:{...actual.PICOMART_TEMPO_BUILD,runtimeBytecodeHash:hash("0x6000")}};});
vi.mock("ethers",async(importOriginal)=>{const actual=await importOriginal<typeof import("ethers")>();return {...actual,Contract:class {
  target:string;
  constructor(target:string){this.target=target.toLowerCase();}
  async symbol(){return state.metadataValid ? ({'0x20c0000000000000000000000000000000000000':'PathUSD','0x20c0000000000000000000000000000000000001':'AlphaUSD','0x20c0000000000000000000000000000000000002':'BetaUSD','0x20c0000000000000000000006a37da5c996874be':'OUSD'} as Record<string,string>)[this.target] : 'Wrong';}
  async decimals(){return 6;}
  async currency(){return 'USD';}
  async userTokens(){return state.feePreference;}async balanceOf(){return state.tokenBalances.get(this.target)??state.balance;}async allowance(){return state.allowance;}async getOrder(){return {version:state.orderVersion,priceAmount:10000n,priceToken:state.orderToken};}}};});
import {createTempoTransactionService,tempoTokenInterface,type TempoTransactionWallet, type TempoTransactionOptions, type TempoWalletSession} from "./tempoTransactions";
const privateKey="11".repeat(32),signer=new Wallet(`0x${privateKey}`),account=signer.address;
const deployment={address:"0x3c91183f0454eab6eff6f570ac402be278dbd6f4",block:37694566};
const rpc=new JsonRpcProvider("https://readonly.test");
let selected:typeof deployment|null=deployment;
const gateway:TempoTransactionWallet={
  capture:async()=>{if(state.locked)throw new Error("Unlock wallet");return {walletId:"test",address:account,revision:state.revision};},
  assert:async(s:TempoWalletSession)=>{if(state.locked||s.revision!==state.revision)throw new Error("Wallet changed or locked");},
  sign:async(_s,request)=>signer.signTransaction(request),
};
const service=()=>createTempoTransactionService({wallet:gateway,rpc,deployment:()=>selected});
const opts=(id="test-operation"):TempoTransactionOptions=>({operationId:id,expectedAccount:account,signal:new AbortController().signal});
let s=service();
beforeEach(()=>{
 vi.restoreAllMocks();state.db.clear();state.receipts.clear();state.tokenBalances.clear();state.metadataValid=true;state.balance=1_000_000n;state.allowance=0n;state.feePreference=ZeroAddress;state.chain=42431;state.code="0x6000";state.nonce=7;state.revision=0;state.locked=false;state.broadcast="confirmed";state.orderVersion=1;state.orderToken='0x20c0000000000000000000000000000000000000';state.extraCheckout=false;selected=deployment;s=service();
 const queues=new Map<string,Promise<unknown>>();vi.stubGlobal("navigator",{locks:{request:<T>(name:string,work:()=>Promise<T>)=>{const next=(queues.get(name)??Promise.resolve()).catch(()=>{}).then(work);queues.set(name,next);return next;}}});
 vi.spyOn(rpc,"getNetwork").mockImplementation(async()=>Network.from(state.chain));vi.spyOn(rpc,"getCode").mockImplementation(async()=>state.code);
 vi.spyOn(rpc,"estimateGas").mockResolvedValue(100000n);vi.spyOn(rpc,"getFeeData").mockResolvedValue(new FeeData(null,1_000_000_000n,0n));
 vi.spyOn(rpc,"getTransactionCount").mockImplementation(async()=>state.nonce);
 vi.spyOn(rpc,"getTransactionReceipt").mockImplementation(async hash=>state.receipts.get(hash) as Awaited<ReturnType<typeof rpc.getTransactionReceipt>>??null);
 vi.spyOn(rpc,"waitForTransaction").mockResolvedValue(null);
 vi.spyOn(rpc,"broadcastTransaction").mockImplementation(async raw=>{
  const signed=raw as string,tx=Transaction.from(signed),hash=keccak256(signed);expect(await s.pending(account)).toMatchObject({hash,state:"uncertain",nonce:tx.nonce});state.nonce++;
  if(state.broadcast==="uncertain")throw new Error("Response lost after submission");
  state.receipts.set(hash,{status:state.broadcast==="confirmed"?1:0,blockNumber:123,fee:100n,from:account,to:tx.to});
  if(tx.to?.toLowerCase()==="0x20c0000000000000000000000000000000000000"&&state.broadcast==="confirmed"){
   const decoded=tempoTokenInterface.parseTransaction({data:tx.data});if(decoded?.name==="approve")state.allowance=BigInt(decoded.args[1]);
  }
  return {hash} as Awaited<ReturnType<typeof rpc.broadcastTransaction>>;
 });
});
describe("reusable built-in Tempo transaction service",()=>{
 it("records a checked signature before broadcast and saves public receipt metadata",async()=>{
  const observer=vi.fn(),r=await s.approve(10000n,{...opts(),onSaved:observer});expect(r).toMatchObject({state:"confirmed",block:123,fee:"100",nonce:7,gasLimit:"120000",maximumFeeBaseUnits:"120",operationId:"test-operation"});
  expect(observer).toHaveBeenCalled();expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();const json=JSON.stringify([...state.db.values()]);expect(json).not.toContain(privateKey);expect(json).not.toContain("serialized");
 });
 it("returns the same receipt on repeated operations, including a new service after reload",async()=>{
  const first=await s.approve(10000n,opts());const restored=service();expect((await restored.approve(10000n,opts())).hash).toBe(first.hash);expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("rejects reuse of an operation ID with different arguments",async()=>{
  await s.approve(10000n,opts());await expect(s.approve(20000n,opts())).rejects.toThrow("different transaction terms");expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("retains response-loss uncertainty and blocks a different operation",async()=>{
  state.broadcast="uncertain";const r=await s.approve(10000n,opts());expect(r.state).toBe("uncertain");expect((await s.approve(10000n,opts())).hash).toBe(r.hash);
  await expect(s.approve(10000n,opts("another-operation"))).rejects.toThrow("unresolved");expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
  state.receipts.set(r.hash,{status:1,blockNumber:124,fee:100n,from:account,to:r.to!});expect(await s.recover(account)).toMatchObject({state:"confirmed",hash:r.hash});
 });
 it("never resubmits a reverted operation automatically",async()=>{
  state.broadcast="reverted";const r=await s.approve(10000n,opts());expect(r.state).toBe("reverted");expect((await s.approve(10000n,opts())).hash).toBe(r.hash);expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("turns a disappeared confirmed receipt into uncertainty",async()=>{
  const r=await s.approve(10000n,opts());state.receipts.delete(r.hash);expect(await s.recover(account)).toMatchObject({state:"uncertain"});await expect(s.approve(10000n,opts("new"))).rejects.toThrow("unresolved");
 });
 it("does not replace a newer unresolved transaction when recovering an older operation",async()=>{
  const old=await s.approve(10000n,opts("old"));state.broadcast="uncertain";const latest=await s.approve(20000n,opts("latest"));expect((await s.recoverOperation(account,"old"))?.hash).toBe(old.hash);expect((await s.pending(account))?.hash).toBe(latest.hash);await expect(s.approve(30000n,opts("third"))).rejects.toThrow("unresolved");
 });
 it("serializes two tabs using the same operation ID without duplicate broadcast",async()=>{
  const [a,b]=await Promise.all([s.approve(10000n,opts()),s.approve(10000n,opts())]);expect(a.hash).toBe(b.hash);expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("keeps legacy test-runner uncertain receipts blocking new submissions",async()=>{
  state.db.set(`picomart_tempo_contract_test_tx_42431_${account.toLowerCase()}`,{hash:"0x"+"12".repeat(32),account,nonce:1,method:"approve",state:"uncertain"});await expect(s.approve(10000n,opts())).rejects.toThrow("unresolved");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("fails closed for disabled deployment, wrong chain and mismatched runtime",async()=>{
  selected=null;await expect(s.approve(10000n,opts())).rejects.toThrow("not enabled");selected=deployment;state.chain=1;await expect(s.approve(10000n,opts())).rejects.toThrow("configured chain");state.chain=42431;state.code="0x6001";await expect(s.approve(10000n,opts())).rejects.toThrow("runtime");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("guards the reviewed account and wallet changes during RPC",async()=>{
  await expect(s.approve(10000n,{...opts(),expectedAccount:deployment.address})).rejects.toThrow("reviewed account");
  vi.mocked(rpc.estimateGas).mockImplementationOnce(async()=>{state.revision++;return 100000n;});await expect(s.approve(10000n,opts())).rejects.toThrow("Wallet changed");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("guards lock, page abort and deployment changes",async()=>{
  state.locked=true;await expect(s.approve(10000n,opts())).rejects.toThrow("Unlock");state.locked=false;const c=new AbortController();c.abort();await expect(s.approve(10000n,{...opts(),signal:c.signal})).rejects.toThrow();
  vi.mocked(rpc.estimateGas).mockImplementationOnce(async()=>{selected={...deployment,address:"0x"+"33".repeat(20)};return 100000n;});await expect(s.approve(10000n,opts())).rejects.toThrow("deployment changed");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("rejects signatures for a different destination before persistence or broadcast",async()=>{
  vi.spyOn(gateway,"sign").mockImplementationOnce(async(_session,request)=>signer.signTransaction({...request,to:account}));await expect(s.approve(10000n,opts())).rejects.toThrow("Signed transaction differs");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();expect(state.db.size).toBe(0);
 });
 it("validates fee preference, gas estimate and combined fee/transfer funding",async()=>{
  state.feePreference="0x20c0000000000000000000000000000000000001";await expect(s.approve(10000n,opts())).rejects.toThrow("fee preference");state.feePreference=ZeroAddress;
  vi.mocked(rpc.estimateGas).mockResolvedValueOnce(30_000_001n);await expect(s.approve(10000n,opts())).rejects.toThrow("transaction limit");state.balance=10000n;await expect(s.transfer(account,10000n,opts())).rejects.toThrow("Insufficient PathUSD");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("revalidates caller message/terms before signing and ignores observer failures",async()=>{
  const check=vi.fn(async()=>{throw new Error("Message expired");});await expect(s.approve(10000n,{...opts(),beforeSign:check})).rejects.toThrow("expired");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  expect((await s.approve(10000n,{...opts(),onSaved:()=>{throw new Error("UI observer failed");}})).state).toBe("confirmed");
 });
 it("rejects writes without Web Locks and malformed saved records",async()=>{
  vi.stubGlobal("navigator",{});await expect(s.approve(10000n,opts())).rejects.toThrow("Web Locks");vi.stubGlobal("navigator",{locks:{request:async(_name:string,work:()=>Promise<unknown>)=>work()}});
  state.db.set(`picomart_tempo_contract_test_tx_42431_${account.toLowerCase()}`,{hash:"bad",account});await expect(s.approve(10000n,opts())).rejects.toThrow("saved transaction");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("exposes exact approval requirements and requires a separate approval",async()=>{
  const call={method:"buyOrder",args:["0x"+"01".repeat(16)]};expect(await s.paymentRequirements(call)).toMatchObject({amount:"10000",allowance:"0",approvalRequired:true,spender:deployment.address});await expect(s.payOrder(call,opts())).rejects.toThrow("separate transaction");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  const approved=await s.approvePayment(call,opts());expect(approved).toMatchObject({method:"approve",operationId:"test-operation:approval",state:"confirmed"});expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
  const paid=await s.payOrder(call,opts());expect(paid).toMatchObject({method:"buyOrder",state:"confirmed"});expect(rpc.broadcastTransaction).toHaveBeenCalledTimes(2);expect((await service().payOrder(call,opts())).hash).toBe(paid.hash);expect(rpc.broadcastTransaction).toHaveBeenCalledTimes(2);
 });
 it("does not repeat payment when allowance was consumed after confirmation",async()=>{
  state.allowance=10000n;const call={method:"buyOrder",args:["0x"+"01".repeat(16)]};const paid=await s.payOrder(call,opts());state.allowance=0n;state.orderVersion=0;expect((await s.payOrder(call,opts())).hash).toBe(paid.hash);expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("binds approval and payment to the same immutable order intent",async()=>{
  await s.approvePayment({method:"buyOrder",args:["0x"+"01".repeat(16)]},opts());await expect(s.payOrder({method:"buyOrder",args:["0x"+"02".repeat(16)]},opts())).rejects.toThrow("different order terms");expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("does not proceed to payment after an uncertain approval",async()=>{
  state.broadcast="uncertain";const call={method:"buyOrder",args:["0x"+"01".repeat(16)]};expect((await s.approvePayment(call,opts())).state).toBe("uncertain");await expect(s.payOrder(call,opts())).rejects.toThrow("unresolved");expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("caps gas buffer, rejects read calls and rejects nonpayment methods",async()=>{
  vi.mocked(rpc.estimateGas).mockResolvedValue(29_000_000n);state.balance=100_000_000n;expect((await s.approve(10000n,opts())).gasLimit).toBe("30000000");await expect(s.sendContract({method:"owner",args:[]},opts("read"))).rejects.toThrow("write method");await expect(s.payOrder({method:"cancelOrder",args:["0x"+"01".repeat(16)]},opts("cancel"))).rejects.toThrow("Select createOrderPaid");
 });
 it("shows the exact signed fee limit and waits for explicit approval",async()=>{
  const sign=vi.spyOn(gateway,"sign");let approve!:()=>void,show!:()=>void;
  const shown=new Promise<void>(resolve=>{show=resolve;});
  const sending=s.sendContract({method:'deleteCatalog',args:['0x'+'01'.repeat(16)]},{...opts(),reviewFee:async quote=>{
      expect(quote).toMatchObject({account:account.toLowerCase(),maximumFeeBaseUnits:'120',gasLimit:'120000',method:'deleteCatalog'});
      show();await new Promise<void>(done=>{approve=done;});
    }});
  await shown;expect(sign).not.toHaveBeenCalled();expect(rpc.broadcastTransaction).not.toHaveBeenCalled();approve();expect((await sending).maximumFeeBaseUnits).toBe('120');
  const tx=Transaction.from(await sign.mock.results[0].value);expect(tx.gasLimit).toBe(120000n);expect(tx.maxFeePerGas).toBe(1000000000n);
 });
 it("cancels fee review without signing or saving a transaction",async()=>{
  const sign=vi.spyOn(gateway,'sign');const call={method:'deleteCatalog',args:['0x'+'01'.repeat(16)]};
  await expect(s.sendContract(call,{...opts(),reviewFee:async()=>{throw new Error('Approval canceled');}})).rejects.toThrow('Approval canceled');
  expect(sign).not.toHaveBeenCalled();expect(state.db.size).toBe(0);expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  expect((await s.sendContract(call,{...opts(),reviewFee:async()=>{}})).state).toBe('confirmed');
 });
 it("recovers an uncertain reviewed operation without requesting approval or rebroadcasting",async()=>{
  state.broadcast='uncertain';const reviewFee=vi.fn(async()=>{}),call={method:'deleteCatalog',args:['0x'+'01'.repeat(16)]};
  const first=await s.sendContract(call,{...opts(),reviewFee});const recovered=await service().sendContract(call,{...opts(),reviewFee});
  expect(recovered.hash).toBe(first.hash);expect(reviewFee).toHaveBeenCalledOnce();expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it("rejects locking, cancellation and changed arguments during fee approval",async()=>{
  const call={method:'deleteCatalog',args:['0x'+'01'.repeat(16)]},sign=vi.spyOn(gateway,'sign');
  await expect(s.sendContract(call,{...opts(),reviewFee:async()=>{state.locked=true;}})).rejects.toThrow('locked');state.locked=false;
  const controller=new AbortController();await expect(s.sendContract(call,{...opts(),signal:controller.signal,reviewFee:async()=>{controller.abort();}})).rejects.toThrow();
  await expect(s.sendContract(call,{...opts(),reviewFee:async()=>{call.args[0]='0x'+'02'.repeat(16);}})).rejects.toThrow('arguments changed');
  expect(sign).not.toHaveBeenCalled();expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("revalidates business terms after fee approval rather than trusting the earlier preview",async()=>{
  let approved=false;const beforeSign=vi.fn(async()=>{expect(approved).toBe(true);throw new Error('Terms expired');});
  await expect(s.sendContract({method:'deleteCatalog',args:['0x'+'01'.repeat(16)]},{...opts(),reviewFee:async()=>{approved=true;},beforeSign})).rejects.toThrow('Terms expired');
  expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
});

 describe("message-bearing transaction validation",()=>{
  it("requires reference validation and uses the paid creation amount for fees and allowance",async()=>{
    const input={orderId:"0x"+"01".repeat(16),catalogId:"0x"+"02".repeat(16),priceAmount:"10000",priceToken:state.orderToken,expectedSeller:"0x"+"33".repeat(20),expectedSellerPublicKey:"0x"+"44".repeat(32),expectedSellerIdentityId:"0x"+"55".repeat(32),buyerPublicKey:"0x"+"66".repeat(32),buyerIdentityId:"0x"+"77".repeat(32)};
    const call={method:"createOrderPaid",args:[input,{sequence:1,buyerEnvelope:"0x01",sellerEnvelope:"0x02"}]};
    await expect(s.payOrder(call,opts())).rejects.toThrow("reference validation");state.allowance=10000n;const validation=vi.fn(async()=>{});const receipt=await s.payOrder(call,{...opts(),beforeSign:validation});expect(receipt.state).toBe("confirmed");expect(validation).toHaveBeenCalledOnce();
  });
  it("rejects arguments mutated during asynchronous preparation",async()=>{
    const call={method:"cancelOrder",args:["0x"+"01".repeat(16)]};await expect(s.sendContract(call,{...opts(),beforeSign:async()=>{call.args[0]="0x"+"02".repeat(16);}})).rejects.toThrow("arguments changed");expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  });
});

describe('multi-currency account transfers',()=>{
 const path='0x20c0000000000000000000000000000000000000',alpha='0x20c0000000000000000000000000000000000001',beta='0x20c0000000000000000000000000000000000002',ousd='0x20c0000000000000000000006a37da5c996874be',recipient='0x'+'22'.repeat(20);
 it.each([[alpha,'AlphaUSD'],[beta,'BetaUSD'],[ousd,'OUSD']])('sends %s and reviews the correct default fee currency',async(token,symbol)=>{
  const reviewFee=vi.fn(async()=>{}),result=await s.transfer(recipient,10000n,{...opts(),reviewFee},token);
  expect(result).toMatchObject({state:'confirmed',to:token,amount:'10000',recipient,feeToken:token});
  expect(reviewFee).toHaveBeenCalledWith(expect.objectContaining({feeToken:token,feeSymbol:symbol,maximumFeeBaseUnits:'120'}),expect.any(AbortSignal));
  const signed=Transaction.from(vi.mocked(rpc.broadcastTransaction).mock.calls[0][0] as string);expect(signed.to?.toLowerCase()).toBe(token);expect(tempoTokenInterface.decodeFunctionData('transfer',signed.data)[1]).toBe(10000n);
 });
 it('checks transfer funds separately from fee funds',async()=>{
  state.feePreference=path;state.tokenBalances.set(alpha,10000n);state.tokenBalances.set(path,119n);
  await expect(s.transfer(recipient,10000n,opts(),alpha)).rejects.toThrow('Insufficient PathUSD');
  state.tokenBalances.set(path,120n);state.tokenBalances.set(alpha,9999n);
  await expect(s.transfer(recipient,10000n,opts(),alpha)).rejects.toThrow('Insufficient AlphaUSD');
  state.tokenBalances.set(alpha,10000n);expect((await s.transfer(recipient,10000n,opts(),alpha)).state).toBe('confirmed');
 });
 it('reserves fees when Max uses the same currency and sends full balance with separate fee funds',async()=>{
  expect(await s.maximumTransfer(recipient,alpha,account)).toBe(999880n);
  state.feePreference=path;expect(await s.maximumTransfer(recipient,alpha,account)).toBe(1000000n);
  expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it('does not send unsupported or metadata-mismatched currencies',async()=>{
  await expect(s.transfer(recipient,10000n,opts(),'0x'+'33'.repeat(20))).rejects.toThrow('not supported');
  state.metadataValid=false;await expect(s.transfer(recipient,10000n,opts(),alpha)).rejects.toThrow('Currency details');expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it('rechecks fee currency after approval and aborts changed preferences',async()=>{
  await expect(s.transfer(recipient,10000n,{...opts(),reviewFee:async()=>{state.feePreference=path;}},alpha)).rejects.toThrow('Fee currency changed');expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it('recovers uncertain transfers without sending twice and rejects reusing the intent for another currency',async()=>{
  state.broadcast='uncertain';const reviewFee=vi.fn(async()=>{}),first=await s.transfer(recipient,10000n,{...opts(),reviewFee},alpha);
  expect((await s.transfer(recipient,10000n,{...opts(),reviewFee},alpha)).hash).toBe(first.hash);
  await expect(s.transfer(recipient,10000n,opts(),beta)).rejects.toThrow('different transaction terms');
  expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();expect(reviewFee).toHaveBeenCalledOnce();
  expect((await service().recover(account))?.state).toBe('uncertain');
 });
 it('canceling transfer review never signs or broadcasts',async()=>{
  const sign=vi.spyOn(gateway,'sign');await expect(s.transfer(recipient,10000n,{...opts(),reviewFee:async()=>{throw Error('Canceled');}},alpha)).rejects.toThrow('Canceled');expect(sign).not.toHaveBeenCalled();expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
});

describe('configured checkout currencies',()=>{
 it('approves the selected token contract and then pays the matching order',async()=>{
  state.extraCheckout=true;state.orderToken='0x20c0000000000000000000000000000000000001';
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]};
  expect((await s.paymentRequirements(call)).token).toBe(state.orderToken);
  const approval=await s.approvePayment(call,opts('alternate'));
  expect(approval.to).toBe(state.orderToken);
  state.allowance=10000n;
  expect((await s.payOrder(call,opts('alternate'))).state).toBe('confirmed');
 });
 it('rejects an order currency absent from checkout configuration',async()=>{
  state.orderToken='0x20c0000000000000000000000000000000000001';
  await expect(s.paymentRequirements({method:'buyOrder',args:['0x'+'01'.repeat(16)]})).rejects.toThrow('supported');
  expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
});
