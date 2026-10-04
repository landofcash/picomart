import https from 'node:https';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {storageClients,uploadRevision} from '../src/storage.ts';
import {sha256} from '../src/files.ts';
import {HARNESS_ROOT,safeError,writeJson} from '../src/config.ts';

// Send only the first chunk of a larger declared body, then destroy the real TLS
// request after its write callback. All objects belong to a fresh probe prefix.
async function interruptUpload(store,file,complete) {
  const firstChunk=complete.subarray(0,64*1024);
  return new Promise((resolve,reject)=>{
    let intentional=false,flushed=false,lastError,cutTimer;
    const request=https.request(`${store.options.endpoint}/${store.options.zone}/${file}`,{
      method:'PUT',agent:false,headers:{AccessKey:store.options.key,'Content-Type':'application/octet-stream','Content-Length':complete.length,Checksum:sha256(complete).toUpperCase()},
    },response=>{response.resume();request.destroy(new Error(`Interrupted upload received unexpected HTTP ${response.statusCode}`));});
    const deadline=setTimeout(()=>request.destroy(new Error('Interrupted-upload probe exceeded 20 seconds')),20000);
    request.on('error',error=>{lastError=error;});
    request.once('close',()=>{
      clearTimeout(deadline);clearTimeout(cutTimer);
      if(intentional&&flushed)resolve({declaredBytes:complete.length,flushedBodyBytes:firstChunk.length,connectionDestroyed:true});
      else reject(lastError||new Error('Upload closed before the intentional interruption'));
    });
    request.write(firstChunk,error=>{
      if(error){request.destroy(error);return;}
      flushed=true;
      cutTimer=setTimeout(()=>{intentional=true;request.destroy();},500);
    });
  });
}

async function probe(store) {
  const prefix=`phase2/probes/${randomUUID()}/interrupted-revision`;
  const complete=Buffer.alloc(2*1024*1024,0x5a);
  const interruption=await interruptUpload(store,`${prefix}/asset.bin`,complete);
  await new Promise(resolve=>setTimeout(resolve,1000));
  const afterInterruption=await store.maybe(`${prefix}/asset.bin`);
  if(afterInterruption?.equals(complete))throw new Error('Incomplete request unexpectedly produced a complete object');
  if(await store.maybe(`${prefix}/ready.json`))throw new Error('Interrupted revision has a completion marker');
  await uploadRevision(store,prefix,new Map([['asset.bin',complete]]));
  await new Promise(resolve=>setTimeout(resolve,1000));
  if(!(await store.get(`${prefix}/asset.bin`)).equals(complete))throw new Error('Recovered artifact changed after read-back');
  const ready=JSON.parse((await store.get(`${prefix}/ready.json`)).toString());
  if(ready.files[0].sha256!==sha256(complete))throw new Error('Recovered revision checksum differs');
  return {prefix,checkedAt:new Date().toISOString(),...interruption,objectBytesAfterInterruption:afterInterruption?.length??null,incompleteRevisionNotReady:true,recoveredAndReadBackVerified:true};
}

try {
  const stores=storageClients();
  const result={};
  const output=path.join(HARNESS_ROOT,'artifacts',`storage-interruption-${Date.now()}.json`);
  for(const kind of ['private','public']) {
    result[kind]=await probe(stores[`${kind}Store`]);
    await writeJson(output,result);console.log(JSON.stringify({zoneKind:kind,...result[kind]},null,2));
  }
}catch(error){console.error(safeError(error));process.exitCode=1;}
