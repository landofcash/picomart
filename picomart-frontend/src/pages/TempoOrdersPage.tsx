import {useEffect,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import {formatUnits} from 'ethers';
import {Package,ShoppingBag,Loader2,AlertCircle,RefreshCw,ArrowLeft,Eye,User} from 'lucide-react';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import CopyableField from '@/components/CopyableField';
import TempoMarketShell from '@/components/TempoMarketShell';
import TempoOrderDisplay from '@/components/TempoOrderDisplay';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import {orders,statusNames,type MarketOrder} from '@/lib/tempoMarket';
import {tempoTransactionError} from '@/lib/internalWallet/tempoTransactions';

export default function TempoOrdersPage({seller=false}:{seller?:boolean}){
  const wallet=useWallet(),location=useLocation(),[params]=useSearchParams();
  const [list,setList]=useState<MarketOrder[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[counter,setCounter]=useState(0);
  const account=wallet.walletAddress?.toLowerCase(),details=seller&&location.pathname==='/order-details';
  const selected=list.find(o=>o.orderId===params.get('order'));
  useEffect(()=>{
    const c=new AbortController();setError('');setLoading(Boolean(account));setList([]);
    if(account)void orders(seller?'seller':'buyer',account,c.signal).then(value=>{if(!c.signal.aborted)setList(value);}).catch(e=>{if(!c.signal.aborted)setError(tempoTransactionError(e));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[account,seller,counter]);
  const refresh=()=>setCounter(n=>n+1);
  return <TempoMarketShell title={details?'Order Details':'My Orders'} seller={seller}>
    {!account&&<div className="text-center text-muted-foreground py-8"><Package className="h-12 w-12 mx-auto mb-4 opacity-50"/><p className="text-lg font-medium mb-2">Open your payment wallet</p><p className="text-sm">Your orders are linked to your payment wallet. Open a wallet saved on this device to see them.</p><Button asChild className="mt-4"><Link to="/wallet?returnTo=%2Forders">Open payment wallet</Link></Button></div>}
    {loading&&<div role="status" className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin mr-2"/><span>Loading orders...</span></div>}
    {error&&<div role="alert" className="p-4 border border-destructive rounded-lg bg-destructive/10"><div className="flex items-center gap-2 text-destructive"><AlertCircle className="h-5 w-5"/><div><p className="font-medium">Failed to load orders</p><p className="text-sm">{error}</p></div></div><Button variant="outline" size="sm" disabled={loading} onClick={refresh} className="mt-3"><RefreshCw className="h-4 w-4 mr-2"/>Try Again</Button></div>}
    {!loading&&!error&&account&&(details?<>
      {selected?<TempoOrderDisplay order={selected} seller onUpdated={refresh}/>:<p>Order not found in your history.</p>}
      <Button asChild variant="outline"><Link to="/my-orders"><ArrowLeft className="mr-2 h-4 w-4"/>Back to My Orders</Link></Button>
    </>:list.length?<>
      <div className="space-y-0">{list.map(o=>seller?<section key={o.orderId} className="group p-4 border rounded-lg hover:bg-accent/50 transition-colors"><div className="flex items-start gap-4"><div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary"><Package className="h-8 w-8"/></div><div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"><div className="space-y-2"><p className="text-sm text-muted-foreground">Order ID:</p><CopyableField value={o.seed??o.orderId} length={22} mdLength={22}/><OrderStatusBadge status={String(o.status)} label={statusNames[o.status]}/></div><div className="space-y-2"><p className="flex items-center gap-2 text-sm text-muted-foreground"><User className="h-4 w-4"/>Customer:</p><CopyableField value={o.buyer} length={20} mdLength={24}/><p className="font-semibold">{formatUnits(o.priceAmount,6)} PathUSD</p></div><div className="flex items-center"><Button asChild variant="outline" size="sm"><Link to={'/order-details?order='+o.orderId}><Eye className="mr-2 h-4 w-4"/>View Details</Link></Button></div></div></div></section>:<TempoOrderDisplay key={o.orderId} order={o} expanded={o.orderId===params.get('order')} onUpdated={refresh}/>)}</div>
      <div className="text-center pt-4"><Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw className="h-4 w-4 mr-2"/>Refresh Orders</Button></div>
    </>:<div className="text-center text-muted-foreground py-8"><ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-50"/><p className="text-lg font-medium mb-2">No orders yet</p><p className="text-sm">{seller?"When customers place orders for your products, they will appear here. You'll be able to track order status, manage fulfillment, and communicate with buyers.":'Your order history will appear here once you make your first purchase.'}</p></div>)}
    {!seller&&<div className="pt-4"><Link to="/" className="block w-full"><Button className="w-full" size="lg"><ArrowLeft className="mr-2 h-5 w-5"/>Back to Home</Button></Link></div>}
  </TempoMarketShell>;
}
