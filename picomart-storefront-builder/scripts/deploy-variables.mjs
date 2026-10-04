import fs from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {railwayCommand, railwayEnvironment} from './railway-cli.mjs';

// Secrets travel through stdin to the authenticated Railway CLI, never command
// arguments, console output, deployment.json or the source upload.
const root = new URL('../', import.meta.url);
const target = JSON.parse(await fs.readFile(new URL('deployment.json', root), 'utf8'));
for (const field of ['projectId', 'environmentId', 'serviceId']) if (!/^[a-f0-9-]{36}$/.test(target[field])) throw new Error(`Invalid ${field}`);
const source = parseEnv(await fs.readFile(new URL('.env.local', root), 'utf8'));
const allowed = Object.keys(parseEnv(await fs.readFile(new URL('.env.example', root), 'utf8')));
const values = Object.fromEntries(allowed.filter(key => source[key] !== undefined && !['RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID'].includes(key)).map(key => [key, source[key]]));
Object.assign(values, target.variables);
for (const key of ['BUILDER_ORIGINS', 'BUNNY_PRIVATE_STORAGE_KEY', 'BUNNY_PUBLIC_STORAGE_KEY', 'RAILWAY_API_TOKEN', 'OPENAI_API_KEY']) if (!values[key]) throw new Error(`Missing ${key}`);
console.log(JSON.stringify({projectId: target.projectId, environmentId: target.environmentId, serviceId: target.serviceId, variableNames: Object.keys(values).sort(), apply: process.argv.includes('--apply')}));
if (process.argv.includes('--apply')) {
  const env = railwayEnvironment(source), executable = railwayCommand();
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('Invalid variable name');
    await new Promise((resolve, reject) => {
      const args = ['variable', 'set', key, '--stdin', '--skip-deploys', '--project', target.projectId, '--environment', target.environmentId, '--service', target.serviceId];
      const child = spawn(executable, args, {windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe']});
      child.stdout.resume(); child.stderr.resume();
      child.on('error', () => reject(new Error(`Could not start Railway CLI for ${key}`)));
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`Railway variable update failed for ${key}; exit ${code}`)));
      child.stdin.on('error', () => {}); child.stdin.end(value);
    });
    console.log(`Configured ${key}`);
  }
}
