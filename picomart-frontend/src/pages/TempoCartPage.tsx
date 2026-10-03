import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {formatUnits} from 'ethers';
import {ShoppingCart,QrCode,Trash2,Minus,Plus,Package} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {CardSlim} from '@/components/ui/card';
import TempoMarketShell from '@/components/TempoMarketShell';
import CatalogIdentity from '@/components/CatalogIdentity';
import TokenIcon from '@/components/TokenIcon';
import {useWallet} from '@/context/WalletContext';
import {readTempoCart,saveTempoCart,tempoSelectionKey} from '@/lib/tempoCart';
import {TEMPO_MARKET_ENABLED,checkoutIntent,catalogLink,validateSelection,type CheckoutSelection} from '@/lib/tempoMarket';

export default function TempoCartPage() {
  const wallet=useWallet();
  const [checking,setChecking]=useState(false);
  async function checkout(selection:CheckoutSelection){
    if(checking)return;setChecking(true);
    try{if(TEMPO_MARKET_ENABLED&&wallet.walletAddress)await checkoutIntent(selection,wallet.walletAddress,true);sessionStorage.setItem(tempoSelectionKey,JSON.stringify(selection));navigate('/order');}
    catch(e){setError(e instanceof Error?e.message:'Checkout could not be opened.');}finally{setChecking(false);}
  }
  const [cart,setCart]=useState<CheckoutSelection[]>(()=>{try{return readTempoCart();}catch{return [];}}),[error,setError]=useState(''),navigate=useNavigate();
  function update(next:CheckoutSelection[]) {
    try{saveTempoCart(next);setCart(next);setError('');}catch(e){setError(e instanceof Error?e.message:'Cart could not be saved.');}
  }
  function quantity(groupIndex:number,id:string,value:number){update(cart.map((group,index)=>index===groupIndex?{...group,products:group.products.map(item=>item.ProductId===id?{...item,quantity:value}:item)}:group));}
  function remove(groupIndex:number,id:string){update(cart.flatMap((group,index)=>{if(index!==groupIndex)return [group];const products=group.products.filter(item=>item.ProductId!==id);return products.length?[{...group,products}]:[];}));}
  const total=cart.reduce((sum,group)=>sum+validateSelection(group).amount,0n);
  return <TempoMarketShell title="Your Cart">
    {error&&<p role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {!cart.length&&<div className="text-center text-muted-foreground py-8"><ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50"/><p className="text-lg font-medium mb-2">Your cart is empty</p><p className="text-sm">Scan products to collect them here and order when you are ready.</p></div>}
    {cart.map((selection,index)=><CardSlim key={selection.catalog.catalogId} className="rounded-xl border p-4 space-y-4 gap-4">
      <div className="space-y-2"><CatalogIdentity seed={selection.catalog.seed}/><p className="text-xs text-muted-foreground break-all">Seller: {selection.catalog.seller}</p></div>
      <div className="space-y-4">{selection.products.map(item=><article key={item.ProductId} className="flex gap-3">
        <Link to={'/'+new URL(catalogLink(selection.catalog.seed,item.ProductId)).hash} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center" aria-label={`View ${item.Name}`}>
          {item.Image?<img src={item.Image} alt="" className="h-full w-full object-cover"/>:<Package className="h-8 w-8 text-muted-foreground"/>}
        </Link>
        <div className="min-w-0 flex-1 space-y-2"><Link className="font-medium hover:underline" to={'/'+new URL(catalogLink(selection.catalog.seed,item.ProductId)).hash}>{item.Name}</Link>
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><TokenIcon assetId={item.PriceToken} size={16}/>{formatUnits(item.Price,6)} PathUSD</div>
          <div className="flex flex-wrap items-center gap-1"><Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Decrease ${item.Name} quantity`} disabled={item.quantity<=1} onClick={()=>quantity(index,item.ProductId,item.quantity-1)}><Minus className="h-3 w-3"/></Button>
            <input type="number" min="1" max="1000000" aria-label={`${item.Name} quantity`} className="w-14 rounded-md border border-input bg-background p-1 text-center text-sm" value={item.quantity} onChange={e=>quantity(index,item.ProductId,Number(e.target.value))}/>
            <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Increase ${item.Name} quantity`} onClick={()=>quantity(index,item.ProductId,item.quantity+1)}><Plus className="h-3 w-3"/></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive ml-auto" aria-label={`Remove ${item.Name}`} onClick={()=>remove(index,item.ProductId)}><Trash2 className="h-4 w-4"/></Button>
          </div>
        </div>
      </article>)}</div>
      <div className="border-t pt-3 space-y-3"><div className="flex items-center justify-between text-sm font-semibold"><span>Catalog total</span><span>{formatUnits(validateSelection(selection).amount,6)} PathUSD</span></div>
        <Button className="w-full" size="lg" disabled={checking} onClick={()=>void checkout(selection)}><ShoppingCart className="mr-2 h-4 w-4"/>Review this catalog order</Button>
        <Button variant="ghost" className="w-full text-destructive" onClick={()=>update(cart.filter((_,n)=>n!==index))}>Remove catalog</Button>
      </div>
    </CardSlim>)}
    {!!cart.length&&<div className="border-t pt-4 space-y-4"><div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatUnits(total,6)} PathUSD</span></div><p className="text-xs text-muted-foreground">Each catalog is ordered separately. Prices are checked again before payment.</p><Button variant="destructive" size="sm" className="w-full" onClick={()=>update([])}><Trash2 className="h-4 w-4"/>Clear cart</Button></div>}
    <Link to="/scan" className="block"><Button variant="outline" className="w-full" size="lg"><QrCode className="h-4 w-4"/>Scan another product</Button></Link>
  </TempoMarketShell>;
}
