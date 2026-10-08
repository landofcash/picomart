import {getCurrency,PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {useEffect,useRef,useState} from 'react';
import {formatUnits} from 'viem';
import {Link,useLocation} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import TempoWalletPanel from '@/components/TempoWalletPanel';
import {Button} from '@/components/ui/button';
import {installedAgentProfile,parseAgentHandoff,resolveTempoAgent,executeTempoAgentOrder,prepareTempoAgentOrder,type PreparedTempoAgentOrder,type TempoAgentIntent} from '@/lib/agentOrders/tempoAgentClient';
import {assertQuoteExecutable,quoteExecutionDeadlineMilliseconds} from '@/lib/agentOrders/quoteExpiry';
import {agentProfileStorageKey,agentProfileChangedEvent} from '@/lib/agentOrders/tempoAgentProfile';
import TempoMarketShell from '@/components/TempoMarketShell';
import TempoPaymentCosts,{paymentQuoteInsufficient} from '@/components/TempoPaymentCosts';
import {marketTransactions} from '@/lib/tempoMarket';
import type {TempoTransactionRecord} from '@/lib/internalWallet/tempoTransactions';
export default function TempoAgentOrderApprovalPage(){
  const wallet=useWallet(),resolution=useRef<Promise<TempoAgentIntent>|null>(null),trustRevision=useRef(0);
  const {hash:routeHash}=useLocation();
  const [prepared,setPrepared]=useState<PreparedTempoAgentOrder|null>(null),[receipt,setReceipt]=useState<TempoTransactionRecord|null>(null),[needsReview,setNeedsReview]=useState(false);
  const controller=useRef<AbortController|null>(null),running=useRef(false);
  const [intent,setIntent]=useState<TempoAgentIntent|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[hash,setHash]=useState(''),[expired,setExpired]=useState(false);
  useEffect(()=>{
    const invalidate=()=>{trustRevision.current++;resolution.current=null;setIntent(null);setPrepared(null);controller.current?.abort();setError('Trust settings changed. Request a new approval link.');};
    const storage=(event:StorageEvent)=>{if(event.key===agentProfileStorageKey||event.key===null)invalidate();};
    window.addEventListener(agentProfileChangedEvent,invalidate);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener(agentProfileChangedEvent,invalidate);window.removeEventListener('storage',storage);};
  },[routeHash]);
  useEffect(()=>{let live=true;const revision=trustRevision.current;
    if(window.location.hash.length>1){resolution.current=null;setIntent(null);setExpired(false);setError('');setHash('');}
    if(!resolution.current){try{const handoff=parseAgentHandoff(window.location.hash);history.replaceState(history.state,'',window.location.pathname+window.location.search);
      resolution.current=resolveTempoAgent(handoff,installedAgentProfile());}catch(e){history.replaceState(history.state,'',window.location.pathname+window.location.search);setError(e instanceof Error?e.message:'Invalid approval link.');}}
    void resolution.current?.then(value=>{if(live&&revision===trustRevision.current)setIntent(value);}).catch(()=>{if(live&&revision===trustRevision.current)setError('The quote or private handoff could not be verified. Request a new approval link.');});
    return()=>{live=false;};
  },[routeHash]);
  useEffect(()=>{if(!intent)return;const remaining=quoteExecutionDeadlineMilliseconds(intent.quote)-Date.now();if(remaining<=0){setExpired(true);return;}const timer=setTimeout(()=>setExpired(true),remaining);return()=>clearTimeout(timer);},[intent]);
  useEffect(()=>{
    setPrepared(null);setReceipt(null);setNeedsReview(false);controller.current?.abort();
    return()=>controller.current?.abort();
  },[wallet.walletAddress,wallet.walletLocked,wallet.network,routeHash]);
  async function run(action:(signal:AbortSignal)=>Promise<void>){
    if(running.current)return;
    running.current=true;setBusy(true);setError('');
    const abort=new AbortController();controller.current=abort;
    try{await action(abort.signal);}catch(e){if(!abort.signal.aborted){setNeedsReview(true);setError(e instanceof Error?e.message:'Payment was not completed.');}}
    finally{running.current=false;setBusy(false);}
  }
  async function prepare(signal:AbortSignal){
    if(!intent||!wallet.walletAdapter)return;
    const next=await prepareTempoAgentOrder(intent,wallet.walletAdapter,signal);
    signal.throwIfAborted();setPrepared(next);setNeedsReview(false);
  }
  function accept(tx:TempoTransactionRecord){
    setReceipt(tx);
    if(tx.state==='confirmed'&&tx.method==='createOrderPaid'){setHash(tx.hash);setIntent(null);setPrepared(null);}
    else if(tx.state==='reverted')setError('The transaction reverted. Review its saved receipt in order recovery.');
  }
  async function checkStatus(signal:AbortSignal){
    if(!prepared)return;
    const payment=await marketTransactions.recoverOperation(prepared.draft.account,prepared.draft.operationId);
    signal.throwIfAborted();
    if(payment&&payment.state!=='not-submitted'){accept(payment);return;}
    const approval=await marketTransactions.recoverOperation(prepared.draft.account,prepared.draft.operationId+':approval');
    signal.throwIfAborted();
    if(approval&&approval.state!=='not-submitted')accept(approval);
    if(!approval||approval.state==='confirmed'||approval.state==='not-submitted')await prepare(signal);
  }
  async function approve(signal:AbortSignal){if(!intent||!prepared||!wallet.walletAdapter)return;
    assertQuoteExecutable(intent.quote);
    const tx=await executeTempoAgentOrder(prepared,wallet.walletAdapter,signal,(tx)=>{if(!signal.aborted)setReceipt(tx);});
    signal.throwIfAborted();accept(tx);
  }
  const currency=intent?getCurrency(intent.quote.payment.asset):PICOMART_TEMPO_CONFIG.defaultPaymentToken;
  const total=intent?`${formatUnits(BigInt(intent.quote.payment.amount),currency.decimals)} ${currency.symbol}`:'';
  const pending=receipt?.state==='uncertain';
  return <TempoMarketShell title="Approve agent order">
    <p>Review the order and delivery details, then approve payment with your wallet.</p>
    <TempoWalletPanel/>
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {!intent&&!error&&!hash&&<p role="status">Verifying the signed quote and private delivery handoff…</p>}
    {intent&&<><h2 className="text-lg font-semibold">Products</h2><ul className="space-y-2">{intent.quote.items.map(i=><li key={i.productId}>{i.name} × {i.quantity} — {formatUnits(BigInt(i.lineAmount),currency.decimals)} {currency.symbol}</li>)}</ul>
      <p className="font-semibold">Total: {total}</p>
      <h2 className="text-lg font-semibold">Delivery</h2>{intent.delivery.noPhysicalDelivery?<p>No physical delivery</p>:<div className="space-y-1"><p>{intent.delivery.fullName}</p><p>{intent.delivery.address}, {intent.delivery.city}, {intent.delivery.postalCode}, {intent.delivery.country}</p><p>{intent.delivery.phone} · {intent.delivery.email}</p></div>}
      {intent.delivery.deliveryComments&&<p>{intent.delivery.deliveryComments}</p>}
      <p className="text-sm text-muted-foreground">Your local agent can see details you supply to it. The quote service receives ciphertext without its decryption key. The seller receives the encrypted order through the private message service.</p>
      {expired&&<p role="alert">This quote is too close to expiry. Request a new quote.</p>}
      {prepared&&!needsReview&&<TempoPaymentCosts quote={prepared.cost}/>}
      {receipt&&receipt.state!=='confirmed'&&<p role="status">{receipt.state==='uncertain'?'Payment processing is awaiting confirmation. Check the saved transaction before continuing.':`Transaction ${receipt.state}.`}</p>}
      <Button disabled={busy||(expired&&!pending)||wallet.walletKind!=='internal'||wallet.walletLocked||!wallet.walletCanTransact||wallet.network!==PICOMART_TEMPO_CONFIG.network||(!pending&&!needsReview&&prepared!==null&&paymentQuoteInsufficient(prepared.cost))||receipt?.state==='reverted'} onClick={()=>void run(pending?checkStatus:prepared&&!needsReview?approve:prepare)}>{busy?'Processing payment...':pending?'Check payment status':prepared&&!needsReview?`Pay ${total}`:'Prepare payment'}</Button>
      <p className="text-sm">Review the order and fee limit, then confirm payment once. Any required token authorization is handled during payment.</p></>}
    {receipt&&!hash&&<Link to="/orders">Open orders and recovery</Link>}
    {hash&&<div role="status"><p>Order placed. Payment confirmed. The agent can check public settlement confirmation.</p><a href={`https://explore.moderato.tempo.xyz/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a><p><Link to="/orders">Open orders and recovery</Link></p></div>}
  </TempoMarketShell>;
}
