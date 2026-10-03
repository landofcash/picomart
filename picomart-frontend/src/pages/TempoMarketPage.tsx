import {useEffect,useState} from 'react';
import {useNavigate,useLocation} from 'react-router-dom';
import TempoMarketShell from '@/components/TempoMarketShell';
import TempoProductDetails from '@/components/TempoProductDetails';
import {marketApi,catalogIdentity,fetchCatalogProducts,parseCatalogLink,validateSelection,type MarketCatalog,type MarketProduct,type CheckoutSelection} from '@/lib/tempoMarket';
import {addTempoSelection} from '@/lib/tempoCart';

export default function TempoMarketPage(){
  const [catalog,setCatalog]=useState<MarketCatalog|null>(null),[product,setProduct]=useState<MarketProduct|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const location=useLocation(),navigate=useNavigate();
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setError('');setCatalog(null);setProduct(null);
    void (async()=>{
      if(location.pathname!=='/'||location.search||!location.hash)throw new Error('Open a product QR link.');
      const {seed,productId}=parseCatalogLink(window.location.href);
      if(!productId)throw new Error('Scan a product QR code to add a product to your cart.');
      const {catalog:loadedCatalog}=await marketApi<{catalog:MarketCatalog}>('/catalogs/'+seed,controller.signal);
      catalogIdentity(loadedCatalog);
      if(loadedCatalog.seed!==seed)throw new Error('The returned catalog does not match this QR link.');
      const products=await fetchCatalogProducts(loadedCatalog.catalogUrl,controller.signal),loadedProduct=products.find(p=>p.ProductId===productId);
      if(!loadedProduct)throw new Error('This product is no longer listed in the catalog.');
      if(!controller.signal.aborted){setCatalog(loadedCatalog);setProduct(loadedProduct);}
    })().catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[location.pathname,location.search,location.hash]);
  function add(){
    if(!catalog||!product)return;
    try{const selection:CheckoutSelection={catalog,products:[{...product,quantity:1}]};validateSelection(selection);addTempoSelection(selection);navigate('/cart');}
    catch(e){setError(e instanceof Error?e.message:'The product could not be added.');}
  }
  return <TempoMarketShell title="Product Details">
    {busy&&<p role="status">Loading product...</p>}{error&&<p role="alert">{error}</p>}
    {catalog&&product&&<TempoProductDetails key={product.ProductId} catalog={catalog} product={product} onAdd={add}/>}
  </TempoMarketShell>;
}
