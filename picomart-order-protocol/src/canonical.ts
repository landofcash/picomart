import canonicalize from "canonicalize/lib/canonicalize.js";
import { bytesToBase64Url } from "./binary.js";

export function canonicalJson(value: unknown): string {
  const serialize = canonicalize as unknown as (input: unknown) => string | undefined;
  const result = serialize(value);
  if (result === undefined) throw new Error("Value cannot be represented as RFC 8785 JSON");
  return result;
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

export async function sha256Bytes(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(value)));
}

export async function sha256Base64Url(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToBase64Url(await sha256Bytes(bytes));
}

export async function canonicalHash(value: unknown): Promise<string> {
  return sha256Base64Url(canonicalBytes(value));
}

export function canonicalEqual(left: unknown, right: unknown): boolean {
  const a = canonicalBytes(left);
  const b = canonicalBytes(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
