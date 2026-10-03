import os from "node:os";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  PICOMART_X402_ORIGIN: z.string().url().default("https://x402.picomart.zkbytes.com"),
  PICOMART_SYNC_ORIGIN: z.string().url().default("https://sync.picomart.zkbytes.com"),
  PICOMART_FRONTEND_ORIGIN: z.string().url().default("https://app.picomart.zkbytes.com"),
  PICOMART_MCP_DATA_DIR: z.string().optional(),
  PICOMART_QUOTE_PUBLIC_KEYS: z.string().default('{}'),
}).passthrough();

export type McpConfig = {
  quotePublicKeys: Record<string,string>;
  x402Origin: string;
  syncOrigin: string;
  frontendOrigin: string;
  dataDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env, platform = process.platform): McpConfig {
  const value = schema.parse(env);
  const origin = (input: string) => {
    const url = new URL(input);
    if ((url.protocol !== "https:" && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Picomart origins must be bare HTTPS origins");
    }
    return url.origin;
  };
  const defaultData = platform === "win32"
    ? path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Picomart", "mcp")
    : path.join(env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "picomart", "mcp");
  return {
    quotePublicKeys: z.record(z.string(),z.string()).parse(JSON.parse(value.PICOMART_QUOTE_PUBLIC_KEYS)),
    x402Origin: origin(value.PICOMART_X402_ORIGIN),
    syncOrigin: origin(value.PICOMART_SYNC_ORIGIN),
    frontendOrigin: origin(value.PICOMART_FRONTEND_ORIGIN),
    dataDir: path.join(value.PICOMART_MCP_DATA_DIR ? path.resolve(value.PICOMART_MCP_DATA_DIR) : defaultData,'tempo-moderato-v2'),
  };
}
