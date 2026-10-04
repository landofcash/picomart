import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readSource, sourceDigest} from '../src/worker/files.ts';
import {packSource} from '../src/worker/archive.ts';
const root = new URL('../', import.meta.url), check = process.argv.includes('--check');
const source = await readSource(fileURLToPath(new URL('../../picomart-storefront-template/', import.meta.url)));
const environment = JSON.parse(await fs.readFile(new URL('build-assets/environment.json', root), 'utf8'));
if (check && !process.argv.includes('--local') && !environment.checkpointName) throw new Error('Clean local template is packaged, but its Railway checkpoint has not been prepared. See docs/local/picomart-storefront-builder/DEPLOYMENT.md.');
if (sourceDigest(source) !== environment.sourceDigest) throw new Error('Template changed: prepare a matching checkpoint and update build-assets/environment.json first');
const outputs = new Map<string, Uint8Array>([['template.tar.gz', packSource(source)]]);
for (const name of (await fs.readdir(new URL('../tools/storefront-harness/validation/', root))).filter(name => name.endsWith('.mjs'))) outputs.set(`validation/${name}`, await fs.readFile(new URL(`../tools/storefront-harness/validation/${name}`, root)));
for (const [name, bytes] of outputs) {
  const target = new URL(`build-assets/${name}`, root);
  if (check) { if (!Buffer.from(bytes).equals(await fs.readFile(target))) throw new Error(`Stale build asset: ${name}`); }
  else await fs.writeFile(target, bytes);
}
console.log(check ? (environment.checkpointName ? 'Build assets match the template/checkpoint and acceptance suite.' : 'Local build assets match the template and acceptance suite. Remote checkpoint is pending.') : 'Build assets synchronized.');
