import {MAX_FILE_BYTES,filePath,type ObjectReader} from './contracts.ts';

export class ReadError extends Error {status:number;constructor(status:number){super('Public storage read failed');this.status=status;}}
export function publicSource(env:NodeJS.ProcessEnv=process.env,transport:typeof fetch=fetch):ObjectReader {
  const endpoint=env.BUNNY_PUBLIC_STORAGE_ENDPOINT||'https://storage.bunnycdn.com';
  const zone=env.BUNNY_PUBLIC_STORAGE_ZONE||'',key=env.BUNNY_PUBLIC_STORAGE_KEY||'';
  if(!/^https:\/\/(?:(?:[a-z]{2}|syd)\.)?storage\.bunnycdn\.com$/.test(endpoint)||!/^[A-Za-z0-9_-]+$/.test(zone)||!key)throw new Error('Configure the public Bunny storage endpoint, zone and key');
  const cdn=new URL(env.BUNNY_PUBLIC_BASE_URL||'');
  if(cdn.protocol!=='https:'||cdn.username||cdn.password||cdn.search||cdn.hash||cdn.pathname!=='/')throw new Error('Configure an HTTPS public CDN origin');
  async function read(file:string,maxBytes:number,signal:AbortSignal|undefined,artifact:boolean) {
    filePath(file);
    const url=artifact?new URL(file,cdn).toString():`${endpoint}/${zone}/${file}`;
    const response=await transport(url,{method:'GET',redirect:'error',headers:artifact?{}:{AccessKey:key},signal:AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])])});
    if(!response.ok){await response.body?.cancel();throw new ReadError(response.status);}
    const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new Error('Public object exceeds read limit');chunks.push(value);}}finally{await reader.cancel();}
    return Buffer.concat(chunks);
  }
  return {get:(file,maxBytes=MAX_FILE_BYTES,signal)=>read(file,maxBytes,signal,false),getArtifact:(file,maxBytes,signal)=>read(file,maxBytes,signal,true)};
}
