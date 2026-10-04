import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {verifiedArtifact} from '../src/artifacts.ts';
import {sha256} from '../src/files.ts';
import {contentType} from '../src/preview.ts';
import {safeError,writeJson} from '../src/config.ts';

try {
  const id=process.argv[2];
  const artifact=await verifiedArtifact(id);
  const config=JSON.parse(artifact.files.get('storefront.json').toString());
  const origin=new URL(process.env.BUNNY_PUBLIC_BASE_URL);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('BUNNY_PUBLIC_BASE_URL must be an HTTPS origin');
  const prefix=`phase2/shops/${encodeURIComponent(config.shopId)}/revisions/${id}`;
  const files=[];
  for(const [name,expected] of artifact.files) {
    const url=new URL(`${prefix}/${name}`,origin);
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
    if(response.status!==200){await response.body?.cancel();throw new Error(`CDN file returned HTTP ${response.status}`);}
    const reader=response.body.getReader();let size=0;const chunks=[];
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>expected.length)throw new Error('CDN response exceeds approved artifact size');chunks.push(value);}}finally{await reader.cancel();}
    if(sha256(Buffer.concat(chunks))!==sha256(expected))throw new Error('CDN bytes differ from approved artifact');
    const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const expectedMime=contentType(name).split(';')[0];
    if(mime!==expectedMime&&!(expectedMime==='text/javascript'&&mime==='application/javascript'))throw new Error(`Incorrect CDN Content-Type for ${name}`);
    files.push({path:name,size,contentType:mime,sha256:sha256(expected)});
  }
  for(const name of [`phase2/attempts/${id}/source/package.json`,`${prefix}/assets/missing-${randomUUID()}.js`]) {
    const response=await fetch(new URL(name,origin),{redirect:'error',signal:AbortSignal.timeout(30000)});
    await response.body?.cancel();if(response.status!==404)throw new Error('Private or missing CDN path did not return 404');
  }
  const result={checkedAt:new Date().toISOString(),revision:id,cdn:origin.origin,verifiedFiles:files,privateAndMissingPaths404:true,scope:'Immutable CDN files only; shared public shop routing remains a separate check'};
  await writeJson(path.join(artifact.directory,'cdn-check.json'),result);
  console.log(JSON.stringify({revision:id,verifiedFiles:files.length,hashesAndMimeTypesMatch:true,privateAndMissingPaths404:true,scope:result.scope},null,2));
}catch(error){console.error(safeError(error));process.exitCode=1;}
