import path from 'node:path';
import {parseArgs} from 'node:util';
import {railwayOptions, HARNESS_ROOT, safeError} from './config.ts';
import {prepare} from './environment.ts';
import {build, runAttempt, proveCollectedPreview} from './build.ts';
import {readDist, startPreview} from './preview.ts';
import {safeRelative} from './files.ts';
import {readInput} from './input.ts';
import {generate} from './generate.ts';
import {cleanup} from './cleanup.ts';
import {verifiedArtifact} from './artifacts.ts';
import {storageClients,storageProbe} from './storage.ts';
import {writeJson} from './config.ts';
import {publishAttempt,selectRevision,serveHosting,probeHosting} from './hosting.ts';
import {Sandbox} from 'railway';

async function main() {
  const {positionals,values}=parseArgs({allowPositionals:true,options:{'railway-cli-auth':{type:'boolean'},preview:{type:'boolean'},attempt:{type:'string'},port:{type:'string'},'failure-mode':{type:'string'},fixture:{type:'string'},input:{type:'string'},shop:{type:'string'},revision:{type:'string'}}});
  const command=positionals[0];
  if(command==='preview') {
    if(!values.attempt || safeRelative(values.attempt).includes('/')) throw new Error('Pass --attempt with the saved attempt ID');
    const {files,manifest}=await verifiedArtifact(values.attempt);
    const preview=await startPreview(files,Number(values.port||4178),manifest.base);
    console.log(`Preview: ${preview.url}`);return;
  }
  if(command==='storage-probe') {
    const {privateStore,publicStore}=storageClients();
    const result={private:await storageProbe(privateStore),public:await storageProbe(publicStore)};
    await writeJson(path.join(HARNESS_ROOT,'artifacts',`storage-probe-${Date.now()}.json`),result);console.log(JSON.stringify(result,null,2));return;
  }
  if(command==='publish') {if(!values.attempt)throw new Error('Pass --attempt');console.log(await publishAttempt(values.attempt));return;}
  if(command==='hosting-probe') {if(!values.attempt)throw new Error('Pass --attempt');console.log(await probeHosting(values.attempt));return;}
  if(command==='hosting-serve') {console.log(`Trial resolver: ${(await serveHosting(storageClients().publicStore,Number(values.port||4180))).url}`);return;}
  if(command==='hosting-select') {if(!values.shop||!values.revision)throw new Error('Pass --shop and --revision');await selectRevision(storageClients().publicStore,values.shop,values.revision);console.log('Revision selected');return;}
  const options=await railwayOptions(Boolean(values['railway-cli-auth']));
  if(command==='status') {console.log(JSON.stringify({environmentId:options.environmentId,sandboxes:(await Sandbox.list(options)).map(s=>({id:s.id,status:s.status})),checkpoints:(await Sandbox.checkpoints(options)).map(c=>({id:c.id,name:c.key}))},null,2));return;}
  if(command==='prepare') {await runAttempt('prepare',options,async attempt=>{await prepare(attempt);});return;}
  if(command==='cleanup') {if(!values.attempt)throw new Error('Pass --attempt');await cleanup(values.attempt,options);return;}
  if(command==='generate') {const attempt=await generate(options,await readInput(values.input,values.fixture));if(values.preview){const {files,manifest}=await verifiedArtifact(attempt.record.id);console.log(`Preview: ${(await startPreview(files,Number(values.port||4178),manifest.base)).url}`);}return;}
  if(command==='build') {
    const input=values.fixture||values.input?await readInput(values.input,values.fixture):undefined;
    const attempt=await build(options,values['failure-mode'],input);
    const files=await readDist(path.join(attempt.directory,'dist'));
    const base=input?`/s/${input.config.shopId}/`:'/';
    await proveCollectedPreview(attempt,files,base);
    if(values.preview) console.log(`Preview: ${(await startPreview(files,Number(values.port||4178),base)).url}`);
    return;
  }
  throw new Error('Use sandbox:prepare, sandbox:build, sandbox:generate, sandbox:cleanup, storage:probe, or preview.');
}
main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
