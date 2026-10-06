import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3402),
  NODE_ENV: z.string().default("development"),
  PICOMART_SYNC_ORIGIN: z.string().url(),
  PICOMART_TEMPO_RPC_URL: z.string().url().default(PICOMART_TEMPO_CONFIG.rpcUrl),
  PICOMART_RESOURCE_ORIGIN: z.string().url(),
  PICOMART_CATALOG_ORIGINS: z.string().min(1),
  PICOMART_QUOTE_SIGNING_KID: z.string().min(1),
  PICOMART_QUOTE_SIGNING_KEY_PKCS8: z.string().min(1),
  PICOMART_QUOTE_PUBLIC_KEY: z.string().min(1),
  PICOMART_QUOTE_PUBLIC_KEYS: z.string().optional(),
  PICOMART_REDIS_URL: z.string().default("memory://"),
  PICOMART_CORS_ORIGINS: z.string().default(""),
  PICOMART_CATALOG_MAX_BYTES: z.coerce.number().int().positive().default(1_048_576),
  PICOMART_RECOVERY_SECONDS: z.coerce.number().int().positive().default(86_400),
  PICOMART_SYNC_RETRY_SECONDS: z.coerce.number().int().positive().default(5),
}).passthrough();

export type ServerConfig = {
  tempoRpcUrl: string;
  port: number;
  syncOrigin: string;
  resourceOrigin: string;
  catalogOrigins: Set<string>;
  signingKid: string;
  signingKeyPkcs8: string;
  quotePublicKey: string;
  quotePublicKeys: Map<string, string>;
  redisUrl: string;
  corsOrigins: Set<string>;
  catalogMaxBytes: number;
  recoverySeconds: number;
  retrySeconds: number;
  now: () => number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const value = schema.parse(env);
  const bareOrigin = (input: string) => {
    const url = new URL(input);
    if (url.protocol !== "https:" && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) {
      throw new Error("Configured origins must use HTTPS");
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Expected bare origin");
    return url.origin;
  };
  const configuredKeyring = value.PICOMART_QUOTE_PUBLIC_KEYS
    ? z.record(z.string(), z.string().min(1)).parse(JSON.parse(value.PICOMART_QUOTE_PUBLIC_KEYS))
    : {};
  configuredKeyring[value.PICOMART_QUOTE_SIGNING_KID] = value.PICOMART_QUOTE_PUBLIC_KEY;
  if (value.NODE_ENV === "production" && value.PICOMART_REDIS_URL === "memory://") {
    throw new Error("Production x402 deployments require PICOMART_REDIS_URL");
  }
  return {
    tempoRpcUrl: bareOrigin(value.PICOMART_TEMPO_RPC_URL),
    port: value.PORT,
    syncOrigin: bareOrigin(value.PICOMART_SYNC_ORIGIN),
    resourceOrigin: bareOrigin(value.PICOMART_RESOURCE_ORIGIN),
    catalogOrigins: new Set(value.PICOMART_CATALOG_ORIGINS.split(",").map(origin => bareOrigin(origin.trim()))),
    signingKid: value.PICOMART_QUOTE_SIGNING_KID,
    signingKeyPkcs8: value.PICOMART_QUOTE_SIGNING_KEY_PKCS8.replace(/\\n/g, "\n"),
    quotePublicKey: value.PICOMART_QUOTE_PUBLIC_KEY,
    quotePublicKeys: new Map(Object.entries(configuredKeyring)),
    redisUrl: value.PICOMART_REDIS_URL,
    corsOrigins: new Set(value.PICOMART_CORS_ORIGINS.split(",").filter(Boolean).map(origin => bareOrigin(origin.trim()))),
    catalogMaxBytes: value.PICOMART_CATALOG_MAX_BYTES,
    recoverySeconds: value.PICOMART_RECOVERY_SECONDS,
    retrySeconds: value.PICOMART_SYNC_RETRY_SECONDS,
    now: () => Math.floor(Date.now() / 1000),
  };
}
