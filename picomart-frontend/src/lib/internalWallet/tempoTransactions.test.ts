import {beforeEach,describe,expect,it,vi} from "vitest";
import {FeeData,JsonRpcProvider,Network,Transaction,Wallet,keccak256,ZeroAddress} from "ethers";
const state=vi.hoisted(()=>({db:new Map<string,unknown>(),balance:1_000_000n,balances:{} as Record<string,bigint>,allowance:0n,feePreference:"0x0000000000000000000000000000000000000000",chain:42431,code:"0x6000",nonce:7,revision:0,locked:false,receipts:new Map<string,{status:number;blockNumber:number;fee:bigint;from:string;to:string|null}>(),broadcast:"confirmed" as "confirmed"|"uncertain"|"reverted",orderVersion:1,orderToken:'0x20c0000000000000000000000000000000000000'}));
vi.mock("idb-keyval",()=>({get:async(k:string)=>structuredClone(state.db.get(k)),set:async(k:string,v:unknown)=>{state.db.set(k,structuredClone(v));}}));
vi.mock("@picomart/order-protocol/tempo-contract",async(importOriginal)=>{const actual=await importOriginal<typeof import("@picomart/order-protocol/tempo-contract")>();const {keccak256:hash}=await import("ethers");return {...actual,PICOMART_TEMPO_BUILD:{...actual.PICOMART_TEMPO_BUILD,runtimeBytecodeHash:hash("0x6000")}};});
vi.mock("ethers",async(importOriginal)=>{const actual=await importOriginal<typeof import("ethers")>();return {...actual,Contract:class {token:string;constructor(token:string){this.token=token;} async userTokens(){return state.feePreference;}async balanceOf(){return state.balances[this.token.toLowerCase()]??state.balance;}async allowance(){return state.allowance;}async getOrder(){return {version:state.orderVersion,priceAmount:10000n,priceToken:state.orderToken};}}};});
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
 vi.restoreAllMocks();state.db.clear();state.receipts.clear();state.balance=1_000_000n;state.balances={};state.allowance=0n;state.feePreference=ZeroAddress;state.chain=42431;state.code="0x6000";state.nonce=7;state.revision=0;state.locked=false;state.broadcast="confirmed";state.orderVersion=1;state.orderToken='0x20c0000000000000000000000000000000000000';selected=deployment;s=service();
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
  if(tx.to?.toLowerCase().startsWith("0x20c")&&state.broadcast==="confirmed"){
   const decoded=tempoTokenInterface.parseTransaction({data:tx.data});if(decoded?.name==="approve")state.allowance=BigInt(decoded.args[1]);
  }
  return {hash} as Awaited<ReturnType<typeof rpc.broadcastTransaction>>;
 });
});
describe("reusable built-in Tempo transaction service",()=>{
 it('reviews both transaction fee caps without signing and reserves the payment ceiling before allowance exists',async()=>{
  const sign=vi.spyOn(gateway,'sign'),quote=await s.estimatePayment({method:'buyOrder',args:['0x'+'01'.repeat(16)]});
  expect(quote).toMatchObject({approvalRequired:true,approvalMaximumFee:'120',paymentMaximumFee:'30000',maximumFee:'30120',requiredBalance:'40120',requiredFeeBalance:'40120'});
  expect(sign).not.toHaveBeenCalled();expect(state.db.size).toBe(0);expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it('approves exactly the reviewed amount and pays under one operation, then recovers without sending twice',async()=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  const tx=await s.payOrderAutomatically(call,quote,opts());
  expect(tx).toMatchObject({method:'buyOrder',state:'confirmed'});expect(rpc.broadcastTransaction).toHaveBeenCalledTimes(2);
  const approved=Transaction.from(vi.mocked(rpc.broadcastTransaction).mock.calls[0][0] as string);
  expect(tempoTokenInterface.decodeFunctionData('approve',approved.data)[1]).toBe(10000n);
  state.allowance=0n;state.orderVersion=0;
  expect((await s.payOrderAutomatically(call,quote,opts())).hash).toBe(tx.hash);expect(rpc.broadcastTransaction).toHaveBeenCalledTimes(2);
 });
 it('skips approval when allowance already covers the order and serializes concurrent payment clicks',async()=>{
  state.allowance=10000n;const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  expect(quote).toMatchObject({approvalMaximumFee:'0',paymentMaximumFee:'120',maximumFee:'120'});
  const [a,b]=await Promise.all([s.payOrderAutomatically(call,quote,opts()),s.payOrderAutomatically(call,quote,opts())]);
  expect(a.hash).toBe(b.hash);expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it.each(['uncertain','reverted'] as const)('stops after %s approval and does not resubmit it',async(outcome)=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);state.broadcast=outcome;
  expect(await s.payOrderAutomatically(call,quote,opts())).toMatchObject({method:'approve',state:outcome});
  expect(await s.payOrderAutomatically(call,quote,opts())).toMatchObject({method:'approve',state:outcome});
  expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it('blocks changed order data, account, wallet, expired review and newly required approval',async()=>{
  state.allowance=10000n;const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  await expect(s.payOrderAutomatically({...call,args:['0x'+'02'.repeat(16)]},quote,opts())).rejects.toThrow('review changed');
  await expect(s.payOrderAutomatically(call,{...quote,account:deployment.address},opts())).rejects.toThrow('review changed');
  await expect(s.payOrderAutomatically(call,{...quote,revision:quote.revision+1},opts())).rejects.toThrow('review changed');
  await expect(s.payOrderAutomatically(call,{...quote,expiresAt:0},opts())).rejects.toThrow('expired');
  state.allowance=0n;await expect(s.payOrderAutomatically(call,quote,opts())).rejects.toThrow('authorization changed');
  expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it('checks alternate payment funds and PathUSD fee funds separately before approving',async()=>{
  state.orderToken='0x20c0000000000000000000000000000000000001';
  state.balances[state.orderToken]=10000n;state.balances['0x20c0000000000000000000000000000000000000']=30119n;
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  expect(quote).toMatchObject({balance:'10000',feeBalance:'30119',requiredBalance:'10000',requiredFeeBalance:'30120'});
  await expect(s.payOrderAutomatically(call,quote,opts())).rejects.toThrow('Insufficient PathUSD');expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
  state.balances['0x20c0000000000000000000000000000000000000']=30120n;
  expect(await s.payOrderAutomatically(call,quote,opts())).toMatchObject({state:'confirmed',method:'buyOrder'});
  expect(Transaction.from(vi.mocked(rpc.broadcastTransaction).mock.calls[0][0] as string).to?.toLowerCase()).toBe(state.orderToken);
 });
 it('requires a new review if approval fees exceed the cap',async()=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  vi.mocked(rpc.getFeeData).mockResolvedValue(new FeeData(null,2_000_000_000n,0n));
  await expect(s.payOrderAutomatically(call,quote,opts())).rejects.toThrow('reviewed limit');expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it('requires private reference validation for paid creation even in the automatic flow',async()=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  await expect(s.payOrderAutomatically({method:'createOrderPaid',args:[]},quote,opts())).rejects.toThrow('reference validation');
  expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it('stops before payment signing if fees increase past its reviewed cap after approval',async()=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  const onSaved=(tx:{state:string})=>{if(tx.state==='uncertain')vi.mocked(rpc.getFeeData).mockResolvedValue(new FeeData(null,300_000_000_000n,0n));};
  await expect(s.payOrderAutomatically(call,quote,{...opts(),onSaved})).rejects.toThrow('reviewed limit');
  expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it('revalidates before each signature and stops if the wallet locks or terms change after approval',async()=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call),beforeSign=vi.fn(async()=>{});
  beforeSign.mockImplementationOnce(async()=>{}).mockImplementationOnce(async()=>{throw new Error('Order terms changed');});
  await expect(s.payOrderAutomatically(call,quote,{...opts(),beforeSign})).rejects.toThrow('Order terms changed');
  expect(beforeSign).toHaveBeenCalledTimes(2);expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
 });
 it('stops on wallet lock after approval and resumes with a fresh review without repeating approval',async()=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  let checks=0;const beforeSign=async()=>{if(++checks===2)state.locked=true;};
  await expect(s.payOrderAutomatically(call,quote,{...opts(),beforeSign})).rejects.toThrow('locked');
  expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
  state.locked=false;state.revision++;
  const refreshed=await s.estimatePayment(call);
  expect(await s.payOrderAutomatically(call,refreshed,opts())).toMatchObject({state:'confirmed',method:'buyOrder'});
  expect(rpc.broadcastTransaction).toHaveBeenCalledTimes(2);
 });
 it('recovers a formerly uncertain approval and resumes only the remaining payment',async()=>{
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);state.broadcast='uncertain';
  const approval=await s.payOrderAutomatically(call,quote,opts());
  state.receipts.set(approval.hash,{status:1,blockNumber:124,fee:100n,from:account,to:approval.to!});
  state.allowance=10000n;state.broadcast='confirmed';
  const refreshed=await s.estimatePayment(call);
  expect(await s.payOrderAutomatically(call,refreshed,opts())).toMatchObject({state:'confirmed',method:'buyOrder'});
  expect(rpc.broadcastTransaction).toHaveBeenCalledTimes(2);
 });
 it('stops an aborted checkout before payment and preserves the approval receipt for recovery',async()=>{
  const abort=new AbortController(),call={method:'buyOrder',args:['0x'+'01'.repeat(16)]},quote=await s.estimatePayment(call);
  let checks=0;const beforeSign=async()=>{if(++checks===2)abort.abort();};
  await expect(s.payOrderAutomatically(call,quote,{...opts(),signal:abort.signal,beforeSign})).rejects.toThrow();
  expect(rpc.broadcastTransaction).toHaveBeenCalledOnce();
  expect(await s.recoverOperation(account,'test-operation:approval')).toMatchObject({state:'confirmed',method:'approve'});
 });
 it("estimates authorization costs without signing, saving or broadcasting",async()=>{
  const sign=vi.spyOn(gateway,'sign');
  const quote=await s.estimateNextPayment({method:'buyOrder',args:['0x'+'01'.repeat(16)]});
  expect(quote).toMatchObject({approvalRequired:true,amount:'10000',balance:'1000000',maximumFee:'120',requiredBalance:'10120'});
  expect(rpc.estimateGas).toHaveBeenCalledWith(expect.objectContaining({to:state.orderToken,data:tempoTokenInterface.encodeFunctionData('approve',[deployment.address,'10000'])}));
  expect(sign).not.toHaveBeenCalled();expect(rpc.broadcastTransaction).not.toHaveBeenCalled();expect(state.db.size).toBe(0);
 });
 it("estimates the payment after authorization and rejects a changed wallet",async()=>{
  state.allowance=10000n;
  expect(await s.estimateNextPayment({method:'buyOrder',args:['0x'+'01'.repeat(16)]})).toMatchObject({approvalRequired:false,maximumFee:'120'});
  expect(rpc.estimateGas).toHaveBeenCalledWith(expect.objectContaining({to:deployment.address}));
  vi.mocked(rpc.getFeeData).mockImplementation(async()=>{state.revision++;return new FeeData(null,1_000_000_000n,0n);});
  await expect(s.estimateNextPayment({method:'buyOrder',args:['0x'+'01'.repeat(16)]})).rejects.toThrow('changed or locked');
  expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
 it("rejects invalid fee estimates before showing a cost",async()=>{
  vi.mocked(rpc.estimateGas).mockResolvedValue(0n);
  await expect(s.estimateNextPayment({method:'buyOrder',args:['0x'+'01'.repeat(16)]})).rejects.toThrow('Gas estimate');
  vi.mocked(rpc.estimateGas).mockResolvedValue(100000n);
  vi.mocked(rpc.getFeeData).mockResolvedValue(new FeeData(null,null,null));
  await expect(s.estimateNextPayment({method:'buyOrder',args:['0x'+'01'.repeat(16)]})).rejects.toThrow('invalid EIP-1559');
 });
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

describe('configured checkout currencies',()=>{
 it('approves the selected token contract and then pays the matching order',async()=>{
  state.orderToken='0x20c0000000000000000000000000000000000001';
  const call={method:'buyOrder',args:['0x'+'01'.repeat(16)]};
  expect((await s.paymentRequirements(call)).token).toBe(state.orderToken);
  const approval=await s.approvePayment(call,opts('alternate'));
  expect(approval.to).toBe(state.orderToken);
  state.allowance=10000n;
  expect((await s.payOrder(call,opts('alternate'))).state).toBe('confirmed');
 });
 it('rejects an order currency absent from configuration',async()=>{
  state.orderToken='0x1111111111111111111111111111111111111111';
  await expect(s.paymentRequirements({method:'buyOrder',args:['0x'+'01'.repeat(16)]})).rejects.toThrow('supported');
  expect(rpc.broadcastTransaction).not.toHaveBeenCalled();
 });
});
