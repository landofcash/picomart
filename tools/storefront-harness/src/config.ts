import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {CreateOptions} from 'railway';
import {z} from 'zod';

export const HARNESS_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const TEMPLATE_ROOT = path.resolve(HARNESS_ROOT, '../../picomart-storefront-template');
export const REMOTE_ROOT = '/workspace/shop';
export const SDK_VERSION = '3.11.0';
export const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
export const ENVIRONMENT_ID = process.env.RAILWAY_SANDBOX_ENVIRONMENT_ID ?? process.env.RAILWAY_ENVIRONMENT_ID;
const secrets = new Set<string>();
async function cliToken():Promise<string> {
  // Let the CLI renew its OAuth session; never log its output or credential file.
  if(process.platform==='win32')await promisify(execFile)('cmd.exe',['/d','/c','railway','whoami'],{windowsHide:true,timeout:30000});
  else await promisify(execFile)('railway',['whoami'],{timeout:30000});
  const config=JSON.parse(await fs.readFile(path.join(os.homedir(),'.railway/config.json'),'utf8'));
  const token=config.user?.accessToken||config.user?.token;
  if(!token)throw new Error('Railway CLI session has no access token');
  secrets.add(token);return token;
}

export function integerSetting(name: string, fallback: number, max = 100_000_000): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
export const limits = () => ({
  commandSeconds: integerSetting('BUILD_TIMEOUT_SECONDS', 600, 1800),
  attemptSeconds: integerSetting('ATTEMPT_TIMEOUT_SECONDS', 1800, 7200),
  sourceBytes: integerSetting('MAX_SOURCE_BYTES', 10 * 1024 * 1024),
  artifactBytes: integerSetting('MAX_ARTIFACT_BYTES', 50 * 1024 * 1024),
  fileBytes: 5 * 1024 * 1024,
  logBytes: 4 * 1024 * 1024,
});

export async function railwayOptions(useCliAuth: boolean, env: NodeJS.ProcessEnv = process.env): Promise<CreateOptions> {
  const parsed = z.string().uuid().safeParse(env.RAILWAY_SANDBOX_ENVIRONMENT_ID ?? env.RAILWAY_ENVIRONMENT_ID);
  if (!parsed.success) throw new Error('Set RAILWAY_SANDBOX_ENVIRONMENT_ID (or RAILWAY_ENVIRONMENT_ID) to a Railway environment UUID');
  const environmentId = parsed.data;
  let token = env.RAILWAY_API_TOKEN;
  const usingCli=!token&&useCliAuth;
  if (!token && useCliAuth) {
    token=await cliToken();
  }
  if (!token) throw new Error('Set RAILWAY_API_TOKEN locally, or pass --railway-cli-auth after railway login.');
  const authType=usingCli?'bearer':env.RAILWAY_AUTH_TYPE||'bearer';
  if(authType!=='bearer'&&authType!=='project-token')throw new Error('RAILWAY_AUTH_TYPE must be bearer or project-token.');
  secrets.add(token);
  return {token, authType, environmentId, networkIsolation: 'ISOLATED', idleTimeoutMinutes: 30,
    fetch: async(input,init)=>{
      const headers=new Headers(init?.headers);
      if(headers.has('Authorization'))headers.set('Authorization',`Bearer ${token}`);
      const options={...init,headers,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(120000)])};
      let response=await fetch(input,options);
      if(response.status===401&&usingCli&&headers.has('Authorization')) {
        await response.body?.cancel();token=await cliToken();headers.set('Authorization',`Bearer ${token}`);response=await fetch(input,options);
      }
      return response;
    }};
}

export async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  await fs.rename(temporary, file);
}

export function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) message = message.split(secret).join('[redacted]');
  for (const [name, value] of Object.entries(process.env)) {
    if (value && value.length > 5 && (/KEY|TOKEN|SECRET|PASSWORD/.test(name) || value.startsWith('sk-'))) message = message.split(value).join('[redacted]');
  }
  return message.slice(0, 4000);
}
