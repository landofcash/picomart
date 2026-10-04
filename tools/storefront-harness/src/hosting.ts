import path from 'node:path';
import {z} from 'zod';
import {verifiedArtifact,privateFiles} from './artifacts.ts';
import {BunnyStorage,storageClients,uploadRevision} from './storage.ts';
import {safeRelative,sha256} from './files.ts';
import {writeJson} from './config.ts';
import {assetReference,assetReferenceKey,isAsset,manifest,MAX_MANIFEST_BYTES} from '../resolver/src/contracts.ts';
export {resolveShop,serveHosting} from '../resolver/src/server.ts';

const Id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export async function publishAttempt(id:string) {
  const artifact=await verifiedArtifact(id);
  const {privateStore,publicStore}=storageClients();
  const config=JSON.parse(artifact.files.get('storefront.json')!.toString());
  const shopId=Id.parse(config.shopId),base=`/s/${shopId}/`;
  if(artifact.manifest.base!==base)throw new Error('The hosting trial requires an artifact compiled at /s/<shopId>/. Use sandbox:generate or sandbox:build --fixture.');
  await uploadRevision(privateStore,`phase2/attempts/${id}`,await privateFiles(artifact.directory,artifact.source),{attemptId:id});
  const prefix=`phase2/shops/${shopId}`;
  await uploadRevision(publicStore,`${prefix}/revisions/${id}`,artifact.files,{shopId,base});
  await selectRevision(publicStore,shopId,id);
  await writeJson(path.join(artifact.directory,'publication.json'),{shopId,revision:id,base,publishedAt:new Date().toISOString(),storagePrefix:prefix,hosting:'Requires the shared resolver; direct CDN root fallback is insufficient'});
  return {shopId,revision:id,base};
}
export async function selectRevision(store:BunnyStorage,shopId:string,revision:string) {
  Id.parse(shopId);Id.parse(revision);
  const prefix=`phase2/shops/${shopId}`;
  const ready=manifest(await store.get(`${prefix}/revisions/${revision}/ready.json`,MAX_MANIFEST_BYTES),shopId);
  const references:Array<{key:string;bytes:Buffer}>=[];
  for(const entry of ready.files) {
    safeRelative(entry.path);
    const bytes=await store.get(`${prefix}/revisions/${revision}/${entry.path}`,entry.size+1);
    if(bytes.length!==entry.size||sha256(bytes)!==entry.sha256)throw new Error('Revision integrity check failed');
    if(isAsset(entry.path)) {
      const key=assetReferenceKey(shopId,entry.path),old=await store.maybe(key);
      if(old) {
        const previous=assetReference(old,shopId,entry.path);
        if(previous.sha256!==entry.sha256||previous.size!==entry.size)throw new Error(`Immutable asset name collision: ${entry.path}. Give changed assets a new filename.`);
      } else references.push({key,bytes:Buffer.from(JSON.stringify({schemaVersion:1,shopId,revision,...entry}))});
    }
  }
  // Validate every asset collision before writing references, and select only last.
  // Existing references stay pinned, so old HTML never receives newer asset bytes.
  for(const reference of references)await store.putVerified(reference.key,reference.bytes);
  await store.putVerified(`${prefix}/current.json`,Buffer.from(JSON.stringify({schemaVersion:1,revision})));
}
export async function probeHosting(id:string) {
  const artifact=await verifiedArtifact(id);
  const config=JSON.parse(artifact.files.get('storefront.json')!.toString());
  const shopId=Id.parse(config.shopId);
  function origin(name:string) {const value=process.env[name];if(!value)throw new Error(`Set ${name} for the live hosting trial`);const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error(`Invalid ${name}`);return value.replace(/\/$/,'');}
  const cdn=origin('BUNNY_PUBLIC_BASE_URL'),resolver=origin('STOREFRONT_RESOLVER_BASE_URL');
  async function check(url:string,expected:Buffer) {
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`Hosting HTTP check failed: ${response.status}`);
    const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>expected.length)throw new Error('Hosted response is larger than the approved file');chunks.push(value);}}finally{await reader.cancel();}
    if(sha256(Buffer.concat(chunks))!==sha256(expected))throw new Error('Hosted response differs from approved artifact');
  }
  for(const [name,bytes] of artifact.files)await check(`${cdn}/phase2/shops/${shopId}/revisions/${id}/${name}`,bytes);
  await check(`${resolver}/s/${shopId}/`,artifact.files.get('index.html')!);
  await check(`${resolver}/s/${shopId}/products/AAAAAAAAAAAAAAAAAAAAAA`,artifact.files.get('index.html')!);
  await check(`${resolver}/s/${shopId}/storefront.json`,artifact.files.get('storefront.json')!);
  for(const url of [`${resolver}/s/${shopId}/assets/missing.js`,`${cdn}/phase2/attempts/${id}/source/package.json`]) {
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});await response.body?.cancel();if(response.status!==404)throw new Error('Missing/private paths must return 404');
  }
  const result={checkedAt:new Date().toISOString(),cdn,resolver,revision:id,verifiedFiles:artifact.files.size,rootAndProductRefresh:true,missingAndPrivatePaths404:true,scope:'HTTP and file integrity; run an additional browser check against the configured live resolver'};
  await writeJson(path.join(artifact.directory,'hosting-check.json'),result);return result;
}
