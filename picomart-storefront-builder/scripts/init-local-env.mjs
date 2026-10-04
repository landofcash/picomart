import fs from 'node:fs/promises';
import {parseEnv} from 'node:util';
const root = new URL('../', import.meta.url);
const values = parseEnv(await fs.readFile(new URL('../tools/storefront-harness/.env.local', root), 'utf8'));
let output = await fs.readFile(new URL('.env.example', root), 'utf8');
for (const name of ['BUNNY_PRIVATE_STORAGE_ENDPOINT', 'BUNNY_PRIVATE_STORAGE_ZONE', 'BUNNY_PRIVATE_STORAGE_KEY']) {
  const value = values[name];
  if (!value || /[\r\n"\\]/.test(value)) throw new Error('Missing or invalid private Bunny setting');
  output = output.replace(new RegExp(`^${name}=.*$`, 'm'), () => `${name}="${value}"`);
}
await fs.writeFile(new URL('.env.local', root), output, {flag: 'wx'});
console.log('Created ignored builder .env.local with private Bunny settings only.');
