import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom";
import {get,set} from "idb-keyval";
import {hexlify, parseUnits, toUtf8String, type FunctionFragment} from "ethers";
import {createTempoMessageBinding, createTempoReceivingContext, createTempoReceivingIdentity, TempoOrderContextSchema, TempoMessagePayloadSchema, tempoIdToSeed, tempoSeedToId, type TempoExpectedMessage, type TempoOrderContext} from "@picomart/order-protocol/tempo-protocol";
import {Button} from "@/components/ui/button";
import TempoOrderLookup from '@/components/TempoOrderLookup';
import TempoReceiptRecovery from '@/components/TempoReceiptRecovery';
import type {InternalWalletStatus, InternalWalletSummary} from "@/lib/internalWallet/types";
import {tempoInternalWalletProvider as wallet} from "@/lib/internalWallet/providers/tempoInternalWalletProvider";
import {lockWalletSession} from "@/lib/internalWallet/store";
import {createTempoCommerceService, type TempoOperationSummary} from "@/lib/internalWallet/tempoCommerce";
import {configuredProofClient} from "@/lib/internalWallet/tempoRecoveryProof";
import {assertTestDeployment, contractInterface, functions, json, messageBytes, namedResult, pendingTransaction, publicKeyBase64, publicKeyBytes, refreshTransaction, submitTestTransaction, testTransactions, testOperationId, testOrderLogs, testContract, testError, testRpc, testToken, tokenInterface, TEST_BLOCK, TEST_CONTRACT, TEST_TOKEN, type TestTransaction} from "@/lib/internalWallet/tempoContractTest";

const draftKey="picomart_tempo_contract_test_public_drafts_v1";
const randomId=() => hexlify(crypto.getRandomValues(new Uint8Array(16)));
type Draft={order:TempoOrderContext; expected:TempoExpectedMessage; expiresAt:string; preparedAt:number; input?:Record<string,unknown>; operation?:TempoOperationSummary};
const opKey=(id:string,type:string) => `${id.toLowerCase()}_${type}`;
const uiClass="block w-full rounded border p-2 bg-background text-foreground";
export default function TempoContractPage() {
  const [wallets,setWallets]=useState<InternalWalletSummary[]>([]),[active,setActive]=useState<InternalWalletStatus|null>(null),[password,setPassword]=useState("");
  const [catalogId,setCatalogId]=useState(""),[orderId,setOrderId]=useState(""),[amount,setAmount]=useState("0.01"),[catalogUrl,setCatalogUrl]=useState("https://example.com/picomart-contract-test.json");
  const [target,setTarget]=useState<"contract"|"token">("contract"),[method,setMethod]=useState("owner"),[args,setArgs]=useState("[]"),[result,setResult]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[ack,setAck]=useState(false),[tx,setTx]=useState<TestTransaction|null>(null);
  const [savedKeys,setSavedKeys]=useState<string[]>([]),[draftsLoaded,setDraftsLoaded]=useState(false);
  const operation=useRef<{intent:string;id:string}|null>(null);
  const [approval,setApproval]=useState<TestTransaction|null>(null);
  const drafts=useRef<Record<string,Draft>>({}), controller=useRef<AbortController|null>(null), walletId=useRef<string|null>(null), running=useRef(false);
  const abi=target === "contract" ? contractInterface : tokenInterface;
  const fragment=abi.getFunction(method), readOnly=fragment?.constant ?? true;
  async function reload() { const [current,list]=await Promise.all([wallet.getActiveWallet("moderato"),wallet.listWallets("moderato")]); setActive(current);setWallets(list);walletId.current=current?.id ?? null; if(current)setTx(await pendingTransaction(current.identity.evmAddress)); }
  useEffect(() => {
    void reload().catch(e=>setError(testError(e)));
    void get<Record<string,Draft>>(draftKey).then(value=>{drafts.current=value ?? {};setSavedKeys(Object.keys(drafts.current));setDraftsLoaded(true);}).catch(()=>setError("Cannot load saved test operations."));
    const hide=()=>{controller.current?.abort();setPassword("");const id=walletId.current;if(id){lockWalletSession(id);void wallet.lockWallet(id);}};
    window.addEventListener("pagehide",hide);
    return ()=>{window.removeEventListener("pagehide",hide);hide();};
  },[]);
  useEffect(()=>{setAck(false);setResult("");},[active?.id,target,method,args]);
  async function run(action:(signal:AbortSignal)=>Promise<void>) {
    if(running.current)return;if(!draftsLoaded){setError("Saved test operations are still loading or unavailable.");return;}running.current=true;setBusy(true);setError("");setMessage("");
    const c=new AbortController();controller.current=c;
    try {await action(c.signal);} catch(e){setError(testError(e));}
    finally {setPassword("");setBusy(false);running.current=false;await reload().catch(e=>setError(testError(e)));}
  }
  function service() {
    const client=configuredProofClient();if(!client)throw new Error("Configure the existing zkbytes API and download origins to prepare messages.");
    return createTempoCommerceService({client,origins:{apiOrigin:client.apiOrigin,downloadOrigin:client.downloadOrigin},deployment:()=>TEST_CONTRACT.toLowerCase(),maxRetentionSeconds:30*86400});
  }
  function context(role:"buyer"|"seller",account:string,id:string) {
    return createTempoReceivingContext({version:1,profile:"picomart-receiving-v1",chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:TEST_CONTRACT.toLowerCase(),account,role,...(role === "buyer" ? {orderSeed:tempoIdToSeed(id)} : {catalogSeed:tempoIdToSeed(id)})} as Parameters<typeof createTempoReceivingContext>[0]);
  }
  async function selectedAddress() {const current=await wallet.getActiveWallet("moderato");if(!current || current.locked)throw new Error("Select and unlock a built-in wallet.");return current.identity.evmAddress.toLowerCase();}
  function selectMethod(name:string,values:unknown[],nextTarget:"contract"|"token"="contract") {setTarget(nextTarget);setMethod(name);setArgs(json(values));setResult("");}
  async function saveDraft(key:string,draft:Draft) {drafts.current[key]=draft;setSavedKeys(Object.keys(drafts.current));await set(draftKey,drafts.current);}
  async function prepare(type:TempoExpectedMessage["messageType"]) {
    await assertTestDeployment();const s=service(),adapter=wallet.getWalletAdapter("moderato"),account=await selectedAddress();
    const expected:TempoExpectedMessage={messageType:type,sequence:1},key=opKey(orderId,type);
    let draft=drafts.current[key];
    if(!draft) {
      let order:TempoOrderContext,input:Record<string,unknown>|undefined;
      if(type === "buyer-order") {
        const catalog=await testContract.catalogs(catalogId);
        const sellerIdentity=createTempoReceivingIdentity(context("seller",catalog.seller,catalogId),publicKeyBase64(catalog.sellerPublicKey));
        if(sellerIdentity.identityId !== catalog.sellerIdentityId.toLowerCase())throw new Error("Catalog identity differs from its onchain snapshot.");
        const buyerIdentity=await s.receivingIdentity(adapter,context("buyer",account,orderId));
        order=TempoOrderContextSchema.parse({version:1,chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:TEST_CONTRACT.toLowerCase(),catalogSeed:tempoIdToSeed(catalogId),orderSeed:tempoIdToSeed(orderId),buyerIdentity,sellerIdentity});
        const priceAmount=parseUnits(amount,6);if(priceAmount<=0n || priceAmount>1_000_000n)throw new Error("Use a controlled test price above zero and at most 1 PathUSD.");
        input={orderId,catalogId,priceAmount:priceAmount.toString(),priceToken:TEST_TOKEN,expectedSeller:catalog.seller,expectedSellerPublicKey:catalog.sellerPublicKey,expectedSellerIdentityId:catalog.sellerIdentityId,buyerPublicKey:publicKeyBytes(buyerIdentity.publicKey),buyerIdentityId:buyerIdentity.identityId};
      } else {
        const stored=await testContract.getOrder(orderId);if(Number(stored.version)!==1)throw new Error("Read an existing order before preparing a seller message.");
        const buyerIdentity=createTempoReceivingIdentity(context("buyer",stored.buyer,orderId),publicKeyBase64(stored.buyerPublicKey));
        const sellerIdentity=createTempoReceivingIdentity(context("seller",stored.seller,stored.catalogId),publicKeyBase64(stored.sellerPublicKey));
        if(buyerIdentity.identityId!==stored.buyerIdentityId.toLowerCase() || sellerIdentity.identityId!==stored.sellerIdentityId.toLowerCase())throw new Error("Order identities differ from historical onchain snapshots.");
        order=TempoOrderContextSchema.parse({version:1,chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:TEST_CONTRACT.toLowerCase(),catalogSeed:tempoIdToSeed(stored.catalogId),orderSeed:tempoIdToSeed(orderId),buyerIdentity,sellerIdentity});
      }
      draft={order,expected,input,preparedAt:Date.now(),expiresAt:new Date(Date.now()+30*86400_000-1000).toISOString().replace(/\.\d{3}Z$/,"Z")};await saveDraft(key,draft);
    }
    const data=type === "buyer-order" ? {
      catalogSeed:draft.order.catalogSeed,orderSeed:draft.order.orderSeed,
      items:[{productId:"contract-test",name:"Disposable test item",quantity:1,unitAmount:String(draft.input!.priceAmount),lineAmount:String(draft.input!.priceAmount)}],
      delivery:{fullName:"",address:"",city:"",postalCode:"",country:"",phone:"",email:"",noPhysicalDelivery:true},deliveryAmount:"0",payment:{tokenAddress:TEST_TOKEN.toLowerCase(),amount:String(draft.input!.priceAmount)},
    } : type === "seller-delivery" ? {shipmentCode:"TEST",customInfo:"Disposable contract test delivery"} : {customInfo:"Disposable contract test refusal"};
    const payload=TempoMessagePayloadSchema.parse({version:1,profile:"picomart-message-v1",binding:createTempoMessageBinding(draft.order,expected),data});
    draft.operation=await s.prepare(adapter,draft.order,payload,expected,draft.expiresAt);await saveDraft(key,draft);
    draft.operation=await s.resumeUpload(adapter,draft.order,expected);await saveDraft(key,draft);
    const reference={sequence:1,buyerEnvelope:messageBytes(draft.operation.buyerEnvelope),sellerEnvelope:messageBytes(draft.operation.sellerEnvelope)};
    selectMethod(type === "buyer-order" ? "createOrderInitial" : type === "seller-delivery" ? "startDelivering" : "refuseOrder",type === "buyer-order" ? [draft.input,reference] : [orderId,reference]);
    setMessage(`Message ${draft.operation.state}. ${draft.operation.ready ? "Verified by read-back; ready for submission." : "Click the same prepare/resume button again to check storage readiness."}`);
  }
  async function checkMessage(methodName:string,values:unknown[]) {
    const type=methodName === "createOrderInitial" || methodName === "createOrderPaid" ? "buyer-order" : methodName === "startDelivering" ? "seller-delivery" : methodName === "refuseOrder" ? "seller-refusal" : null;
    if(!type)return;
    const id=type === "buyer-order" ? String((values[0] as {orderId:string}).orderId) : String(values[0]);
    const draft=drafts.current[opKey(id,type)];if(!draft)throw new Error("Prepare this message using the test page before submitting it.");
    if(Date.now()-draft.preparedAt>86400_000 || Date.parse(draft.expiresAt)-Date.now()<29*86400_000-2000)throw new Error("Prepared message is too old for the bounded test policy. Use a fresh order; do not replace a submitted message.");
    const op=await service().resumeUpload(wallet.getWalletAdapter("moderato"),draft.order,draft.expected);
    if(Date.parse(op.expiresAt)-Date.now()<29*86400_000-2000)throw new Error("Authenticated stored message expiration leaves insufficient evidence retention. Use a fresh order.");
    if(!op.ready)throw new Error(`Storage is ${op.state}; resume until read-back succeeds before submitting.`);
    const reference={sequence:1,buyerEnvelope:messageBytes(op.buyerEnvelope),sellerEnvelope:messageBytes(op.sellerEnvelope)};
    const expectedArgs=type === "buyer-order" ? [draft.input,reference] : [id,reference];
    if(contractInterface.encodeFunctionData(methodName,values)!==contractInterface.encodeFunctionData(methodName,expectedArgs))throw new Error("Transaction terms or references differ from the verified prepared message.");
  }
  async function inspect() {
    await assertTestDeployment();
    const owner=await testContract.owner(),order=orderId ? await testContract.getOrder(orderId) : null,catalog=catalogId ? await testContract.catalogs(catalogId) : null;
    const addresses=[...new Set([active?.identity.evmAddress,order?.buyer,order?.seller,order?.payer].filter((a):a is string=>Boolean(a)&&a!=="0x0000000000000000000000000000000000000000"))];
    const balances=Object.fromEntries(await Promise.all(addresses.map(async address=>[address,{pathUsdBaseUnits:String(await testToken.balanceOf(address)),allowanceBaseUnits:String(await testToken.allowance(address,TEST_CONTRACT))}])));
    setResult(json({owner,catalog:catalog ? namedResult(contractInterface.getFunction("catalogs")!.outputs,catalog) : null,order:order ? namedResult(contractInterface.getFunction("getOrder")!.outputs[0].components!,order) : null,balances,contractPathUsdBalance:await testToken.balanceOf(TEST_CONTRACT),escrowed:await testContract.escrowedAmounts(TEST_TOKEN),consumed:orderId ? await testContract.consumedOrderIds(orderId) : null}));
  }
  function choose(f:FunctionFragment) {
    const defaults=f.inputs.map(p=>p.type === "bytes16" ? (p.name.toLowerCase().includes("catalog") ? catalogId : orderId) : p.type === "address" ? (p.name === "token" ? TEST_TOKEN : p.name === "spender" ? TEST_CONTRACT : active?.identity.evmAddress ?? "") : p.type === "bool" ? true : p.type.startsWith("uint") ? "10000" : p.type === "string" ? catalogUrl : p.type === "bytes" ? "0x" : p.type === "tuple" ? {} : "0x");
    selectMethod(f.name,defaults,target);
  }
  return <main className="max-w-4xl mx-auto p-6 space-y-5">
    <Link to="/settings" className="underline">Settings</Link><h1 className="text-2xl font-bold">Tempo contract test runner</h1>
    <TempoOrderLookup/>
    <TempoReceiptRecovery/>
    <p>Moderato only · chain {PICOMART_TEMPO_CONFIG.chainId} · deployment block {TEST_BLOCK}. These actions send real testnet transactions. Use disposable test data and controlled PathUSD amounts. Checkout remains disabled.</p>
    <p className="break-all">Contract: {TEST_CONTRACT}</p>
    <section className="border rounded p-4 space-y-3"><h2 className="text-xl">Built-in wallet</h2>
      <Link to="/tempo-wallet" className="underline">Create or restore test wallets</Link>
      <p>Use separate seller, buyer, payer and admin wallets. Run transactions from one browser origin at a time.</p>
      <select aria-label="Active test wallet" className={uiClass} disabled={busy} value={active?.id ?? ""} onChange={e=>void run(async()=>{await wallet.activateWallet("moderato",e.target.value);})}><option value="">Select wallet</option>{wallets.map(w=><option key={w.id} value={w.id}>{w.label} · {w.identity.evmAddress}</option>)}</select>
      <p className="break-all">{active?.identity.evmAddress} · {active?.locked ? "Locked" : active ? "Unlocked" : "No wallet selected"}</p>
      <input aria-label="Wallet password" className={uiClass} type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/>
      <Button disabled={busy||!active} onClick={()=>void run(async()=>{await wallet.unlockWallet("moderato",active!.id,password);})}>Unlock</Button>{" "}
      <Button variant="outline" disabled={busy||!active} onClick={()=>void run(async()=>{await wallet.lockWallet(active!.id);})}>Lock</Button>
    </section>
    <section className="border rounded p-4 space-y-3"><h2 className="text-xl">Catalog and message helpers</h2>
      <label>Saved public test operation<select className={uiClass} disabled={busy} defaultValue="" onChange={e=>{const draft=drafts.current[e.target.value];if(draft){setCatalogId(tempoSeedToId(draft.order.catalogSeed));setOrderId(tempoSeedToId(draft.order.orderSeed));}}}><option value="">Select to restore IDs after reload</option>{savedKeys.map(key=><option key={key} value={key}>{key}</option>)}</select></label>
      <label>Catalog ID (raw bytes16)<input className={uiClass} value={catalogId} disabled={busy} onChange={e=>setCatalogId(e.target.value)}/></label>
      <Button variant="outline" disabled={busy} onClick={()=>setCatalogId(randomId())}>New catalog ID</Button>
      <label>Public catalog URL<input className={uiClass} value={catalogUrl} disabled={busy} onChange={e=>setCatalogUrl(e.target.value)}/></label>
      <Button disabled={busy} onClick={()=>void run(async()=>{await assertTestDeployment();const identity=await service().receivingIdentity(wallet.getWalletAdapter("moderato"),context("seller",await selectedAddress(),catalogId));selectMethod("createCatalog",[catalogId,publicKeyBytes(identity.publicKey),catalogUrl]);setMessage("Catalog arguments prepared. Choose updateCatalog to rotate an existing catalog identity, or submit createCatalog below.");})}>Prepare catalog identity and arguments</Button>
      <label>Order ID (raw bytes16)<input className={uiClass} value={orderId} disabled={busy} onChange={e=>setOrderId(e.target.value)}/></label>
      <Button variant="outline" disabled={busy} onClick={()=>setOrderId(randomId())}>New order ID</Button>
      <label>Test price in PathUSD (maximum 1)<input className={uiClass} value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)}/></label>
      <div className="flex flex-wrap gap-2">{(["buyer-order","seller-delivery","seller-refusal"] as const).map(type=><Button key={type} disabled={busy} onClick={()=>void run(async()=>prepare(type))}>Prepare / resume {type}</Button>)}</div>
      <p>Publish a catalog as seller. Prepare buyer details as buyer, approve the exact amount, then create an initial or paid order. Switch to seller for delivery/refusal and back to buyer or admin for settlement. Each message expires after 30 days.</p>
      <Button variant="outline" disabled={busy} onClick={()=>selectMethod("approve",[TEST_CONTRACT,parseUnits(amount,6).toString()],"token")}>Fill exact PathUSD approval</Button>{" "}
      <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>inspect())}>Read order, catalog, balances and escrow</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{await assertTestDeployment();const logs=await testOrderLogs("OrderMessage",orderId);const stored=await testContract.getOrder(orderId);const role=(await selectedAddress())===stored.buyer.toLowerCase() ? "buyer" : "seller";const buyerIdentity=createTempoReceivingIdentity(context("buyer",stored.buyer,orderId),publicKeyBase64(stored.buyerPublicKey)),sellerIdentity=createTempoReceivingIdentity(context("seller",stored.seller,stored.catalogId),publicKeyBase64(stored.sellerPublicKey));const order=TempoOrderContextSchema.parse({version:1,chainId:PICOMART_TEMPO_CONFIG.chainId,contractAddress:TEST_CONTRACT.toLowerCase(),orderSeed:tempoIdToSeed(orderId),catalogSeed:tempoIdToSeed(stored.catalogId),buyerIdentity,sellerIdentity});const decoded=[];for(const log of logs){const event=contractInterface.parseLog(log)!;const messageType=Number(event.args.messageType)===1 ? "buyer-order" : Number(event.args.messageType)===2 ? "seller-delivery" : "seller-refusal";const expected={messageType,sequence:1} as TempoExpectedMessage;const trusted=Number(event.args.messageType)===1 ? stored.buyerCommitment : stored.sellerCommitment;if(trusted.toLowerCase()!==event.args.commitment.toLowerCase())throw new Error("Event commitment differs from authoritative order state.");decoded.push(await service().receive(wallet.getWalletAdapter("moderato"),order,expected,role,toUtf8String(event.args.buyerEnvelope),toUtf8String(event.args.sellerEnvelope),trusted));}setResult(json(decoded));})}>Read and decrypt onchain message references</Button>
    </section>
    <section className="border rounded p-4 space-y-3"><h2 className="text-xl">All contract methods</h2>
      <select aria-label="Method target" className={uiClass} value={target} disabled={busy} onChange={e=>{const t=e.target.value as typeof target;selectMethod(t === "contract" ? "owner" : "balanceOf",t === "contract" ? [] : [active?.identity.evmAddress ?? ""],t);}}><option value="contract">Picomart contract</option><option value="token">PathUSD approval, transfer and balances</option></select>
      <select aria-label="Contract method" className={uiClass} disabled={busy} value={method} onChange={e=>{const name=e.target.value;const old=abi.getFunction(method),next=abi.getFunction(name)!;if(old && old.inputs.map(p=>p.format("full")).join()===next.inputs.map(p=>p.format("full")).join()){setMethod(name);}else{choose(next);}}}>{functions(abi).map(f=><option key={f.name} value={f.name}>{f.name} · {f.constant ? "read" : "write"}</option>)}</select>
      <p className="break-all font-mono text-sm">{fragment?.format("full")}</p>
      <label>Arguments as JSON array (integers as decimal strings; tuples as objects)<textarea rows={9} className={uiClass} disabled={busy} value={args} onChange={e=>setArgs(e.target.value)}/></label>
      {!readOnly && <label className="flex gap-2"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>I reviewed the selected wallet, method and arguments for this testnet transaction.</label>}
      <Button disabled={busy||(!readOnly&&(!ack||!active||active.locked))} onClick={()=>void run(async signal=>{const values:unknown=JSON.parse(args);if(!Array.isArray(values))throw new Error("Arguments must be a JSON array.");if(readOnly){await assertTestDeployment();const data=abi.encodeFunctionData(method,values);const returned=await testRpc.call({to:target === "contract" ? TEST_CONTRACT : TEST_TOKEN,data,from:active?.identity.evmAddress});setResult(json(namedResult(fragment!.outputs,abi.decodeFunctionResult(method,returned))));}else{await checkMessage(method,values);const intent=json({account:active?.identity.evmAddress,target,method,values});if(operation.current?.intent!==intent)operation.current={intent,id:await testOperationId(active!.identity.evmAddress,target,method,values)};const finished=await submitTestTransaction(target,method,values,signal,setTx,operation.current.id,active!.identity.evmAddress,()=>checkMessage(method,values));setTx(finished);setAck(false);setMessage(`Transaction ${finished.state}. Read state and balances to verify the result.`);}})}>{readOnly ? "Read method" : "Submit reviewed test transaction"}</Button>
      <Button variant="outline" disabled={busy||!ack||!active||active.locked||target!=="contract"||!["createOrderPaid","buyOrder"].includes(method)} onClick={()=>void run(async signal=>{const values:unknown=JSON.parse(args);if(!Array.isArray(values))throw new Error("Arguments must be a JSON array.");await checkMessage(method,values);const intent=json({account:active?.identity.evmAddress,target,method,values});if(operation.current?.intent!==intent)operation.current={intent,id:crypto.randomUUID()};const required=await testTransactions.paymentRequirements({method,args:values});setResult(json(required));if(!required.approvalRequired){setMessage("Existing allowance covers this payment; review and submit the payment separately.");return;}const receipt=await testTransactions.approvePayment({method,args:values},{operationId:operation.current.id,expectedAccount:active!.identity.evmAddress,signal,onSaved:setApproval,beforeSign:()=>checkMessage(method,values)});setApproval(receipt);setAck(false);setMessage(`Approval ${receipt.state}. Review and submit payment separately after confirmation.`);})}>Approve selected payment separately</Button>
      {approval && <pre className="whitespace-pre-wrap break-all">{json(approval)}</pre>}
      <Button variant="outline" disabled={busy||!active} onClick={()=>void run(async()=>{const values:unknown=JSON.parse(args);if(!Array.isArray(values))throw new Error("Arguments must be a JSON array.");const intent=json({account:active!.identity.evmAddress,target,method,values});operation.current={intent,id:await testOperationId(active!.identity.evmAddress,target,method,values,true)};setAck(false);setMessage("A new operation ID was created. Review again before intentionally repeating this action.");})}>Start a new intentional operation</Button>
      <p>Role, state and deadline restrictions are enforced by the deployed contract. processRefundToBuyer refunds the original payer, which may differ from the buyer. Five-day deadlines cannot be shortened here. renounceOwnership intentionally reverts. Token receive-policy scenarios require separately configured test wallets/policies.</p>
    </section>
    {busy && <p role="status">Working…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
    {tx && <section className="border rounded p-4 space-y-2"><h2 className="text-xl">Saved transaction receipt</h2><pre className="whitespace-pre-wrap break-all">{json(tx)}</pre><Button disabled={busy} variant="outline" onClick={()=>void run(async()=>{setTx(await refreshTransaction(tx.account));})}>Check saved receipt</Button><p>Receipt fee is recorded in attodollars (10^-18 USD); maximumFeeBaseUnits is in PathUSD base units (10^-6 USD). Unresolved transactions block additional submissions from the same wallet. Never retry an uncertain payment blindly.</p></section>}
    {result && <section><h2 className="text-xl">Read result / decrypted disposable test data</h2><pre className="border rounded p-3 whitespace-pre-wrap break-all">{result}</pre></section>}
  </main>;
}
