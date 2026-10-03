import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gzipSync, gunzipSync} from 'node:zlib';
import {packSource, unpackSource} from '../src/worker/archive.ts';
import {sourceDigest, validateEdits} from '../src/worker/files.ts';

test('bounded source archives roundtrip the actual template and reject traversal, links, duplicates and truncation', async () => {
  const archive = await fs.readFile(new URL('../build-assets/template.tar.gz', import.meta.url));
  const files = unpackSource(archive);
  assert.equal([...files.keys()].some(file => /world/i.test(file)), false, 'Packaged source must not retain the retired provider');
  assert.equal([...files.values()].some(bytes => /VITE_WORLD_|WorldVerification|WorldShopVerification/.test(bytes.toString())), false);
  assert.ok(files.has('package-lock.json')); assert.equal(sourceDigest(unpackSource(packSource(files))), sourceDigest(files));
  const raw = gunzipSync(packSource(new Map([['src/a.ts', Buffer.from('test')]])));
  const repairChecksum = (bytes: Buffer) => { bytes.fill(32, 148, 156); const sum = bytes.subarray(0, 512).reduce((sum, byte) => sum + byte, 0); bytes.write(sum.toString(8).padStart(7, '0') + '\0', 148, 8); };
  for (const path of ['../secret', '/absolute', 'src/../../secret', 'src/.env', 'node_modules/malicious.js']) {
    const bad = Buffer.from(raw); bad.fill(0, 0, 100); bad.write(path); repairChecksum(bad); assert.throws(() => unpackSource(gzipSync(bad)));
  }
  for (const type of ['1', '2', '3', '5', 'x', 'g']) { const bad = Buffer.from(raw); bad[156] = type.charCodeAt(0); repairChecksum(bad); assert.throws(() => unpackSource(gzipSync(bad))); }
  assert.throws(() => unpackSource(gzipSync(Buffer.concat([raw.subarray(0, 1024), raw]))), /archive file/);
  assert.throws(() => unpackSource(gzipSync(raw.subarray(0, 1000))));
  assert.throws(() => unpackSource(gzipSync(Buffer.alloc(13 * 1024 * 1024))));
});

test('production edit boundary rejects toolchain edits, external imports, dynamic code and oversize source', async () => {
  const files = unpackSource(await fs.readFile(new URL('../build-assets/template.tar.gz', import.meta.url)));
  for (const edit of [{path: 'package.json', content: '{}'}, {path: 'src/storefront/pages/X.tsx', content: 'import x from "https://example.com/x"; export default x;'},
    {path: 'src/storefront/pages/X.tsx', content: 'export default eval("1")'}, {path: 'src/storefront/theme.css', content: '@import "https://example.com/x.css";'},
    {path: 'src/storefront/theme.css', content: 'x'.repeat(5 * 1024 * 1024 + 1)}]) assert.throws(() => validateEdits(files, [edit]));
});
