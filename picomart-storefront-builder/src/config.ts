import {PICOMART_CONFIG, PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {z} from 'zod';

export const NetworkSchema = z.enum(['moderato']);
export type Network = z.infer<typeof NetworkSchema>;
function origin(value: string) {
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Expected HTTPS origin or local HTTP origin');
  return value;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  function integer(name: string, fallback: number, min: number, max: number) {
    return z.coerce.number().int().min(min).max(max).parse(env[name] ?? fallback);
  }
  if ((env.BUILDER_COORDINATOR_COUNT ?? '1') !== '1') throw new Error('This storage prefix requires exactly one coordinator');
  const prefix = env.BUILDER_STORAGE_PREFIX || 'picomart-tempo-moderato-builder-v2';
  if (prefix === 'picomart-builder-v1' || !/^[a-zA-Z0-9_-]{1,80}$/.test(prefix)) throw new Error('Invalid builder storage prefix');
  const origins = new Set((env.BUILDER_ORIGINS || `http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,${PICOMART_CONFIG.app.sellerUrl}`).split(',').map(origin));
  const previewOrigin = origin(env.BUILDER_PREVIEW_ORIGIN || 'http://127.0.0.1:4181');
  if (origins.has(previewOrigin) || ['picomart.zkbytes.com', 'app.picomart.zkbytes.com', 'seller.picomart.zkbytes.com', 'promo.picomart.zkbytes.com'].includes(new URL(previewOrigin).hostname)) throw new Error('Preview origin must be dedicated to generated websites');
  const publicOrigin = origin(env.BUILDER_PUBLIC_ORIGIN || 'http://127.0.0.1:4184');
  if (origins.has(publicOrigin) || publicOrigin === previewOrigin || ['picomart.zkbytes.com', 'app.picomart.zkbytes.com', 'seller.picomart.zkbytes.com', 'promo.picomart.zkbytes.com'].includes(new URL(publicOrigin).hostname)) throw new Error('Public origin must be dedicated to published websites');
  return {
    port: integer('PORT', 4180, 1, 65535), host: env.HOST || '127.0.0.1', prefix,
    requireDeploymentVolume: z.enum(['true', 'false']).parse(env.BUILDER_REQUIRE_DEPLOYMENT_VOLUME ?? 'false') === 'true',
    origins,
    previewOrigin, previewPort: integer('PREVIEW_PORT', 4181, 1, 65535),
    previewTtl: integer('BUILDER_PREVIEW_TTL_SECONDS', 900, 60, 3600) * 1000,
    publicOrigin, publicPort: integer('PUBLIC_PORT', 4184, 1, 65535),
    publicBaseUrl: env.BUNNY_PUBLIC_BASE_URL ? origin(env.BUNNY_PUBLIC_BASE_URL.replace(/\/+$/, '')) : '',
    publicStorage: {endpoint: env.BUNNY_PUBLIC_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com', zone: env.BUNNY_PUBLIC_STORAGE_ZONE || '', key: env.BUNNY_PUBLIC_STORAGE_KEY || ''},
    networks: new Set((env.BUILDER_NETWORKS || 'moderato').split(',').map(value => NetworkSchema.parse(value))),
    challengeTtl: integer('BUILDER_CHALLENGE_TTL_SECONDS', 300, 30, 600) * 1000,
    sessionTtl: integer('BUILDER_SESSION_TTL_SECONDS', 43200, 60, 86400) * 1000,
    maxOperations: integer('BUILDER_MAX_OPERATIONS', 50000, 10, 100000),
    maxPendingWrites: integer('BUILDER_MAX_PENDING_WRITES', 32, 1, 128),
    maxQueuedJobs: integer('BUILDER_MAX_QUEUED_JOBS_PER_SHOP', 10, 1, 100),
    workerEnabled: z.enum(['true', 'false']).parse(env.BUILDER_WORKER_ENABLED ?? 'false') === 'true',
    maxConcurrentBuilds: integer('MAX_CONCURRENT_BUILDS', 2, 1, 20),
    maxConcurrentBuildsPerShop: integer('MAX_CONCURRENT_BUILDS_PER_SHOP', 1, 1, 20),
    maxAttempts: integer('MAX_BUILD_ATTEMPTS', 2, 1, 2),
    attemptMs: integer('ATTEMPT_TIMEOUT_SECONDS', 1800, 30, 7200) * 1000,
    workerPollMs: integer('WORKER_POLL_MS', 2000, 100, 60000),
    syncOrigin: origin(env.BUILDER_SYNC_ORIGIN || PICOMART_TEMPO_CONFIG.services.syncOrigin),
    tempoRpcOrigin: origin(env.BUILDER_TEMPO_RPC_ORIGIN || PICOMART_TEMPO_CONFIG.rpcUrl),
    storage: {endpoint: env.BUNNY_PRIVATE_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com', zone: env.BUNNY_PRIVATE_STORAGE_ZONE || '', key: env.BUNNY_PRIVATE_STORAGE_KEY || ''},
  };
}
export type Config = ReturnType<typeof loadConfig>;
