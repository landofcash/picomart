import fs from 'node:fs/promises';
import path from 'node:path';
import type {CreateOptions} from 'railway';
import {REMOTE_ROOT,safeError,writeJson} from './config.ts';
import {templateSource,loadEnvironment} from './environment.ts';
import {configureSource,type GenerationInput} from './input.ts';
import {modelSettings,generationPrompt,requestEdits} from './model.ts';
import {validateEdits} from './files.ts';
import {runAttempt,validateAndCollect,validationFeedback,proveCollectedPreview} from './build.ts';
import {readDist} from './preview.ts';
import type {Attempt} from './railway.ts';
import {installAcceptance} from './acceptance.ts';

export async function generate(options:CreateOptions,input:GenerationInput,modelCall=requestEdits) {
  modelSettings(); // Fail before provisioning if credentials/model are absent.
  const {source}=await templateSource();
  const environment=await loadEnvironment(source,options);
  let candidate=configureSource(source,input),feedback='';
  const repairLimit=Number(process.env.MAX_REPAIR_ATTEMPTS??1);
  if(!Number.isInteger(repairLimit)||repairLimit<0||repairLimit>1) throw new Error('MAX_REPAIR_ATTEMPTS must be 0 or 1 for the trial');
  const base=`/s/${input.config.shopId}/`;
  for(let index=0;index<=repairLimit;index++) {
    let last:Attempt|undefined;
    let validationStarted=false;
    try {
      const attempt=await runAttempt('generate',options,async attempt=>{
        last=attempt;
        await attempt.create(environment.checkpointName);
        await writeJson(path.join(attempt.directory,'input.json'),input);
        await writeJson(path.join(attempt.directory,'prompt.json'),generationPrompt(candidate,input,feedback));
        attempt.record.status='generating';await attempt.persist();
        const started=Date.now();
        const result=await modelCall(candidate,input,feedback,attempt.signal);
        attempt.checkDeadline();
        attempt.record.timings.modelMs=Date.now()-started;
        await writeJson(path.join(attempt.directory,'model.json'),result);
        validationStarted=true;
        candidate=validateEdits(candidate,result.edits);
        validationStarted=false;
        await attempt.upload(candidate);
        await installAcceptance(attempt,input,base);
        validationStarted=true;
        await validateAndCollect(attempt,candidate,base,'npx --no-install playwright test --config=.harness/playwright.config.mjs');
        for(const name of ['desktop.png','mobile.png']) {
          const bytes=Buffer.from(await attempt.sandbox!.files.read(`${REMOTE_ROOT}/.harness/${name}`,{format:'bytes',length:5*1024*1024+1}));
          if(bytes.length>5*1024*1024)throw new Error('Screenshot size limit exceeded');
          await fs.writeFile(path.join(attempt.directory,name),bytes);
        }
      });
      await proveCollectedPreview(attempt,await readDist(path.join(attempt.directory,'dist')),base);
      return attempt;
    } catch(error) {
      const failedCheck=last?.record.commands.at(-1);
      const repairableCheck=failedCheck&&['typecheck','lint','build','browser-checks'].includes(failedCheck.name)&&failedCheck.exitCode!==undefined&&failedCheck.exitCode!==0&&!failedCheck.timedOut&&!failedCheck.truncated;
      const rejectedEdits=last?.record.commands.length===0&&validationStarted;
      if(!last || last.canceled || last.expired || last.record.cleanup!=='destroyed' || !(repairableCheck||rejectedEdits) || index===repairLimit) throw error;
      feedback=`Previous attempt ${last.record.id}: ${safeError(error)}\n${await validationFeedback(last)}`;
      console.log('Validation failed; starting the single permitted repair in a fresh sandbox.');
    }
  }
  throw new Error('Generation exhausted its attempt budget');
}
