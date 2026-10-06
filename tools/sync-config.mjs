import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import '../config/index.mjs'; // Validate the source before distributing it.

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const files = ['package.json', 'picomart.json', 'schema.cjs', 'index.mjs', 'index.d.ts'];
const spec = 'file:vendor/picomart-config';
const stale = [];
let consumers = 0;
for (const entry of await fs.readdir(root, {withFileTypes: true})) {
  if (!entry.isDirectory() || !entry.name.startsWith('picomart-')) continue;
  const directory = path.join(root, entry.name);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  if (!manifest.dependencies?.['@picomart/config']) continue;
  consumers++;
  const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'));
  if (manifest.dependencies['@picomart/config'] !== spec || lock.packages[''].dependencies['@picomart/config'] !== spec ||
      lock.packages['node_modules/@picomart/config']?.resolved !== 'vendor/picomart-config')
    throw new Error(`${entry.name}: configure the local vendor dependency and refresh its lockfile first.`);
  const target = path.join(directory, 'vendor/picomart-config');
  if (!check) await fs.mkdir(target, {recursive: true});
  for (const name of files) {
    const source = await fs.readFile(path.join(root, 'config', name));
    const destination = path.join(target, name);
    if (check) {
      const current = await fs.readFile(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      // Git may check text out with CRLF on Windows and LF on CI.
      if (!current || current.toString().replace(/\r\n/g, '\n') !== source.toString().replace(/\r\n/g, '\n')) stale.push(`${entry.name}/${name}`);
    } else await fs.writeFile(destination, source.toString().replace(/\r\n/g, '\n'));
  }
}
if (!consumers) throw new Error('No config consumers found.');
if (stale.length) throw new Error(`Outdated generated config copies: ${stale.join(', ')}. Run node tools/sync-config.mjs and commit the generated files.`);
console.log(`${check ? 'Verified' : 'Synchronized'} config copies for ${consumers} apps.`);
