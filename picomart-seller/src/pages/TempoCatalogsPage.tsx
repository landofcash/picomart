import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {formatUnits,hexlify,keccak256,toUtf8Bytes} from 'ethers';
import {get,set} from 'idb-keyval';
import {tempoIdToSeed} from '@picomart/order-protocol/tempo-protocol';
import {PackageSearch,RefreshCw,Key,CloudUpload,CheckCircle2,QrCode,Trash2,Store} from 'lucide-react';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import CopyableField from '@/components/CopyableField';
import TokenIcon from '@/components/TokenIcon';
import TempoMarketShell from '@/components/TempoMarketShell';
import TempoActionDialog from '@/components/TempoActionDialog';
import {TEMPO_MARKET_ENABLED,marketTransactions,catalogs,fetchCatalogProducts,receivingContext,commerceService,verifyMarketDeployment,type MarketCatalog,type MarketProduct} from '@/lib/tempoMarket';
import {tempoWalletRevision,assertTempoWalletRevision} from '@/lib/internalWallet/providers/tempoInternalWalletProvider';
import {tempoTransactionError,type TempoContractCall,type TempoTransactionRecord} from '@/lib/internalWallet/tempoTransactions';

export default function TempoCatalogsPage({embedded=false}:{embedded?:boolean}){
  const wallet=useWallet(),location=useLocation(),account=wallet.walletAddress?.toLowerCase();
  const [list,setList]=useState<MarketCatalog[]>([]),[url,setUrl]=useState((location.state as {url?:string}|null)?.url??''),[products,setProducts]=useState<MarketProduct[]|null>(null);
  const [call,setCall]=useState<TempoContractCall|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[counter,setCounter]=useState(0),[confirm,setConfirm]=useState(false),[receipt,setReceipt]=useState<TempoTransactionRecord|null>(null);
  const running=useRef(false),controller=useRef<AbortController|null>(null);
  useEffect(()=>{
    const c=new AbortController();setList([]);setLoading(Boolean(account));setError('');
    if(embedded&&account)void catalogs(account,c.signal).then(value=>{if(!c.signal.aborted)setList(value);}).catch(e=>{if(!c.signal.aborted)setError(tempoTransactionError(e));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});else setLoading(false);
    return()=>c.abort();
  },[account,counter,embedded]);
  useEffect(()=>{setCall(null);setProducts(null);setReceipt(null);setConfirm(false);controller.current?.abort();},[url,account,wallet.network]);
  useEffect(()=>{if(wallet.walletLocked){setCall(null);setProducts(null);setReceipt(null);setConfirm(false);controller.current?.abort();}},[wallet.walletLocked]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function run(work:()=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setError('');controller.current=new AbortController();try{await work();}catch(e){setError(tempoTransactionError(e));}finally{running.current=false;setBusy(false);}}
  const canSign=TEMPO_MARKET_ENABLED&&account&&wallet.walletAdapter;
  const usable=canSign&&!wallet.walletLocked;
  async function prepare(){
    const revision=tempoWalletRevision();await verifyMarketDeployment();await fetchCatalogProducts(url,controller.current?.signal);
    const key='picomart_tempo_catalog_intent_'+account+'_'+keccak256(toUtf8Bytes(url));
    if(!navigator.locks)throw new Error('Web Locks are required for catalog recovery.');
    const id=await navigator.locks.request(key,async()=>{let saved=await get<string>(key);if(!saved){saved=hexlify(crypto.getRandomValues(new Uint8Array(16)));await set(key,saved);}return saved;});
    const identity=await commerceService().receivingIdentity(wallet.walletAdapter!,receivingContext('seller',account!,tempoIdToSeed(id)));
    assertTempoWalletRevision(revision);controller.current?.signal.throwIfAborted();setCall({method:'createCatalog',args:[id,hexlify(Uint8Array.from(atob(identity.publicKey),c=>c.charCodeAt(0))),url]});
  }
  async function publish(){
    const revision=tempoWalletRevision();
    if(!call||String(call.args[2])!==url)throw new Error('Catalog changed. Fetch and review it again.');
    const tx=await marketTransactions.sendContract(call,{operationId:'catalog:'+call.args[0]+':'+call.method+':'+keccak256(toUtf8Bytes(url)).slice(2,14),expectedAccount:account!,signal:controller.current?.signal,beforeSign:async()=>{await fetchCatalogProducts(url,controller.current?.signal);}});
    assertTempoWalletRevision(revision);if(controller.current?.signal.aborted)return;
    setReceipt(tx);if(tx.state==='confirmed')setConfirm(false);else throw new Error('Catalog transaction '+tx.state+'. Retry checks the same submission.');
  }
  if(embedded)return <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><PackageSearch className="h-5 w-5"/>My Product Catalogs{list.length?' ('+list.length+')':''}</CardTitle><Button variant="outline" size="icon" aria-label="Refresh catalogs" disabled={busy||loading} onClick={()=>setCounter(n=>n+1)}><RefreshCw className="h-4 w-4"/></Button></CardHeader><CardContent className="space-y-4">
    {loading&&<p role="status">Loading catalogs...</p>}{error&&<p role="alert">{error}</p>}{!loading&&!error&&!list.length&&<div className="text-center py-8 text-muted-foreground"><PackageSearch className="h-12 w-12 mx-auto mb-4"/><p>No catalogs yet</p><Link className="underline" to="/edit-product-catalogue">Create your first catalog</Link></div>}
    {list.map(c=><div key={c.catalogId} className="rounded-lg border p-4 space-y-3"><CopyableField value={c.seed} length={22} mdLength={22}/><a className="block text-sm underline break-all" href={c.catalogUrl} target="_blank" rel="noreferrer">{c.catalogUrl}</a><div className="flex gap-2"><Button asChild variant="outline" size="sm"><Link to={'/print-qr-codes?catalog='+c.seed}><QrCode className="h-4 w-4"/>Print QR codes</Link></Button><Button asChild variant="outline" size="sm"><Link to={'/storefronts?catalog='+c.seed} aria-label="Create storefront from this catalog"><Store className="h-4 w-4"/></Link></Button><Button variant="outline" size="sm" aria-label="Delete catalog" disabled={!usable||busy} onClick={()=>{if(window.confirm('Are you sure you want to delete this catalog? This action cannot be undone.'))void run(async()=>{const tx=await marketTransactions.sendContract({method:'deleteCatalog',args:[c.catalogId]},{operationId:'catalog:'+c.catalogId+':delete',expectedAccount:account!,signal:controller.current?.signal});if(tx.state!=='confirmed')throw new Error('Deletion '+tx.state+'. Try again checks the same transaction.');setCounter(n=>n+1);});}}><Trash2 className="h-4 w-4"/></Button></div></div>)}
  </CardContent></Card>;
  return <TempoMarketShell title="Add Product Catalog" seller>
    <Card><CardHeader><CardTitle>Fetch &amp; Review Product Catalog</CardTitle></CardHeader><CardContent className="space-y-6">
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{const revision=tempoWalletRevision();const loaded=await fetchCatalogProducts(url,controller.current?.signal);assertTempoWalletRevision(revision);setProducts(loaded);});}}><label className="block text-sm font-medium">Catalog URL<input type="url" required disabled={busy} className="block w-full rounded border p-2 bg-background mt-2" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/products.json"/></label><Button disabled={busy}>{busy?'Loading...':'Fetch & Review Catalog'}</Button></form>
      {products&&<div className="space-y-4"><h3 className="font-semibold">Preview ({products.length} products)</h3><p className="text-sm text-muted-foreground">Catalog payment token: <strong>PathUSD</strong></p>{products.map(p=><div key={p.ProductId} className="p-4 border rounded-lg flex items-start gap-4"><img src={p.Image} alt={p.Name} className="w-16 h-16 object-cover rounded-md"/><div className="flex-1 min-w-0"><h4 className="font-medium">{p.Name}</h4><p className="text-sm text-muted-foreground line-clamp-2">{p.Description}</p><p className="mt-2 flex items-center gap-2"><TokenIcon assetId={p.PriceToken}/>{formatUnits(p.Price,6)} PathUSD</p></div></div>)}
        <div className="space-y-4 border-t pt-6"><h3 className="font-semibold">Upload Process</h3><div className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-lg"><div><h4 className="font-medium">1. Sign Seed</h4><p className="text-sm text-muted-foreground">Generate and sign a unique seed for your catalog</p>{call&&<p className="text-xs break-all mt-2">Seed: {tempoIdToSeed(String(call.args[0]))}</p>}</div><Button disabled={!canSign||busy||!!call} onClick={()=>void run(prepare)}>{call?<><CheckCircle2 className="mr-2 h-4 w-4"/>Signed</>:<><Key className="mr-2 h-4 w-4"/>Sign Seed</>}</Button></div><div className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-lg"><div><h4 className="font-medium">2. Upload to Picomart</h4><p className="text-sm text-muted-foreground">Store your catalog link on the blockchain</p></div><Button disabled={!usable||busy||!call} onClick={()=>setConfirm(true)}><CloudUpload className="mr-2 h-4 w-4"/>Submit to Picomart</Button></div>{call&&<Button variant="outline" className="w-full" disabled={busy} onClick={()=>{setCall(null);setProducts(null);setReceipt(null);}}>Reset Process</Button>}</div>
      </div>}
      {error&&!confirm&&<p role="alert" className="text-destructive">{error}</p>}
    </CardContent></Card>
    {confirm&&<TempoActionDialog title="Confirm Catalog Submission" busy={busy} onClose={()=>setConfirm(false)}><p>You are about to publish {products?.length} products to Picomart.</p><p className="break-all text-sm">{url}</p>{error&&<p role="alert" className="text-destructive">{error}</p>}<Button disabled={!usable||busy} onClick={()=>void run(publish)}>{busy?'Submitting...':'Confirm & Submit'}</Button></TempoActionDialog>}
    {receipt?.state==='confirmed'&&<TempoActionDialog title="Catalog Published Successfully" busy={false} onClose={()=>setReceipt(null)}><p>Your catalog is ready. Print QR codes to start receiving orders.</p><Button asChild><Link to={'/print-qr-codes?catalog='+tempoIdToSeed(String(call!.args[0]))}>Print QR Codes</Link></Button><Button asChild variant="outline"><Link to="/">Return to Dashboard</Link></Button></TempoActionDialog>}
  </TempoMarketShell>;
}
