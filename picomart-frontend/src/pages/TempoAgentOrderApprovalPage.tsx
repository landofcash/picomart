import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {useEffect,useRef,useState} from 'react';
import {formatUnits} from 'viem';
import {Link,useLocation} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import TempoWalletPanel from '@/components/TempoWalletPanel';
import {Button} from '@/components/ui/button';
import {installedAgentProfile,parseAgentHandoff,resolveTempoAgent,executeTempoAgentOrder,type TempoAgentIntent} from '@/lib/agentOrders/tempoAgentClient';
import {assertQuoteExecutable,quoteExecutionDeadlineMilliseconds} from '@/lib/agentOrders/quoteExpiry';
import {agentProfileStorageKey,agentProfileChangedEvent} from '@/lib/agentOrders/tempoAgentProfile';
import TempoMarketShell from '@/components/TempoMarketShell';
export default function TempoAgentOrderApprovalPage(){
  const wallet=useWallet(),resolution=useRef<Promise<TempoAgentIntent>|null>(null),trustRevision=useRef(0);
  const {hash:routeHash}=useLocation();
  const [intent,setIntent]=useState<TempoAgentIntent|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[hash,setHash]=useState(''),[expired,setExpired]=useState(false);
  useEffect(()=>{
    const invalidate=()=>{trustRevision.current++;resolution.current=null;setIntent(null);setError('Trust settings changed. Request a new approval link.');};
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
  async function approve(){if(!intent||!wallet.walletAdapter||busy)return;setBusy(true);setError('');
    try{assertQuoteExecutable(intent.quote);setHash(await executeTempoAgentOrder(intent,wallet.walletAdapter));setIntent(null);}catch(e){setError(e instanceof Error?e.message:'Payment was not completed.');}finally{setBusy(false);}}
  return <TempoMarketShell title="Approve agent order">
    <p>Review the order and delivery details, then approve payment with your wallet.</p>
    <TempoWalletPanel/>
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {!intent&&!error&&!hash&&<p role="status">Verifying the signed quote and private delivery handoff…</p>}
    {intent&&<><h2 className="text-lg font-semibold">Products</h2><ul className="space-y-2">{intent.quote.items.map(i=><li key={i.productId}>{i.name} × {i.quantity} — {formatUnits(BigInt(i.lineAmount),6)} PathUSD</li>)}</ul>
      <p className="font-semibold">Total: {formatUnits(BigInt(intent.quote.payment.amount),6)} PathUSD</p>
      <h2 className="text-lg font-semibold">Delivery</h2>{intent.delivery.noPhysicalDelivery?<p>No physical delivery</p>:<div className="space-y-1"><p>{intent.delivery.fullName}</p><p>{intent.delivery.address}, {intent.delivery.city}, {intent.delivery.postalCode}, {intent.delivery.country}</p><p>{intent.delivery.phone} · {intent.delivery.email}</p></div>}
      {intent.delivery.deliveryComments&&<p>{intent.delivery.deliveryComments}</p>}
      <p className="text-sm text-muted-foreground">Your local agent can see details you supply to it. The quote service receives ciphertext without its decryption key. The seller receives the encrypted order through the private message service.</p>
      {expired&&<p role="alert">This quote is too close to expiry. Request a new quote.</p>}
      <Button disabled={busy||expired||wallet.walletKind!=='internal'||wallet.walletLocked||!wallet.walletCanTransact||wallet.network!== PICOMART_TEMPO_CONFIG.network} onClick={()=>void approve()}>{busy?'Preparing and submitting…':'Approve and pay'}</Button>
      <p className="text-sm">Network fees and any token allowance are reviewed separately by the wallet.</p></>}
    {hash&&<div role="status"><p>Order submitted. The agent can check public settlement confirmation.</p><a href={`https://explore.moderato.tempo.xyz/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a><p><Link to="/orders">Open orders and recovery</Link></p></div>}
  </TempoMarketShell>;
}
