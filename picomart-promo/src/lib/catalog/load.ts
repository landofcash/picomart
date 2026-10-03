import {CATALOG_CDN} from '@/config';
import type {NetworkId} from '@/context/wallet/types';
import {fetchProductBySeed} from '@/lib/syncService';
import {parseCatalog} from './parse';
export async function loadCatalog(seed:string,network:NetworkId,signal?:AbortSignal){
  const metadata=await fetchProductBySeed(seed,network,signal);if(!metadata)throw new Error('Catalog not found for this seed');
  const url=new URL(metadata.productsUrl);if(url.origin!==CATALOG_CDN||url.username||url.password)throw new Error('Use the configured Picomart catalog CDN.');
  const response=await fetch(url,{signal,cache:'no-store',redirect:'error'});if(!response.ok||!response.body)throw new Error('Catalog could not be loaded.');
  const chunks:Uint8Array[]=[];const reader=response.body.getReader();let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000)throw new Error('Catalog exceeds its size limit.');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const expectedHash=url.pathname.match(/^\/moderato\/v1\/0x[0-9a-f]{40}\/catalogs\/([0-9a-f]{64})\.json$/)?.[1];
  if(expectedHash){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==expectedHash)throw new Error('Catalog revision digest mismatch.');}
  return {metadata,products:parseCatalog(JSON.parse(new TextDecoder().decode(bytes)))};
}
export type LoadedCatalog=Awaited<ReturnType<typeof loadCatalog>>;
