import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {railwayCommand} from '../picomart-storefront-builder/scripts/railway-cli.mjs';

// Configure only the already connected main-branch triggers in this manifest.
// No credentials are read, printed, or written by this helper.
const target=JSON.parse(await fs.readFile(new URL('./services.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply');
const env={...process.env,RAILWAY_CALLER:'skill:use-railway@1.6.1',RAILWAY_AGENT_SESSION:'picomart-autodeploy-ci'};
function api(query,variables) {
  const result=JSON.parse(execFileSync(railwayCommand(),['api',query,'--variables',JSON.stringify(variables)],{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
  if(result.errors?.length)throw new Error('Railway API rejected the operation');
  return result.data??result;
}
const triggers=[];
for(const service of target.services.filter(service=>service.autoDeploy)) {
  const result=api('query($id:String!){service(id:$id){id projectId repoTriggers{edges{node{id repository branch environmentId checkSuites}}}}}',{id:service.id});
  if(result.service.projectId!==target.projectId)throw new Error('Service belongs to a different project');
  const matches=result.service.repoTriggers.edges.map(edge=>edge.node).filter(trigger=>trigger.environmentId===target.environmentId&&trigger.repository===target.repo&&trigger.branch===target.branch);
  console.log(`${service.name}: ${matches.length?'GitHub source connected':'GitHub source not connected'}${matches.length?`; Wait for CI ${matches.every(trigger=>trigger.checkSuites)?'enabled':'disabled'}`:''}`);
  if(apply&&matches.length!==1)throw new Error(`Connect exactly one ${target.repo}@${target.branch} source for ${service.name} before applying`);
  triggers.push(...matches);
}
if(apply)for(const trigger of triggers) {
  const result=api('mutation($id:String!,$input:DeploymentTriggerUpdateInput!){deploymentTriggerUpdate(id:$id,input:$input){id checkSuites}}',{id:trigger.id,input:{checkSuites:true}});
  if(!result.deploymentTriggerUpdate.checkSuites)throw new Error('Wait for CI was not enabled');
  console.log(`Wait for CI enabled: ${trigger.id}`);
}
