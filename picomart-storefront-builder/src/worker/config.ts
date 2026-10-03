import {z} from 'zod';

export function sandboxEnvironmentId(env: NodeJS.ProcessEnv = process.env): string {
  const result = z.string().uuid().safeParse(env.RAILWAY_SANDBOX_ENVIRONMENT_ID);
  if (!result.success) throw new Error('RAILWAY_SANDBOX_ENVIRONMENT_ID must be a configured Railway environment UUID');
  return result.data;
}

// The measured Phase 2 budgets. No merchant-controlled toolchain or credentials.
export const REMOTE_ROOT = '/workspace/shop';
export function integerSetting(name: string, fallback: number, max = 100_000_000) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
export const limits = () => ({
  commandSeconds: integerSetting('BUILD_TIMEOUT_SECONDS', 600, 1800),
  sourceBytes: 10 * 1024 * 1024, artifactBytes: 50 * 1024 * 1024,
  fileBytes: 5 * 1024 * 1024, logBytes: 4 * 1024 * 1024,
});
