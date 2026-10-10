import {z} from 'zod';
import {TempoAddressSchema, TempoAmountSchema, TempoSeedSchema, limitedTempoText} from './tempoPrimitives.js';

const id = limitedTempoText(1, 100);
const name = limitedTempoText(1, 200);
const description = limitedTempoText(0, 2000);
const httpsUrl = z.string().max(4000).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
}, 'Expected public HTTPS URL');
const uniqueIds = (values: readonly {id:string}[]) => new Set(values.map(v => v.id)).size === values.length;
export const TempoDeliveryServiceSchema = z.object({id, name, description, amount:TempoAmountSchema}).strict();
export const TempoPickupLocationSchema = TempoDeliveryServiceSchema.extend({address:limitedTempoText(1, 2048), schedule:limitedTempoText(0, 512)}).strict();
const method = {id, name, description};
export const TempoDeliveryMethodSchema = z.discriminatedUnion('type', [
  z.object({...method, type:z.literal('customer-address'), services:z.array(TempoDeliveryServiceSchema).min(1).max(50).refine(uniqueIds, 'Duplicate service ID')}).strict(),
  z.object({...method, type:z.literal('shop-pickup'), locations:z.array(TempoPickupLocationSchema).min(1).max(50).refine(uniqueIds, 'Duplicate location ID')}).strict(),
  z.object({...method, type:z.literal('pickup-box'), locations:z.array(TempoPickupLocationSchema).min(1).max(50).refine(uniqueIds, 'Duplicate location ID')}).strict(),
  z.object({...method, type:z.literal('digital')}).strict(),
]);
export const TempoDeliveryOptionsSchema = z.object({version:z.literal(1), currency:TempoAddressSchema,
  methods:z.array(TempoDeliveryMethodSchema).min(1).max(4).refine(values => uniqueIds(values) && new Set(values.map(v => v.type)).size === values.length, 'Use one method per type with unique IDs'),
}).strict();
export const TempoCatalogProductSchema = z.object({ProductId:TempoSeedSchema, PriceToken:TempoAddressSchema,
  Price:TempoAmountSchema.refine(value => BigInt(value) > 0n, 'Price must be positive'),
  Name:limitedTempoText(1,60), Description:limitedTempoText(0,320), Image:httpsUrl,
}).strict();
export const TempoCatalogSchema = z.object({version:z.literal(2), deliveryOptionsUrl:httpsUrl,
  products:z.array(TempoCatalogProductSchema).min(1).max(1000),
}).strict().superRefine((value,ctx) => {
  if(new Set(value.products.map(p=>p.ProductId)).size !== value.products.length) ctx.addIssue({code:'custom',message:'Duplicate product ID'});
  if(new Set(value.products.map(p=>p.PriceToken)).size !== 1) ctx.addIssue({code:'custom',message:'Catalogue must use one currency'});
});
export type TempoCatalog = z.infer<typeof TempoCatalogSchema>;
export type TempoDeliveryOptions = z.infer<typeof TempoDeliveryOptionsSchema>;
export type TempoDeliveryMethod = z.infer<typeof TempoDeliveryMethodSchema>;
export type TempoDeliveryService = z.infer<typeof TempoDeliveryServiceSchema>;
export type TempoPickupLocation = z.infer<typeof TempoPickupLocationSchema>;

export class TempoCatalogError extends Error {
  constructor(public readonly code:'unsupported-format'|'invalid-configuration'|'network-failure', message:string) {super(message);this.name='TempoCatalogError';}
}
export function parseTempoCatalog(value:unknown):TempoCatalog {
  if(!value || typeof value !== 'object' || Array.isArray(value) || (value as {version?:unknown}).version !== 2)
    throw new TempoCatalogError('unsupported-format','Unsupported catalogue format. Recreate this catalogue.');
  const result=TempoCatalogSchema.safeParse(value);
  if(!result.success) throw new TempoCatalogError('invalid-configuration','Invalid catalogue configuration.');
  return result.data;
}
export function parseTempoDeliveryOptions(value:unknown):TempoDeliveryOptions {
  if(!value || typeof value !== 'object' || Array.isArray(value) || (value as {version?:unknown}).version !== 1)
    throw new TempoCatalogError('unsupported-format','Unsupported delivery-options format. Recreate this catalogue.');
  const result=TempoDeliveryOptionsSchema.safeParse(value);
  if(!result.success) throw new TempoCatalogError('invalid-configuration','Invalid delivery configuration.');
  return result.data;
}
export function assertTempoDeliveryUrl(catalogUrl:string, optionsUrl:string) {
  const catalog=new URL(catalogUrl), options=new URL(optionsUrl);
  const seller=catalog.pathname.match(/^\/moderato\/v1\/(0x[0-9a-f]{40})\/catalogs\/[0-9a-f]{64}\.json$/)?.[1];
  if(!seller || options.origin!==catalog.origin || options.protocol!=='https:' || options.username || options.password || options.search || options.hash ||
    !new RegExp(`^/moderato/v1/${seller}/delivery-options/[0-9a-f]{64}\\.json$`).test(options.pathname))
    throw new TempoCatalogError('invalid-configuration','Delivery options must use this seller’s published catalogue CDN.');
}
export function assertTempoCatalogDelivery(catalog:TempoCatalog, options:TempoDeliveryOptions) {
  if(catalog.products.some(p=>p.PriceToken!==options.currency)) throw new TempoCatalogError('invalid-configuration','Delivery fees must use the catalogue currency.');
}

/** Load only immutable seller-owned revisions from the application's trusted CDN. */
export async function loadTempoCatalog(url:string, origin:string, transport:typeof fetch=fetch, signal?:AbortSignal, maxBytes=1_000_000) {
  async function json(input:string, folder:'catalogs'|'delivery-options') {
    const target=new URL(input);
    const hash=target.pathname.match(new RegExp(`^/moderato/v1/0x[0-9a-f]{40}/${folder}/([0-9a-f]{64})\\.json$`))?.[1];
    if(target.origin!==origin||target.protocol!=='https:'||target.username||target.password||target.search||target.hash||!hash)
      throw new TempoCatalogError('invalid-configuration','Use the configured Picomart catalogue CDN and a published revision URL.');
    let response:Response;
    try {response=await transport(input,{redirect:'error',cache:'no-store',signal});}
    catch(error){if(signal?.aborted)throw error;throw new TempoCatalogError('network-failure','Catalogue or delivery options could not be loaded. Try again.');}
    if(!response.ok||!response.body)throw new TempoCatalogError('network-failure','Catalogue or delivery options could not be loaded. Try again.');
    const reader=response.body.getReader(), chunks:Uint8Array[]=[];let size=0;
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new TempoCatalogError('invalid-configuration','Published JSON exceeds its size limit.');chunks.push(value);}}
    catch(error){if(error instanceof TempoCatalogError||signal?.aborted)throw error;throw new TempoCatalogError('network-failure','Catalogue download was interrupted. Try again.');}
    finally {await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(actual!==hash)throw new TempoCatalogError('invalid-configuration','Published content does not match its revision URL.');
    try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}
    catch {throw new TempoCatalogError('invalid-configuration','Published JSON is invalid.');}
  }
  const catalog=parseTempoCatalog(await json(url,'catalogs'));
  assertTempoDeliveryUrl(url,catalog.deliveryOptionsUrl);
  const deliveryOptions=parseTempoDeliveryOptions(await json(catalog.deliveryOptionsUrl,'delivery-options'));
  assertTempoCatalogDelivery(catalog,deliveryOptions);
  return {...catalog,deliveryOptions};
}

export const TempoFulfillmentSnapshotSchema = z.object({catalogUrl:httpsUrl, deliveryOptionsUrl:httpsUrl,
  methodId:id, type:z.enum(['customer-address','shop-pickup','pickup-box','digital']), name, description,
  optionId:id.optional(), optionName:name.optional(), optionDescription:description.optional(),
  address:limitedTempoText(1,2048).optional(), schedule:limitedTempoText(0,512).optional(), amount:TempoAmountSchema, currency:TempoAddressSchema,
}).strict().superRefine((value,ctx)=>{
  if(value.type==='digital' ? value.amount!=='0'||value.optionId!==undefined||value.address!==undefined : !value.optionId||!value.optionName)
    ctx.addIssue({code:'custom',message:'Invalid fulfillment snapshot'});
  if(['shop-pickup','pickup-box'].includes(value.type)&&!value.address)ctx.addIssue({code:'custom',message:'Pickup address is required'});
});
export type TempoFulfillmentSnapshot = z.infer<typeof TempoFulfillmentSnapshotSchema>;
export function tempoFulfillmentSnapshot(catalogUrl:string, deliveryOptionsUrl:string, options:TempoDeliveryOptions, methodId:string, optionId?:string):TempoFulfillmentSnapshot {
  assertTempoDeliveryUrl(catalogUrl, deliveryOptionsUrl);
  const selected=options.methods.find(m=>m.id===methodId);
  if(!selected) throw new Error('Select a configured delivery method.');
  const base={catalogUrl,deliveryOptionsUrl,methodId,type:selected.type,name:selected.name,description:selected.description,currency:options.currency};
  if(selected.type==='digital') return TempoFulfillmentSnapshotSchema.parse({...base,amount:'0'});
  const option=(selected.type==='customer-address'?selected.services:selected.locations).find(o=>o.id===optionId);
  if(!option) throw new Error('Select a configured delivery service or pickup location.');
  return TempoFulfillmentSnapshotSchema.parse({...base,optionId:option.id,optionName:option.name,optionDescription:option.description,amount:option.amount,
    ...('address' in option&&'schedule' in option?{address:option.address,schedule:option.schedule}:{})});
}
export function tempoCombinedTotal(items:readonly {Price:string;quantity:number}[], deliveryAmount:string) {
  const total=items.reduce((sum,item)=>{
    if(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1_000_000)throw new Error('Choose positive whole quantities.');
    return sum+BigInt(TempoAmountSchema.parse(item.Price))*BigInt(item.quantity);
  },BigInt(TempoAmountSchema.parse(deliveryAmount)));
  return BigInt(TempoAmountSchema.parse(total.toString()));
}
export function tempoRecipientValid(type:TempoFulfillmentSnapshot['type'], input:object) {
  const recipient=input as Record<string,unknown>;
  const required=type==='digital'?['email']:type==='customer-address'?['fullName','address','city','postalCode','country','phone','email']:['fullName','phone','email'];
  return required.every(key=>typeof recipient[key]==='string'&&String(recipient[key]).trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipient.email));
}
