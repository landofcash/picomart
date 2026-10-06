import {PICOMART_TEMPO_CONFIG,isPaymentCurrency} from '@picomart/config';
import {hexlify,parseUnits,verifyMessage} from 'ethers';
import type {WalletAdapter} from '@/context/wallet/types';
import {tempoWalletRevision,assertTempoWalletRevision} from './internalWallet/providers/tempoInternalWalletProvider';

export const CATALOG_CDN=PICOMART_TEMPO_CONFIG.services.catalogOrigin;
export const IMAGE_LIMIT=10*1024*1024;
export interface PublicProduct {ProductId:string;Name:string;Description:string;Price:string;PriceToken:string;Image:string;}
export type DraftProduct=PublicProduct&{LocalFile?:File};
export function pathUsdPrice(value:string) {
  if(!/^\d+(\.\d{1,6})?$/.test(value))throw new Error('Use a positive price with up to six decimal places.');
  const amount=parseUnits(value,6);
  if(amount<=0n||amount>2n**256n-1n)throw new Error('Price is outside the supported PathUSD range.');
  return amount.toString();
}
export function validateImage(file:File) {
  if(file.size===0||file.size>IMAGE_LIMIT||!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type))
    throw new Error('Use PNG, JPEG, GIF or WebP images up to 10 MiB.');
}
export async function sha256(bytes:Uint8Array) {
  const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return hexlify(new Uint8Array(hash)).slice(2);
}
export function uploadMessage(account:string,kind:'image'|'json',hash:string,expiresAt:number) {
  return `Picomart public catalog upload\nVersion: 1\nChain ID: ${PICOMART_TEMPO_CONFIG.chainId}\nContract: 0x3c91183f0454eab6eff6f570ac402be278dbd6f4\nCDN: ${CATALOG_CDN}\nAccount: ${account}\nKind: ${kind}\nSHA256: ${hash}\nExpires at: ${expiresAt}`;
}
async function bytesFromResponse(response:Response,limit:number) {
  if(!response.ok||!response.body)throw new Error('Published content could not be read from the CDN.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit)throw new Error('Published content exceeds its size limit.');chunks.push(part.value);}}
  catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function verifyPublishedContent(url:string,hash:string,limit:number,signal?:AbortSignal) {
  if(new URL(url).origin!==CATALOG_CDN)throw new Error('Unexpected catalog CDN.');
  const bytes=await bytesFromResponse(await fetch(url,{redirect:'error',cache:'no-store',signal}),limit);
  if(await sha256(bytes)!==hash)throw new Error('Published CDN content differs from the signed upload. Retry the same content.');
}
export async function uploadCatalog(wallet:WalletAdapter,api:string,products:readonly DraftProduct[],signal?:AbortSignal,progress:(message:string)=>void=()=>{}) {
  const revision=tempoWalletRevision(),account=(await wallet.getAddress())?.toLowerCase();
  if(wallet.chain!=='tempo'||await wallet.getNetwork?.()!== PICOMART_TEMPO_CONFIG.network||!account||!/^0x[0-9a-f]{40}$/.test(account))throw new Error('Select your Picomart account in Demo mode first.');
  const assertWallet=async()=>{signal?.throwIfAborted();assertTempoWalletRevision(revision);if((await wallet.getAddress())?.toLowerCase()!==account)throw new Error('Wallet changed during catalog upload.');};
  await assertWallet();
  const status=await fetch(`${api}/status`,{signal,redirect:'error',cache:'no-store'});
  const readiness=await status.json();
  if(!status.ok||readiness.version!==1||!readiness.ready||readiness.publicBase!==CATALOG_CDN)throw new Error('Catalog uploads are disabled or storage is not configured on the sync API.');
  if(products.length===0||products.length>1000)throw new Error('Catalog must contain 1–1000 products.');
  // Validate all products before the first storage write.
  const ids=new Set<string>();
  for(const p of products){
    if(!p.ProductId||p.ProductId.length>100||ids.has(p.ProductId)||!p.Name.trim()||p.Name.length>60||p.Description.length>320||
      !/^[1-9][0-9]{0,77}$/.test(p.Price)||BigInt(p.Price)>2n**256n-1n||!isPaymentCurrency(p.PriceToken))throw new Error('Invalid product terms or unsupported payment currency.');
    ids.add(p.ProductId);if(p.LocalFile)validateImage(p.LocalFile);
    else if(!new RegExp(`^${CATALOG_CDN.replaceAll('.','\\.')}/moderato/v1/${account}/images/[0-9a-f]{64}\\.(png|jpg|gif|webp)$`).test(p.Image))throw new Error('Re-upload images with the selected seller wallet.');
  }
  async function publish(kind:'image'|'json',bytes:Uint8Array,file?:File) {
    await assertWallet();const hash=await sha256(bytes),expiresAt=Date.now()+240_000,message=uploadMessage(account!,kind,hash,expiresAt);
    const signature=hexlify(await wallet.signMessage(message));await assertWallet();
    if(verifyMessage(message,signature).toLowerCase()!==account)throw new Error('Upload signature does not match this wallet.');
    const auth={account,expiresAt,signature};
    let body:FormData|string;
    if(kind==='image'){const form=new FormData();form.append('file',file!);for(const [key,value] of Object.entries(auth))form.append(key,String(value));body=form;}
    else body=JSON.stringify({...auth,content:new TextDecoder().decode(bytes)});
    const response=await fetch(`${api}/${kind}`,{method:'POST',redirect:'error',signal,headers:kind==='json'?{'Content-Type':'application/json'}:undefined,body});
    const result=await response.json();await assertWallet();
    if(!response.ok||!result.success||result.version!==1||result.sha256!==hash)throw new Error(typeof result.error==='string'?result.error:'Catalog upload failed.');
    const folder=kind==='image'?'images':'catalogs';
    if(typeof result.url!=='string'||!new RegExp(`^${CATALOG_CDN.replaceAll('.','\\.')}/moderato/v1/${account}/${folder}/${hash}\\.${kind==='json'?'json':'(png|jpg|gif|webp)'}$`).test(result.url))throw new Error('Unexpected published content URL.');
    await verifyPublishedContent(result.url,hash,kind==='json'?1_000_000:IMAGE_LIMIT,signal);await assertWallet();return result.url as string;
  }
  const published:PublicProduct[]=[];
  for(const p of products){
    progress(`Uploading image for ${p.Name}…`);
    const Image=p.LocalFile?await publish('image',new Uint8Array(await p.LocalFile.arrayBuffer()),p.LocalFile):p.Image;
    published.push({ProductId:p.ProductId,Name:p.Name,Description:p.Description,Price:p.Price,PriceToken:p.PriceToken,Image});
  }
  const bytes=new TextEncoder().encode(JSON.stringify(published));
  if(bytes.length>1_000_000)throw new Error('Catalog JSON exceeds its size limit.');
  progress('Checking products and images…');const url=await publish('json',bytes);
  return {url,products:published};
}
