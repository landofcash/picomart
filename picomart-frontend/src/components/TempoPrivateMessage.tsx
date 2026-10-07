import {formatUnits} from 'ethers';
import type {TempoMessagePayload} from '@picomart/order-protocol/tempo-protocol';

export default function TempoPrivateMessage({message}:{message:TempoMessagePayload}) {
  const data=message.data;
  if('items' in data)return <section className="space-y-4">
    <h3 className="font-semibold">Order details</h3>
    {data.items.map(item=><div className="flex justify-between gap-4 border-b pb-2 text-sm" key={item.productId}><span>{item.name} × {item.quantity}</span><span className="shrink-0 font-semibold">{formatUnits(item.lineAmount,6)} PathUSD</span></div>)}
    <h4 className="font-semibold">Delivery details</h4>
    {data.delivery.noPhysicalDelivery&&<p>Digital delivery</p>}
    <dl className="space-y-2 text-sm">{Object.entries({Name:data.delivery.fullName,Address:data.delivery.address,City:data.delivery.city,'Postal code':data.delivery.postalCode,Country:data.delivery.country,Phone:data.delivery.phone,Email:data.delivery.email,Comments:data.delivery.deliveryComments}).filter(([,value])=>Boolean(value)).map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>
  </section>;
  return <section className="space-y-2"><h3 className="font-semibold">{message.binding.messageType==='seller-delivery'?'Delivery update':'Message from the shop'}</h3>
    {'shipmentCode' in data&&data.shipmentCode&&<p>Tracking: {data.shipmentCode}</p>}
    <p className="whitespace-pre-wrap break-words">{data.customInfo}</p>
  </section>;
}
