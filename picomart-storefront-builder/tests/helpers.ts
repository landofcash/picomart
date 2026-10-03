import {Wallet} from 'ethers';
import {loadConfig, type Network} from '../src/config.ts';
import type {IdentityProvider} from '../src/auth/identity.ts';
import {ApiError} from '../src/domain/errors.ts';
import {Journal} from '../src/storage/journal.ts';
import type {ObjectStore} from '../src/storage/bunny.ts';
import {createApp} from '../src/api/app.ts';

export class MemoryStore implements ObjectStore {
  files = new Map<string, Buffer>();
  beforePut?: (path: string, bytes: Uint8Array) => void;
  afterPut?: (path: string, bytes: Uint8Array) => void;
  async get(path: string, maxBytes = 2 * 1024 * 1024) {
    const bytes = this.files.get(path);
    if (bytes && bytes.length > maxBytes) throw new Error('Too large');
    return bytes ? Buffer.from(bytes) : null;
  }
  async putVerified(path: string, bytes: Uint8Array) {
    this.beforePut?.(path, bytes); this.files.set(path, Buffer.from(bytes)); this.afterPut?.(path, bytes);
  }
  async list(path: string) {
    const entries = new Map<string, boolean>();
    for (const key of this.files.keys()) if (key.startsWith(path + '/')) {
      const relative = key.slice(path.length + 1), name = relative.split('/')[0];
      entries.set(name, relative.includes('/'));
    }
    return [...entries].map(([name, directory]) => ({name, directory}));
  }
}
// Public deterministic keys strictly for tests, never connected to funded accounts.
export const alice = new Wallet('0x' + '11'.repeat(32));
export const bob = new Wallet('0x' + '22'.repeat(32));
export const aliceId = alice.address.toLowerCase(), bobId = bob.address.toLowerCase();
export const seed = 'AQEBAQEBAQEBAQEBAQEBAQ', otherSeed = 'AgICAgICAgICAgICAgICAg';
export const origin = 'http://localhost:5173';
export const design = {branding: {name: 'Test shop', description: 'Current products', headline: 'Browse the shop'}, featuredProductIds: [], collections: [], links: []};
export class TestIdentity implements IdentityProvider {
  accounts = new Map([[`moderato/${aliceId}`, alice.address.toLowerCase()], [`moderato/${bobId}`, bob.address.toLowerCase()]]);
  catalogs = new Map([[`moderato/${seed}`, aliceId], [`moderato/${otherSeed}`, bobId]]);
  async account(network: Network, accountId: string) {
    const signerAddress = this.accounts.get(`${network}/${accountId}`);
    if (!signerAddress) throw new ApiError(404, 'identity_not_found');
    return {accountId, signerAddress};
  }
  async assertCatalogOwner(network: Network, catalogSeed: string, accountId: string) {
    if (this.catalogs.get(`${network}/${catalogSeed}`) !== accountId) throw new ApiError(403, 'catalog_not_owned');
  }
}
export async function fixture(store = new MemoryStore(), identity = new TestIdentity(), clock = {value: Date.parse('2026-09-09T13:00:00Z')}, ready?: () => boolean, publicStore?: MemoryStore) {
  const config = loadConfig({BUILDER_ORIGINS: `${origin},http://localhost:5174`});
  const journal = await Journal.open(store, 'test-builder');
  const {app, auth, shops, previews, publications} = createApp({journal, identity, config, now: () => clock.value, ready, publicStore, publicReader: publicStore?.get.bind(publicStore)});
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  async function request(path: string, options: {method?: string; body?: unknown; token?: string; requestId?: string; network?: string; origin?: string} = {}) {
    const response = await fetch(`${base}/${options.network || 'moderato'}${path}`, {
      method: options.method || 'GET', headers: {Origin: options.origin ?? origin, ...(options.body !== undefined ? {'Content-Type': 'application/json'} : {}),
        ...(options.token ? {Authorization: `Bearer ${options.token}`} : {}), ...(options.requestId ? {'Idempotency-Key': options.requestId} : {})},
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await response.json();
    return {status: response.status, body: body as {success: boolean; data: any; error: string}, headers: response.headers};
  }
  async function login(accountId = aliceId, signer = alice) {
    const challenge = await request('/auth/challenge', {method: 'POST', body: {accountId}});
    if (challenge.status !== 201) throw new Error('Challenge failed');
    const signature = await signer.signMessage(challenge.body.data.message);
    const session = await request('/auth/verify', {method: 'POST', body: {accountId, challengeId: challenge.body.data.challengeId, signature}});
    if (session.status !== 200) throw new Error('Login failed');
    return session.body.data.token as string;
  }
  return {store, identity, journal, auth, shops, previews, publications, config, clock, request, login, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))};
}
