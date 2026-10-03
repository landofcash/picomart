import {useEffect,useRef,useState} from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {formatUnits} from 'ethers';
import {Wallet,CheckCircle2,Loader2,ArrowLeft} from 'lucide-react';
import {useWallet} from '@/context/WalletContext';
import {useTempoCheckoutDetails} from '@/context/TempoCheckoutDetails';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import TempoMarketShell from '@/components/TempoMarketShell';
import TempoPrivateMessage from '@/components/TempoPrivateMessage';
import type {TempoMessagePayload} from '@picomart/order-protocol/tempo-protocol';
import TokenIcon from '@/components/TokenIcon';
import CatalogIdentity from '@/components/CatalogIdentity';
import CopyableField from '@/components/CopyableField';
import {DeliveryInfoForm,type DeliveryInfo} from '@/components/DeliveryInfoForm';
import {tempoSelectionKey,removePaidSelection} from '@/lib/tempoCart';
import {TEMPO_MARKET_ENABLED,validateCheckoutDraft,validateSelection,selectionHash,checkoutIntent,loadCheckout,commerceService,prepareCheckout,previewPreparedMessage,checkoutCall,submitCheckout,marketTransactions,type CheckoutSelection,type CheckoutDraft} from '@/lib/tempoMarket';
import {tempoWalletRevision,assertTempoWalletRevision} from '@/lib/internalWallet/providers/tempoInternalWalletProvider';
import {tempoTransactionError,type TempoTransactionRecord} from '@/lib/internalWallet/tempoTransactions';

const blank:DeliveryInfo={fullName:'',address:'',city:'',postalCode:'',country:'',phone:'',email:'',deliveryComments:'',noPhysicalDelivery:false};
export default function TempoCheckoutPage({stage='review'}:{stage?:'review'|'payment'}){
  const navigate=useNavigate(),wallet=useWallet(),{details,saveDetails}=useTempoCheckoutDetails();
  const [selection]=useState<CheckoutSelection|null>(()=>{try{return JSON.parse(sessionStorage.getItem(tempoSelectionKey)??'null');}catch{return null;}});
  let amount=0n,invalid='',key='';try{if(selection){amount=validateSelection(selection).amount;key=wallet.walletAddress+':'+selectionHash(selection);}}catch(e){invalid=tempoTransactionError(e);}
  const delivery=details?.key===key?details.delivery:blank;
  const [id,setId]=useState(''),[draft,setDraft]=useState<CheckoutDraft|null>(null),[preview,setPreview]=useState<TempoMessagePayload|null>(null),[ready,setReady]=useState(false),[approvalRequired,setApprovalRequired]=useState(true);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(''),[receipt,setReceipt]=useState<TempoTransactionRecord|null>(null);
  const running=useRef(false),controller=useRef<AbortController|null>(null);
  function accept(tx:TempoTransactionRecord|null){
    setReceipt(tx);
    if(tx?.state==='confirmed'&&tx.method==='createOrderPaid'&&selection){removePaidSelection(selection,tx.hash);setProgress('Payment successful!');}
    else if(tx?.state==='uncertain')throw new Error('Your transaction is still being confirmed. Try Again checks the same transaction.');
    else if(tx?.state==='reverted')throw new Error('The transaction was not successful. No new payment has been submitted.');
  }
  useEffect(()=>{
    let live=true;setId('');setDraft(null);setReady(false);setPreview(null);setReceipt(null);setError('');setProgress('');setLoading(Boolean(selection&&wallet.walletAddress&&!invalid));
    if(selection&&wallet.walletAddress&&!invalid)void (async()=>{
      const next=await checkoutIntent(selection,wallet.walletAddress!);const saved=await loadCheckout(wallet.walletAddress!,next);
      if(saved){validateCheckoutDraft(saved,selection);if(saved.method!=='createOrderPaid')throw new Error('This saved order uses a different payment flow. Inspect it in contract diagnostics.');}
      const tx=saved?await marketTransactions.recoverOperation(wallet.walletAddress!,saved.operationId):null;
      if(live){setId(next);setDraft(saved??null);accept(tx);}
    })().catch(e=>{if(live)setError(tempoTransactionError(e));}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;controller.current?.abort();};
    // The selected wallet and immutable cart snapshot define the payment operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,wallet.walletLocked]);
  async function run(action:()=>Promise<void>){
    if(running.current)return;running.current=true;setBusy(true);setError('');controller.current=new AbortController();
    try{await action();}catch(e){setError(tempoTransactionError(e));}finally{setBusy(false);running.current=false;}
  }
  async function prepare(){
    const revision=tempoWalletRevision();
    const hasMessage=draft&&await commerceService().hasPreparedOperation(draft.order,{messageType:'buyer-order',sequence:1});
    if(draft&&!hasMessage&&!valid)throw new Error('Complete delivery information before signing this order.');
    const d=hasMessage?draft!:await prepareCheckout(wallet.walletAdapter!,selection!,delivery as unknown as Record<string,unknown>,id,'createOrderPaid');
    assertTempoWalletRevision(revision);setDraft(d);
    const decoded=await previewPreparedMessage(wallet.walletAdapter!,d.order,'buyer-order');
    const requirements=await marketTransactions.paymentRequirements(await checkoutCall(wallet.walletAdapter!,d));
    assertTempoWalletRevision(revision);setApprovalRequired(requirements.approvalRequired);setPreview(decoded);setReady(true);setProgress('Order signed and ready for payment.');
  }
  async function pay(){
    const revision=tempoWalletRevision();
    const tx=await marketTransactions.recoverOperation(wallet.walletAddress!,draft!.operationId);
    assertTempoWalletRevision(revision);
    if(tx&&tx.state!=='not-submitted'){accept(tx);return;}
    const requirements=await marketTransactions.paymentRequirements(await checkoutCall(wallet.walletAdapter!,draft!));
    if(requirements.approvalRequired){
      const approval=await submitCheckout(wallet.walletAdapter!,draft!,selection!,true,controller.current?.signal);
      assertTempoWalletRevision(revision);accept(approval);
      setApprovalRequired((await marketTransactions.paymentRequirements(await checkoutCall(wallet.walletAdapter!,draft!))).approvalRequired);
      setProgress('PathUSD approved. Proceed with Payment to complete your order.');
    }else {const payment=await submitCheckout(wallet.walletAdapter!,draft!,selection!,false,controller.current?.signal);assertTempoWalletRevision(revision);accept(payment);}
  }
  const valid=delivery.noPhysicalDelivery||(['fullName','address','city','postalCode','country','phone','email'] as const).every(field=>delivery[field].trim())&&/\S+@\S+\.\S+/.test(delivery.email);
  const usable=TEMPO_MARKET_ENABLED&&wallet.walletAdapter&&!wallet.walletLocked&&id&&!loading;
  const success=receipt?.state==='confirmed'&&receipt.method==='createOrderPaid';
  if(!selection)return <Navigate to="/cart" replace/>;
  if(invalid)return <TempoMarketShell title="Order"><p role="alert">{invalid}</p><Link to="/cart">Back to Cart</Link></TempoMarketShell>;
  return <TempoMarketShell title={stage==='review'?'Order':'Pay with Crypto'}>
    <Card><CardHeader><CardTitle className="text-lg">Order Summary</CardTitle></CardHeader><CardContent className="space-y-4">
      <CatalogIdentity seed={selection.catalog.seed}/><CopyableField value={selection.catalog.seller} length={20} mdLength={24}/>
      {selection.products.map(p=><div className="flex justify-between items-center text-sm gap-2" key={p.ProductId}><span className="font-medium">{p.Name}<span className="text-muted-foreground ml-2">? {p.quantity}</span></span><span className="flex items-center gap-2"><TokenIcon assetId={p.PriceToken} size={16}/>{formatUnits(BigInt(p.Price)*BigInt(p.quantity),6)} PathUSD</span></div>)}
      <div className="pt-4 border-t font-bold">Total: {formatUnits(amount,6)} PathUSD</div>
    </CardContent></Card>
    {stage==='review'?<>
      <DeliveryInfoForm deliveryInfo={delivery} onDeliveryInfoChange={value=>saveDetails({key,delivery:value})}/>
      <Card><CardHeader><CardTitle className="text-lg">Payment Method</CardTitle></CardHeader><CardContent className="space-y-3"><Button className="w-full" size="lg" disabled={!valid} onClick={()=>navigate('/pay-crypto')}><Wallet className="mr-2 h-5 w-5"/>Pay with Crypto</Button>{!valid&&<p className="text-xs text-muted-foreground text-center">Please complete all required fields to proceed</p>}</CardContent></Card>
    </>:<>
      {preview&&!success&&<TempoPrivateMessage message={preview}/>}
      {loading&&<p role="status" className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin"/>Loading payment...</p>}
      {success?<div className="text-center space-y-4"><CheckCircle2 className="mx-auto h-12 w-12 text-green-600"/><p className="font-semibold">Payment successful!</p><Button className="w-full" size="lg" onClick={()=>navigate('/')}>Return to Home</Button></div>:<div className="space-y-3">
        {!wallet.walletAddress||wallet.walletLocked?<Button className="w-full" size="lg" asChild><Link to="/wallet"><Wallet className="mr-2 h-5 w-5"/>Open Wallet</Link></Button>:<>
          {!ready?<Button className="w-full" size="lg" disabled={!usable||busy||(!draft&&!valid)} onClick={()=>void run(prepare)}><Wallet className="mr-2 h-5 w-5"/>{busy?'Signing...':error?'Try Again':'Sign Order Seed'}</Button>:<Button className="w-full" size="lg" disabled={!usable||busy} onClick={()=>void run(pay)}><Wallet className="mr-2 h-5 w-5"/>{busy?'Processing...':error?'Try Again':approvalRequired?'Approve PathUSD':'Proceed with Payment'}</Button>}
          {!ready&&!draft&&!valid&&<Link className="block underline text-sm" to="/order">Complete delivery information</Link>}
          {ready&&approvalRequired&&<p className="text-xs text-muted-foreground">Approve the exact order amount, then complete payment. Each transaction includes a network fee.</p>}
        </>}
      </div>}
      {!success&&progress&&<p role="status" className="text-sm">{progress}</p>}{error&&<p role="alert" className="rounded border border-destructive bg-destructive/10 p-3 text-sm">{error}</p>}
      <Link to="/order" className="block"><Button variant="outline" className="w-full" disabled={busy}><ArrowLeft className="mr-2 h-4 w-4"/>Back to Order</Button></Link>
    </>}
  </TempoMarketShell>;
}
