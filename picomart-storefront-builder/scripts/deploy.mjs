import fs from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {railwayCommand, railwayEnvironment} from './railway-cli.mjs';

const root = new URL('../', import.meta.url);
const target = JSON.parse(await fs.readFile(new URL('deployment.json', root), 'utf8'));
const source = parseEnv(await fs.readFile(new URL('.env.local', root), 'utf8'));
const seller = process.argv.includes('--seller'), service = seller ? target.sellerServiceId : target.serviceId;
for (const id of [target.projectId, target.environmentId, service]) if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid deployment scope');
const env = railwayEnvironment(source);
const args = ['up', '.', '--path-as-root', '--detach', '--json', '--project', target.projectId, '--environment', target.environmentId, '--service', service, '--message', seller ? 'Picomart seller deployment' : 'Picomart storefront builder deployment'];
const child = spawn(railwayCommand(), args, {cwd: fileURLToPath(seller ? new URL('../picomart-seller/', root) : root), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
child.on('error', () => { console.error('Could not start Railway CLI'); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
