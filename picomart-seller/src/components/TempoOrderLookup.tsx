import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {marketApi,validateMarketOrder,type MarketOrder} from '@/lib/tempoMarket';
import {tempoTransactionError} from '@/lib/internalWallet/tempoTransactions';

export default function TempoOrderLookup(){
  const [id,setId]=useState(''),[order,setOrder]=useState<MarketOrder|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function lookup(){
    if(controller.current)return;
    setOrder(null);setError('');
    const orderId=id.trim().toLowerCase();
    if(!/^0x[0-9a-f]{32}$/.test(orderId)){setError('Enter a 16-byte order ID (0x followed by 32 hex characters).');return;}
    const request=new AbortController();controller.current=request;setBusy(true);
    try{
      const data=await marketApi<{order:MarketOrder}>(`/orders/${orderId}`,request.signal);
      const validated=validateMarketOrder(data.order);
      if(validated.orderId.toLowerCase()!==orderId)throw new Error('The returned order does not match the requested ID.');
      if(!request.signal.aborted)setOrder(validated);
    }catch(cause){if(!request.signal.aborted)setError(tempoTransactionError(cause));}
    finally{if(!request.signal.aborted){controller.current=null;setBusy(false);}}
  }
  return <section aria-label="Order lookup" className="rounded-xl border p-4 space-y-3">
    <h2 className="text-xl font-semibold">Order lookup</h2>
    <p className="text-sm text-muted-foreground">Read an indexed order by its contract ID.</p>
    <form className="flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();void lookup();}}>
      <input aria-label="Order ID" placeholder="0x…" disabled={busy} className="min-w-0 flex-1 rounded border bg-background p-2" value={id} onChange={event=>{setId(event.target.value);setOrder(null);setError('');}}/>
      <Button disabled={busy}>{busy?'Loading…':'Open order'}</Button>
    </form>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {order&&<div><h3 className="font-semibold mb-2">Indexed order</h3><pre className="max-h-96 overflow-auto rounded border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(order,null,2)}</pre></div>}
  </section>;
}
