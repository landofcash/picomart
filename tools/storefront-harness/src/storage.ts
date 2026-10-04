import {randomUUID} from 'node:crypto';
import {safeRelative,sha256,type FileSet} from './files.ts';
import {limits} from './config.ts';

export interface StorageOptions {endpoint:string;zone:string;key:string;}
export class StorageError extends Error {status:number;constructor(status:number){super(`Bunny Storage HTTP ${status}`);this.status=status;}}
export class BunnyStorage {
  options:StorageOptions;transport:typeof fetch;
  constructor(options:StorageOptions,transport:typeof fetch=fetch) {
    if(!/^https:\/\/(?:[a-z]{2}\.)?storage\.bunnycdn\.com$/.test(options.endpoint)|| !/^[A-Za-z0-9_-]+$/.test(options.zone)||!options.key) throw new Error('Invalid Bunny zone credentials or storage endpoint');
    this.options=options;this.transport=transport;
  }
  async request(method:string,file:string,bytes?:Uint8Array,checksum=true) {
    safeRelative(file);
    const response=await this.transport(`${this.options.endpoint}/${this.options.zone}/${file.split('/').map(encodeURIComponent).join('/')}`,{method,redirect:'error',signal:AbortSignal.timeout(60000),headers:{AccessKey:this.options.key,...(bytes?{'Content-Type':'application/octet-stream',...(checksum?{Checksum:sha256(bytes).toUpperCase()}:{})}:{})},body:bytes?new Uint8Array(bytes):undefined});
    if(!response.ok) {await response.body?.cancel();throw new StorageError(response.status);}
    return response;
  }
  async get(file:string,maxBytes=limits().fileBytes):Promise<Buffer> {
    const response=await this.request('GET',file);
    const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new Error('Bunny object exceeds read limit');chunks.push(value);}} finally {await reader.cancel();}
    return Buffer.concat(chunks);
  }
  async maybe(file:string) {try{return await this.get(file);}catch(error){if(error instanceof StorageError&&error.status===404)return null;throw error;}}
  async putVerified(file:string,bytes:Uint8Array) {
    if(bytes.length>limits().artifactBytes)throw new Error('Bunny write exceeds artifact limit');
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response=await this.request('PUT',file,bytes);await response.body?.cancel();
        const actual=await this.get(file,bytes.length+1);
        if(sha256(actual)!==sha256(bytes))throw new Error('Bunny read-back checksum mismatch');
        return;
      } catch(error) {
        if(attempt===2 || error instanceof StorageError && error.status<500 && error.status!==429)throw error;
        await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
      }
    }
  }
}
export function storageClients(transport:typeof fetch=fetch) {
  function options(kind:'PRIVATE'|'PUBLIC') {const p=`BUNNY_${kind}_STORAGE_`;return {endpoint:process.env[p+'ENDPOINT']||'https://storage.bunnycdn.com',zone:process.env[p+'ZONE']||'',key:process.env[p+'KEY']||''};}
  const privateOptions=options('PRIVATE'),publicOptions=options('PUBLIC');
  if(privateOptions.zone===publicOptions.zone)throw new Error('Private management files and public websites require separate Bunny zones');
  return {privateStore:new BunnyStorage(privateOptions,transport),publicStore:new BunnyStorage(publicOptions,transport)};
}
export async function uploadRevision(store:BunnyStorage,prefix:string,files:FileSet,metadata:Record<string,unknown>={}) {
  safeRelative(prefix);
  if(files.has('ready.json') || files.size>2000)throw new Error('Invalid revision file set');
  const manifest={...metadata,schemaVersion:1,files:[...files].map(([name,data])=>({path:safeRelative(name),size:data.length,sha256:sha256(data)}))};
  const ready=Buffer.from(JSON.stringify(manifest));
  const existing=await store.maybe(`${prefix}/ready.json`);
  if(existing&&!existing.equals(ready))throw new Error('Completed revision is immutable');
  for(const [name,data] of files)await store.putVerified(`${prefix}/${name}`,data);
  // This is the only completion marker. A failed/partial upload cannot be selected.
  await store.putVerified(`${prefix}/ready.json`,ready);
  return manifest;
}
export async function storageProbe(store:BunnyStorage) {
  const prefix=`phase2/probes/${randomUUID()}`;
  const first=Buffer.from('{"recordVersion":1}'),second=Buffer.from('{"recordVersion":2}');
  await store.putVerified(`${prefix}/record.json`,first);
  await store.putVerified(`${prefix}/record.json`,second);
  // Reproduce an incomplete artifact left behind by an interrupted uploader.
  // Real socket interruption remains a separate provider trial, not claimed by this check.
  const complete=Buffer.from('complete artifact bytes');
  await store.putVerified(`${prefix}/revision/asset.txt`,complete.subarray(0,7));
  if(await store.maybe(`${prefix}/revision/ready.json`))throw new Error('Incomplete upload was marked ready');
  await uploadRevision(store,`${prefix}/revision`,new Map([['asset.txt',complete]]));
  const checksumRejected=await store.transport(`${store.options.endpoint}/${store.options.zone}/${prefix}/wrong-checksum.txt`,{method:'PUT',redirect:'error',headers:{AccessKey:store.options.key,Checksum:'0'.repeat(64)},body:complete,signal:AbortSignal.timeout(60000)});
  await checksumRejected.body?.cancel();
  if(checksumRejected.ok)throw new Error('Bunny accepted a deliberately incorrect checksum');
  return {prefix,checkedAt:new Date().toISOString(),overwriteReadBack:true,incompleteArtifactRecovered:true,checksumRejectionStatus:checksumRejected.status,realInterruptedRequest:'not tested by this probe'};
}
