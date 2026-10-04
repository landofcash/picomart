import {existsSync} from 'node:fs';
import {delimiter, join} from 'node:path';

// Execute the native CLI directly. Windows .cmd wrappers require a shell;
// avoiding them keeps arguments literal and credentials only in stdin/env.
export function railwayCommand() {
  if (process.platform !== 'win32') return 'railway';
  const directories = (process.env.PATH || '').split(delimiter);
  const candidates = directories.flatMap(directory => [join(directory, 'railway.exe'), join(directory, 'node_modules', '@railway', 'cli', 'bin', 'railway.exe')]);
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error('Railway native CLI not found on PATH. Install the Railway CLI before deploying.');
  return executable;
}

export function railwayEnvironment(source) {
  const env = {...process.env, RAILWAY_CALLER: 'skill:use-railway@1.4.0', RAILWAY_AGENT_SESSION: 'picomart-phase7-20260910'};
  if ((source.RAILWAY_AUTH_TYPE || 'project-token') === 'project-token') {
    env.RAILWAY_TOKEN = source.RAILWAY_API_TOKEN;
    delete env.RAILWAY_API_TOKEN;
  } else {
    env.RAILWAY_API_TOKEN = source.RAILWAY_API_TOKEN;
    delete env.RAILWAY_TOKEN;
  }
  return env;
}
