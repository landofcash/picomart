import {useState} from 'react';
import {ShoppingCart,ChevronDown,ChevronUp,Package} from 'lucide-react';
import {formatUnits} from 'ethers';
import {Button} from './ui/button';
import TokenIcon from './TokenIcon';
import CatalogIdentity from './CatalogIdentity';
import type {MarketCatalog,MarketProduct} from '@/lib/tempoMarket';

export default function TempoProductDetails({catalog,product,onAdd}:{catalog:MarketCatalog;product:MarketProduct;onAdd:()=>void}){
  const [technical,setTechnical]=useState(false),[imageFailed,setImageFailed]=useState(false);
  return <div className="space-y-4">
    <CatalogIdentity seed={catalog.seed}/>
    <div className="aspect-square overflow-hidden rounded-lg bg-muted flex items-center justify-center">
      {product.Image&&!imageFailed?<img src={product.Image} alt={product.Name} className="w-full h-full object-cover" onError={()=>setImageFailed(true)}/>:<Package className="h-20 w-20 text-muted-foreground" aria-label="Product image unavailable"/>}
    </div>
    <div className="space-y-2"><h2 className="text-xl font-semibold">{product.Name}</h2><p className="text-muted-foreground text-sm whitespace-pre-wrap">{product.Description}</p>
      <div className="flex items-center gap-2"><TokenIcon assetId={product.PriceToken} size={20}/><span className="text-2xl font-bold text-primary">{formatUnits(product.Price,6)} PathUSD</span></div>
    </div>
    <Button className="w-full" size="lg" onClick={onAdd}><ShoppingCart className="mr-2 h-5 w-5"/>Add to cart</Button>
    <Button variant="outline" className="w-full" aria-expanded={technical} onClick={()=>setTechnical(value=>!value)}>{technical?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}{technical?'Hide':'Show'} Technical Details</Button>
    {technical&&<div className="space-y-3 p-4 border rounded-lg bg-muted/50 text-xs"><p>Product seed: <span className="block font-mono break-all">{catalog.seed}</span></p><p>Item ID: <span className="block font-mono break-all">{product.ProductId}</span></p><p>Shop wallet: <span className="block font-mono break-all">{catalog.seller}</span></p><p>Catalog URL: <span className="block font-mono break-all">{catalog.catalogUrl}</span></p></div>}
  </div>;
}
