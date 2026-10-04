import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {publishAttempt,selectRevision,probeHosting} from '../src/hosting.ts';
import {storageClients} from '../src/storage.ts';
import {verifiedArtifact} from '../src/artifacts.ts';
import {sha256} from '../src/files.ts';
import {safeError,writeJson} from '../src/config.ts';

// Only the two already validated pantry artifacts participate in this trial.
const prior='2026-09-09T03-13-46-379Z-2189dacf';
const generated='2026-09-09T11-46-43-790Z-e0d19f69';
const shop='picomart-demo';
const result={startedAt:new Date().toISOString(),shop,prior,generated,steps:[]};
const evidence='artifacts/hosting-switch-check.json';
let store,restore=false;
try {
  const original=await verifiedArtifact(prior),next=await verifiedArtifact(generated);
  if(original.manifest.base!==`/s/${shop}/`||next.manifest.base!==original.manifest.base)throw new Error('Unexpected trial shop');
  store=storageClients().publicStore;
  const selected=JSON.parse((await store.get(`phase2/shops/${shop}/current.json`)).toString());
  if(selected.revision!==generated)throw new Error('Shop selection changed before the trial; do not overwrite it');
  const origin=new URL(process.env.STOREFRONT_RESOLVER_BASE_URL);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('Invalid resolver origin');
  const other=await fetch(new URL('/s/studio-fixture/',origin),{signal:AbortSignal.timeout(30000)});
  if(!other.ok)throw new Error('Second trial shop is unavailable');const otherHash=sha256(Buffer.from(await other.arrayBuffer()));
  async function check(revision,label,browser=false) {
    await probeHosting(revision);
    const response=await fetch(new URL(`/s/${shop}/`,origin),{redirect:'error',signal:AbortSignal.timeout(30000)});
    if(response.headers.get('x-picomart-revision')!==revision||response.headers.get('cache-control')!=='no-store')throw new Error('Selection/cache headers differ');await response.body?.cancel();
    const untouched=await fetch(new URL('/s/studio-fixture/',origin),{signal:AbortSignal.timeout(30000)});
    if(!untouched.ok||sha256(Buffer.from(await untouched.arrayBuffer()))!==otherHash)throw new Error('Changing pantry affected the other shop');
    if(browser){const child=await promisify(execFile)(process.execPath,['--env-file=.env.local','validation/check-collected.mjs',revision,'--hosted'],{timeout:120000,windowsHide:true});console.log(child.stdout.trim());}
    result.steps.push({label,revision,checkedAt:new Date().toISOString(),httpIntegrity:true,otherShopUnchanged:true,browser});await writeJson(evidence,result);
  }
  await check(generated,'initial generated revision');
  restore=true;
  await publishAttempt(prior);await check(prior,'publish original design',true);
  await selectRevision(store,shop,generated);await check(generated,'publish generated design',true);
  // Old page resources remain usable after the current HTML has changed.
  const retained=[...original.files].filter(([name])=>name.startsWith('assets/')&&!next.files.has(name));
  if(!retained.length)throw new Error('Trial must include distinct old assets');
  for(const [name,expected] of retained){const response=await fetch(new URL(`/s/${shop}/${name}`,origin),{signal:AbortSignal.timeout(30000)});if(!response.ok||sha256(Buffer.from(await response.arrayBuffer()))!==sha256(expected))throw new Error('Old asset changed after publication');}
  result.oldAssetsRetained=retained.length;
  try {await selectRevision(store,shop,'missing-incomplete-revision');throw new Error('Incomplete revision was selected');}catch(error){if(error?.status!==404)throw error;}
  await check(generated,'incomplete selection rejected');
  await selectRevision(store,shop,prior);await check(prior,'rollback to original design');
  await selectRevision(store,shop,generated);await check(generated,'restore generated design');
  restore=false;result.completedAt=new Date().toISOString();result.status='passed';
}catch(error){result.status='failed';result.error=safeError(error);process.exitCode=1;}
finally {
  if(restore&&store){try{await selectRevision(store,shop,generated);await probeHosting(generated);result.restoredAfterFailure=true;}catch(error){result.restoreError=safeError(error);process.exitCode=1;}}
  await writeJson(evidence,result);console.log(JSON.stringify(result,null,2));
}
