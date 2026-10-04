import fs from 'node:fs/promises';
import {loadConfig} from '../src/config.ts';
import {BunnyStorage} from '../src/storage/bunny.ts';
import {Journal} from '../src/storage/journal.ts';
import {GenerationEngine} from '../src/worker/engine.ts';
import type {GenerationJob} from '../src/domain/records.ts';
import {privateError} from '../src/worker/errors.ts';
// Read-only diagnostic of the input pinning step; no VM, model request, or storage write.
try {
  const config = loadConfig(), evidence = JSON.parse(await fs.readFile(new URL('../artifacts/worker-smoke.json', import.meta.url), 'utf8'));
  const journal = await Journal.open(new BunnyStorage(config.storage), evidence.prefix);
  const job = journal.list<GenerationJob>('job', () => true)[0];
  const pin = await new GenerationEngine(journal, config).pin(job, AbortSignal.timeout(30000));
  console.log(JSON.stringify({valid: true, checkpoint: pin.environment.checkpointName, model: pin.model.model}));
} catch (error) { console.error(privateError(error)); process.exitCode = 1; }
