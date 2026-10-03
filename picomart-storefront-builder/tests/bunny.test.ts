import test from 'node:test';
import assert from 'node:assert/strict';
import {BunnyStorage, sha256} from '../src/storage/bunny.ts';

test('private storage lists directories and verifies checksums on the authenticated primary endpoint', async () => {
  const files = new Map<string, Buffer>(), calls: Array<{url: string; init: RequestInit}> = [];
  const transport = (async (url, init: RequestInit) => {
    calls.push({url: String(url), init});
    if (init.method === 'PUT') { files.set(String(url), Buffer.from(init.body as Uint8Array)); return new Response('', {status: 201}); }
    if (String(url).endsWith('/operations/')) return Response.json([{ObjectName: 'record-1', IsDirectory: true}]);
    return files.has(String(url)) ? new Response(new Uint8Array(files.get(String(url))!)) : new Response('', {status: 404});
  }) as typeof fetch;
  const storage = new BunnyStorage({endpoint: 'https://storage.bunnycdn.com', zone: 'private-test', key: 'fixture-key'}, transport);
  assert.deepEqual(await storage.list('builder/operations'), [{name: 'record-1', directory: true}]);
  await storage.putVerified('builder/record.json', Buffer.from('{"v":1}'));
  const write = calls.find(call => call.init.method === 'PUT')!;
  assert.equal(new Headers(write.init.headers).get('Checksum'), sha256('{"v":1}').toUpperCase());
  assert.ok(calls.every(call => call.url.startsWith('https://storage.bunnycdn.com/private-test/') && call.init.redirect === 'error' && new Headers(call.init.headers).get('AccessKey') === 'fixture-key'));
  const count = calls.length;
  await assert.rejects(storage.get('../secret')); assert.equal(calls.length, count);
  await assert.rejects(storage.get('builder/record.json', 2), /size limit/);
  assert.equal(await storage.get('builder/missing.json'), null);
  assert.throws(() => new BunnyStorage({endpoint: 'https://attacker.example', zone: 'private-test', key: 'fixture-key'}));
});

test('a lost PUT response is recovered with the same bytes, while read-back corruption cannot be accepted', async () => {
  let attempts = 0; const expected = Buffer.from('expected');
  const storage = new BunnyStorage({endpoint: 'https://storage.bunnycdn.com', zone: 'test', key: 'fixture-key'}, (async (_url, init) => {
    if (init?.method === 'PUT') { attempts++; if (attempts === 1) throw new Error('Lost response'); return new Response('', {status: 201}); }
    return new Response(expected);
  }) as typeof fetch);
  await storage.putVerified('trial/file.txt', expected); assert.equal(attempts, 2);
  const corrupt = new BunnyStorage({endpoint: 'https://storage.bunnycdn.com', zone: 'test', key: 'fixture-key'}, (async (_url, init) => init?.method === 'PUT' ? new Response('', {status: 201}) : new Response('different')) as typeof fetch);
  await assert.rejects(corrupt.putVerified('trial/file.txt', expected), /read-back mismatch|size limit/);
});
