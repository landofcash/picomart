import path from 'node:path';
import fs from 'node:fs/promises';
import type {CreateOptions} from 'railway';
import {safeError, writeJson} from './config.ts';
import {templateSource, loadEnvironment} from './environment.ts';
import {Attempt, collect} from './railway.ts';
import {assertProtected, saveFiles, sha256, sourceDigest, type FileSet} from './files.ts';
import {startPreview} from './preview.ts';
import {configureSource,type GenerationInput} from './input.ts';
import {installAcceptance} from './acceptance.ts';

export async function runAttempt(kind:string, options:CreateOptions, operation:(attempt:Attempt)=>Promise<void>) {
  const attempt=new Attempt(kind,options);
  const cancel=()=>attempt.cancel();
  const deadline=setTimeout(()=>attempt.expire(),Math.max(1,attempt.deadline-Date.now()));
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  let failure:unknown;
  try {await operation(attempt);attempt.checkDeadline();attempt.record.status='ready';}
  catch(error){failure=error;attempt.record.status=attempt.canceled?'canceled':'failed';attempt.record.error=safeError(error);}
  finally {
    clearTimeout(deadline);
    await attempt.destroy();
    if(attempt.canceled){attempt.record.status='canceled';failure ||= new Error('Attempt canceled');}
    process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
    if(attempt.sandbox && attempt.record.cleanup!=='destroyed') {attempt.record.status='failed';failure ||= new Error('Sandbox cleanup remains unconfirmed');}
    attempt.record.finishedAt=new Date().toISOString();
    attempt.record.timings.totalMs=Date.now()-Date.parse(attempt.record.startedAt);
    await attempt.persist();
    console.log(`Attempt ${attempt.record.id}: ${attempt.record.status}; cleanup: ${attempt.record.cleanup}`);
    console.log(`Results: ${path.join(attempt.directory,'result.json')}`);
  }
  if(failure) throw failure;
  return attempt;
}
export async function validateAndCollect(attempt:Attempt, source:FileSet, base='/', browserCommand='npm test') {
  await attempt.exec('typecheck','npm run typecheck');
  await attempt.exec('lint','npm run lint');
  // The base is constructed from an already validated shop/revision identifier.
  if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Invalid deployment base');
  await attempt.exec('build',`npm run build -- --base=${base}`);
  await attempt.exec('browser-checks',browserCommand);
  const start=Date.now();
  const collectedSource=await collect(attempt,'source');
  assertProtected(source,collectedSource);
  if(sourceDigest(source)!==sourceDigest(collectedSource)) throw new Error('Source changed during validation');
  const dist=await collect(attempt,'dist');
  await saveFiles(path.join(attempt.directory,'source'),collectedSource);
  await saveFiles(path.join(attempt.directory,'dist'),dist);
  const manifest={schemaVersion:1,attemptId:attempt.record.id,base,sourceDigest:sourceDigest(source),files:[...dist].map(([name,data])=>({path:name,size:data.length,sha256:sha256(data)}))};
  await writeJson(path.join(attempt.directory,'artifact-manifest.json'),manifest);
  attempt.record.artifactBytes=[...dist.values()].reduce((sum,b)=>sum+b.length,0);
  attempt.record.sourceDigest=manifest.sourceDigest;
  attempt.record.timings.collectionMs=Date.now()-start;
  await attempt.persist();
  return dist;
}
export async function build(options:CreateOptions, failureMode?:string,input?:GenerationInput) {
  return runAttempt('build',options,async attempt=>{
    const {source}=await templateSource();
    const environment=await loadEnvironment(source,options);
    await attempt.create(environment.checkpointName);
    const configured=input?configureSource(source,input):source;
    await attempt.upload(configured);
    await writeJson(path.join(attempt.directory,'input.json'),{templateVersion:environment.templateVersion,checkpoint:environment.checkpointName,sourceDigest:sourceDigest(source),failureMode:failureMode||null});
    if(failureMode==='typecheck') await attempt.sandbox!.files.write('/workspace/shop/src/storefront/pages/NotFoundPage.tsx','export default function Broken( {');
    else if(failureMode==='timeout') await attempt.exec('deliberate-timeout','sleep 10','/',1);
    else if(failureMode) throw new Error('Unknown failure mode');
    if(input) {
      const base=`/s/${input.config.shopId}/`;
      await writeJson(path.join(attempt.directory,'input.json'),input);
      await installAcceptance(attempt,input,base);
      await validateAndCollect(attempt,configured,base,'npx --no-install playwright test --config=.harness/playwright.config.mjs');
    } else await validateAndCollect(attempt,source);
  });
}
export async function proveCollectedPreview(attempt:Attempt, files:FileSet, base='/') {
  const preview=await startPreview(files,0,base);
  try {
    const root=await fetch(preview.url);
    const product=await fetch(`${preview.url}products/AAAAAAAAAAAAAAAAAAAAAA`);
    const missing=await fetch(`${preview.url}assets/missing.js`);
    if(!root.ok || !product.ok || missing.status!==404) throw new Error('Collected preview route check failed');
    await writeJson(path.join(attempt.directory,'preview-check.json'),{checkedAt:new Date().toISOString(),sandboxCleanup:attempt.record.cleanup,root:root.status,product:product.status,missingAsset:missing.status});
  } finally {await preview.close();}
}
export async function validationFeedback(attempt:Attempt) {
  let log='';try{log=await fs.readFile(path.join(attempt.directory,'build.log'),'utf8');}catch{/* no command output yet */}
  return log.slice(-24_000);
}
