import fs from 'node:fs/promises';
import path from 'node:path';
import {Sandbox,SandboxNotFoundError,type CreateOptions} from 'railway';
import {HARNESS_ROOT,writeJson} from './config.ts';
import {safeRelative} from './files.ts';
import {Attempt,type AttemptRecord} from './railway.ts';
export async function cleanup(id:string,options:CreateOptions) {
  if(safeRelative(id).includes('/'))throw new Error('Invalid attempt ID');
  const directory=path.join(HARNESS_ROOT,'artifacts',id);
  const record:AttemptRecord=JSON.parse(await fs.readFile(path.join(directory,'result.json'),'utf8'));
  if(record.id!==id||record.environmentId!==options.environmentId||!record.sandboxId)throw new Error('Attempt has no owned sandbox in this environment');
  const attempt=new Attempt(record.kind,options);attempt.record=record;attempt.directory=directory;
  const listed=await Sandbox.list(options);
  const found=listed.find(s=>s.id===record.sandboxId);
  if(!found||found.status==='DESTROYED') {record.cleanup='destroyed';await writeJson(path.join(directory,'result.json'),record);console.log('Sandbox is already destroyed or absent from the dedicated environment');return;}
  try {attempt.sandbox=await Sandbox.connect(record.sandboxId,options);}catch(error){if(!(error instanceof SandboxNotFoundError))throw error;record.cleanup='destroyed';await attempt.persist();return;}
  await attempt.destroy();
  if(record.cleanup!=='destroyed')throw new Error('Sandbox cleanup remains unconfirmed');
  console.log(`Confirmed cleanup of attempt ${id}`);
}
