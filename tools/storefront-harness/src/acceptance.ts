import fs from 'node:fs/promises';
import path from 'node:path';
import {HARNESS_ROOT,REMOTE_ROOT} from './config.ts';
import type {GenerationInput} from './input.ts';
import type {Attempt} from './railway.ts';
export async function installAcceptance(attempt:Attempt,input:GenerationInput,base:string) {
  for(const name of ['acceptance.spec.mjs','playwright.config.mjs']) await attempt.sandbox!.files.write(`${REMOTE_ROOT}/.harness/${name}`,await fs.readFile(path.join(HARNESS_ROOT,'validation',name)));
  await attempt.sandbox!.files.write(`${REMOTE_ROOT}/.harness/input.json`,JSON.stringify({...input,base}));
}
