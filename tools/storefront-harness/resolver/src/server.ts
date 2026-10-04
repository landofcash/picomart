import http from 'node:http';
import {assetReference,assetReferenceKey,contentType,filePath,id,isAsset,isMissing,manifest,MAX_MANIFEST_BYTES,pointer,sha256,type Entry,type ObjectReader} from './contracts.ts';

export async function resolveShop(store:ObjectReader,raw:string,signal?:AbortSignal) {
  // Validate the raw path before URL normalization can hide traversal segments.
  const pathname=raw.split('?')[0];
  const match=/^\/s\/([A-Za-z0-9_-]{1,80})\/(.*)$/.exec(pathname);if(!match)return null;
  const shopId=match[1],relative=match[2].replace(/\/$/,'');
  if(relative){try{filePath(relative);}catch{return null;}}
  const page=relative===''||relative==='index.html'||relative==='about'||relative==='products'||/^products\/[A-Za-z0-9_-]{22}$/.test(relative)||/^collections\/[A-Za-z0-9_-]{1,80}$/.test(relative);
  if(!page&&relative!=='storefront.json'&&!isAsset(relative))return null;
  const prefix=`phase2/shops/${shopId}`;
  try {
    let revision:string,entry:Entry;
    if(!page&&relative!=='storefront.json') {
      const reference=assetReference(await store.get(assetReferenceKey(shopId,relative),4096,signal),shopId,relative);
      revision=reference.revision;
      const ready=manifest(await store.get(`${prefix}/revisions/${revision}/ready.json`,MAX_MANIFEST_BYTES,signal),shopId);
      const found=ready.files.find(item=>item.path===relative);
      if(!found||found.sha256!==reference.sha256||found.size!==reference.size)throw new Error('Asset reference is not an approved revision file');
      entry=found;
    } else {
      revision=pointer(await store.get(`${prefix}/current.json`,4096,signal));
      const ready=manifest(await store.get(`${prefix}/revisions/${revision}/ready.json`,MAX_MANIFEST_BYTES,signal),shopId);
      entry=ready.files.find(item=>item.path===(page?'index.html':'storefront.json'))!;
    }
    const read=store.getArtifact?.bind(store)||store.get.bind(store);
    const bytes=await read(`${prefix}/revisions/${revision}/${entry.path}`,entry.size+1,signal);
    if(bytes.length!==entry.size||sha256(bytes)!==entry.sha256)throw new Error('Public artifact checksum mismatch');
    return {bytes,type:contentType(entry.path),revision,etag:`"${entry.sha256}"`,cacheControl:page||relative==='storefront.json'?'no-store':'public, max-age=31536000, immutable'};
  } catch(error){if(isMissing(error))return null;throw error;}
}

export async function serveHosting(store:ObjectReader,port=4180,host='127.0.0.1') {
  let active=0;
  const server=http.createServer(async(req,res)=>{
    const finish=(status:number,text:string)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:text);};
    if(!['GET','HEAD'].includes(req.method||'')){res.setHeader('Allow','GET, HEAD');finish(405,'Method not allowed');return;}
    if(req.url==='/healthz'){finish(200,'ok');return;}
    // A direct shop address without its trailing slash has one canonical form.
    const canonical=/^\/s\/([A-Za-z0-9_-]{1,80})(\?.*)?$/.exec(req.url||'');
    if(canonical){res.writeHead(308,{Location:`/s/${id(canonical[1],80)}/${canonical[2]||''}`,'Cache-Control':'no-store'});res.end();return;}
    if(active>=32){finish(503,'Shop storage is busy');return;}
    active++;
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),30000);
    res.once('close',()=>{if(!res.writableFinished)controller.abort();});
    try {
      const result=await resolveShop(store,req.url||'/',controller.signal);
      if(!result){finish(404,'Not found');return;}
      res.writeHead(200,{'Content-Type':result.type,'Content-Length':result.bytes.length,'Cache-Control':result.cacheControl,'X-Content-Type-Options':'nosniff','X-Picomart-Revision':result.revision,ETag:result.etag});
      res.end(req.method==='HEAD'?undefined:result.bytes);
    }catch{if(!res.destroyed)finish(502,'Shop storage is unavailable');}
    finally{clearTimeout(deadline);active--;}
  });
  server.requestTimeout=35000;server.headersTimeout=10000;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const address=server.address();if(!address||typeof address==='string')throw new Error('Hosting listener unavailable');
  return {url:`http://${host}:${address.port}`,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
