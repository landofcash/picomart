import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ArtifactPath} from '../domain/records.ts';

export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value));
export interface ObjectStore {
  get(path: string, maxBytes?: number): Promise<Buffer | null>;
  putVerified(path: string, bytes: Uint8Array): Promise<void>;
  list(path: string): Promise<Array<{name: string; directory: boolean}>>;
}
export class StorageError extends Error {
  status: number;
  constructor(status: number) { super('Private storage request failed'); this.status = status; }
}
// Uses the Phase 2 harness's checksum + authenticated primary read-back contract.
export class BunnyStorage implements ObjectStore {
  #endpoint: string;
  #zone: string;
  #key: string;
  #transport: typeof fetch;
  constructor(options: {endpoint: string; zone: string; key: string}, transport: typeof fetch = fetch) {
    if (!/^https:\/\/(?:(?:[a-z]{2}|syd)\.)?storage\.bunnycdn\.com$/.test(options.endpoint) || !/^[A-Za-z0-9_-]+$/.test(options.zone) || !options.key) throw new Error('Configure private Bunny zone credentials');
    this.#endpoint = options.endpoint; this.#zone = options.zone; this.#key = options.key; this.#transport = transport;
  }
  async #request(method: string, file: string, bytes?: Uint8Array, directory = false) {
    ArtifactPath.parse(file);
    const response = await this.#transport(`${this.#endpoint}/${this.#zone}/${file}${directory ? '/' : ''}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {AccessKey: this.#key, ...(bytes ? {'Content-Type': 'application/octet-stream', Checksum: sha256(bytes).toUpperCase()} : {})},
      body: bytes ? new Uint8Array(bytes) : undefined,
    });
    if (!response.ok) { await response.body?.cancel(); throw new StorageError(response.status); }
    return response;
  }
  async #read(response: Response, maxBytes: number) {
    const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw new Error('Private object exceeds size limit'); chunks.push(value); }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks);
  }
  async get(file: string, maxBytes = 2 * 1024 * 1024) {
    try { return await this.#read(await this.#request('GET', file), maxBytes); }
    catch (error) { if (error instanceof StorageError && error.status === 404) return null; throw error; }
  }
  async putVerified(file: string, bytes: Uint8Array) {
    if (bytes.length > 50 * 1024 * 1024) throw new Error('Private write exceeds size limit');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.#request('PUT', file, bytes); await response.body?.cancel();
        const actual = await this.get(file, bytes.length + 1);
        if (!actual || sha256(actual) !== sha256(bytes)) throw new Error('Private storage read-back mismatch');
        return;
      } catch (error) {
        if (attempt === 2 || error instanceof StorageError && error.status < 500 && error.status !== 429) throw error;
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }
  async list(file: string) {
    let bytes: Buffer;
    try { bytes = await this.#read(await this.#request('GET', file, undefined, true), 32 * 1024 * 1024); }
    catch (error) { if (error instanceof StorageError && error.status === 404) return []; throw error; }
    const entries = z.array(z.object({ObjectName: z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/), IsDirectory: z.boolean()})).max(100000).parse(JSON.parse(bytes.toString()));
    return entries.map(entry => ({name: entry.ObjectName, directory: entry.IsDirectory}));
  }
}
