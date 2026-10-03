import {APP_KEY_PREFIX} from "@/config";

const ansCache = new Map<string, Promise<string | null>>();

export async function resolveName(address: string): Promise<string | null> {
  return address; 
}

export async function resolveAns(address: string): Promise<string | null> {
  // Check in-memory first
  if (ansCache.has(address)) return ansCache.get(address)!;

  // Check localStorage
  const cached = localStorage.getItem(`${APP_KEY_PREFIX}-ans_${address}`);
  if (cached !== null) {
    const result = cached || null;
    ansCache.set(address, Promise.resolve(result));
    return result;
  }

  // Hedera name resolution placeholder
  const fetchPromise = (async () => {
    return null;
  })();

  ansCache.set(address, fetchPromise);
  return fetchPromise;
}
