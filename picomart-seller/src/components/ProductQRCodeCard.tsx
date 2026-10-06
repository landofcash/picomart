import {QRCodeSVG} from 'qrcode.react';
import {formatUnits} from 'ethers';
import TokenIcon from './TokenIcon';
import CopyableField from './CopyableField';
import {catalogLink,type MarketProduct} from '@/lib/tempoMarket';

export default function ProductQRCodeCard({product,productCatalogueSeed}:{product:MarketProduct;productCatalogueSeed:string}){
  const url=catalogLink(productCatalogueSeed,product.ProductId);
  return <div className="product-qr-card w-full h-full flex flex-col justify-between max-w-[160px] mx-auto bg-white text-black border-2 border-gray-300 rounded-lg p-3 print:p-2 print:break-inside-avoid print:border-black">
    <h3 className="font-bold text-xs mb-2 print:text-[11px] print:mb-1 line-clamp-2 text-center leading-tight">{product.Name}</h3>
    <div className="flex items-center justify-center gap-1 mb-3 print:mb-2"><TokenIcon assetId={product.PriceToken} size={18}/><span className="font-semibold text-sm print:text-[10px] text-green-600">{formatUnits(product.Price,6)} PathUSD</span></div>
    <div className="flex justify-center mb-2 print:mb-1"><div className="bg-white p-1 rounded border print:p-0 print:border-none"><QRCodeSVG value={url} level="L" includeMargin={false} className="print:w-20 print:h-20"/></div></div>
    <div className="flex justify-center print:hidden"><CopyableField value={product.ProductId} length={18} mdLength={18} small/></div>
    <div className="flex justify-center print:hidden"><CopyableField value={url} length={18} mdLength={18} small/></div>
    <div className="hidden print:block text-[9px] text-gray-500 text-center font-mono space-y-0.5"><div>Scan with PICOMART</div><div>Order Anytime</div></div>
  </div>;
}
