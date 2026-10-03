import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {ArrowLeft,Printer,QrCode,Eye} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import ProductQRCodeCard from '@/components/ProductQRCodeCard';
import {catalogs,fetchCatalogProducts,type MarketCatalog,type MarketProduct} from '@/lib/tempoMarket';
import {useWallet} from '@/context/WalletContext';

export default function PrintQRCodesPage(){
  const [params,setParams]=useSearchParams(),{walletAddress}=useWallet();
  const [list,setList]=useState<MarketCatalog[]>([]),[products,setProducts]=useState<MarketProduct[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const seed=params.get('catalog')??'';
  useEffect(()=>{const controller=new AbortController();setBusy(true);setProducts([]);setError('');
    void catalogs(walletAddress?.toLowerCase(),controller.signal).then(async entries=>{
      if(controller.signal.aborted)return;setList(entries);
      if(seed){const catalog=entries.find(item=>item.seed===seed);if(!catalog)throw new Error('Catalog is not available for this wallet.');const items=await fetchCatalogProducts(catalog.catalogUrl,controller.signal);if(!controller.signal.aborted)setProducts(items);}
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[seed,walletAddress]);
  return <main className="px-4 py-8 print:p-0">
    <Card className="w-full max-w-7xl mx-auto mb-6 print:hidden"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-base sm:text-lg"><QrCode className="h-6 w-6"/>Print QR Code Stickers ({products.length} products)</CardTitle><div className="flex gap-2"><Link to="/"><Button variant="outline"><ArrowLeft className="h-4 w-4"/>Back</Button></Link><Button disabled={busy||!products.length} onClick={()=>window.print()}><Printer className="h-4 w-4"/>Print</Button></div></div></CardHeader>
      <CardContent className="space-y-4"><label className="block text-sm font-medium">Catalog<select className="block w-full rounded-md border bg-background p-2 mt-1" value={seed} onChange={e=>setParams(e.target.value?{catalog:e.target.value}:{})}><option value="">Select a catalog</option>{list.map(c=><option key={c.catalogId} value={c.seed}>{c.seed}</option>)}</select></label>
      {seed&&<div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 p-4 rounded-lg flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-blue-900">Product Demo Catalog</h3><p className="text-sm text-blue-700">Preview how your products look to customers.</p></div><a href={'https://picomart.zkbytes.com/'+seed} target="_blank" rel="noreferrer"><Button variant="outline"><Eye className="h-4 w-4"/>View Demo Store</Button></a></div>}
      {busy&&<p role="status">Loading catalog…</p>}{error&&<p role="alert" className="text-destructive">{error}</p>}
      </CardContent></Card>
    <div className="w-full max-w-7xl mx-auto"><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 print:grid-cols-6 print:gap-x-2 print:gap-y-4">{products.map(product=><ProductQRCodeCard key={product.ProductId} product={product} productCatalogueSeed={seed}/>)}</div></div>
  </main>;
}
