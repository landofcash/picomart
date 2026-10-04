import {createHash} from 'node:crypto';
import path from 'node:path';

export const MAX_FILE_BYTES=5*1024*1024;
export const MAX_MANIFEST_BYTES=1024*1024;
export interface ObjectReader {
  get(file:string,maxBytes?:number,signal?:AbortSignal):Promise<Buffer>;
  getArtifact?(file:string,maxBytes:number,signal?:AbortSignal):Promise<Buffer>;
}
export interface Entry {path:string;size:number;sha256:string;}
export interface Manifest {schemaVersion:1;shopId:string;base:string;files:Entry[];}
export interface AssetReference extends Entry {schemaVersion:1;shopId:string;revision:string;}
export const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function id(value:unknown,max=100):string {
  if(typeof value!=='string'||!new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(value))throw new Error('Invalid identifier');return value;
}
export function filePath(value:unknown):string {
  if(typeof value!=='string'||value.length>300||!value.split('/').every(part=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part)))throw new Error('Invalid public file path');return value;
}
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
export const contentType=(file:string)=>types[path.extname(file)]||'application/octet-stream';
export const isAsset=(file:string)=>!!types[path.extname(file)]&&!['.html','.json'].includes(path.extname(file));
export const assetReferenceKey=(shopId:string,file:string)=>`phase2/shops/${id(shopId,80)}/asset-index/${filePath(file)}.json`;
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid storage record');return value as Record<string,unknown>;}
function entry(value:unknown):Entry {
  const item=object(value),name=filePath(item.path);
  if(typeof item.size!=='number'||!Number.isSafeInteger(item.size)||item.size<0||item.size>MAX_FILE_BYTES||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error('Invalid public file entry');
  return {path:name,size:item.size,sha256:item.sha256};
}
export function pointer(bytes:Buffer):string {const value=object(JSON.parse(bytes.toString()));if(value.schemaVersion!==1)throw new Error('Invalid pointer version');return id(value.revision);}
export function manifest(bytes:Buffer,shopId:string):Manifest {
  const value=object(JSON.parse(bytes.toString()));
  if(value.schemaVersion!==1||value.shopId!==shopId||value.base!==`/s/${shopId}/`||!Array.isArray(value.files)||value.files.length>2000)throw new Error('Revision does not belong to this shop');
  const files=value.files.map(entry),paths=new Set(files.map(item=>item.path));
  if(paths.size!==files.length||!paths.has('index.html')||!paths.has('storefront.json')||files.reduce((n,item)=>n+item.size,0)>50*1024*1024)throw new Error('Incomplete or oversized revision');
  return {schemaVersion:1,shopId,base:value.base as string,files};
}
export function assetReference(bytes:Buffer,shopId:string,file:string):AssetReference {
  const value=object(JSON.parse(bytes.toString()));const item=entry(value);
  if(value.schemaVersion!==1||value.shopId!==shopId||item.path!==file||!isAsset(file))throw new Error('Asset belongs to another shop or path');
  return {...item,schemaVersion:1,shopId,revision:id(value.revision)};
}
export const isMissing=(error:unknown)=>!!error&&typeof error==='object'&&'status' in error&&error.status===404;
