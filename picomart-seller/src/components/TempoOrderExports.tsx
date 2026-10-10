import {formatUnits} from 'ethers';
import {getCurrency} from '@picomart/config';
import {useState} from 'react';
import type {TempoMessagePayload} from '@picomart/order-protocol/tempo-protocol';
import {Download,Eye} from 'lucide-react';
import {Button} from './ui/button';
import TempoActionDialog from './TempoActionDialog';

export default function TempoOrderExports({orderId,message}:{orderId:string;message:TempoMessagePayload}){
  const [view,setView]=useState<'Text'|'JSON'|null>(null);
  const data=message.data;
  if(!('items' in data))return null;
  const currency=getCurrency(data.payment.tokenAddress);
  const rows:[string,string][]=[['Order ID',orderId],['Delivery method',data.fulfillment.name],['Delivery option',data.fulfillment.optionName??''],['Pickup address',data.fulfillment.address??''],['Collection schedule',data.fulfillment.schedule??''],['Delivery fee',data.deliveryAmount==='0'?'Free':formatUnits(data.deliveryAmount,currency.decimals)+' '+currency.symbol],['Order total',formatUnits(data.payment.amount,currency.decimals)+' '+currency.symbol],...Object.entries(data.delivery).map(([label,value]):[string,string]=>[label,String(value??'')]),...data.items.map((item):[string,string]=>[item.name,`${item.quantity} × ${formatUnits(item.unitAmount,currency.decimals)} ${currency.symbol}`])];
  const text=rows.map(([label,value])=>`${label}: ${value}`).join('\n');
  const json=JSON.stringify(data,null,2);
  function download(format:'Text'|'JSON'|'CSV'){
    const quote=(value:string)=>'"'+(/^[=+@-]/.test(value)?"'":"")+value.replaceAll('"','""')+'"';
    const content=format==='Text'?text:format==='JSON'?json:rows.map(row=>row.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([content],{type:format==='JSON'?'application/json':format==='CSV'?'text/csv':'text/plain'}));
    const link=document.createElement('a');link.href=url;link.download=`order-${orderId}.${format==='Text'?'txt':format.toLowerCase()}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="flex flex-wrap gap-2 p-4 bg-muted/50 rounded-lg">
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-muted-foreground">Export:</span>{(['Text','JSON','CSV'] as const).map(format=><Button key={format} variant="outline" size="sm" aria-label={`Export ${format}`} onClick={()=>download(format)}><Download className="h-3 w-3 mr-1"/>{format}</Button>)}</div>
    <div className="flex items-center gap-2"><span className="text-sm font-medium text-muted-foreground">View:</span>{(['Text','JSON'] as const).map(format=><Button key={format} variant="outline" size="sm" aria-label={`View ${format}`} onClick={()=>setView(format)}><Eye className="h-3 w-3 mr-1"/>{format}</Button>)}</div>
    {view&&<TempoActionDialog title={`Order ${view}`} busy={false} onClose={()=>setView(null)}><pre className="whitespace-pre-wrap break-words text-sm">{view==='Text'?text:json}</pre></TempoActionDialog>}
  </div>;
}
