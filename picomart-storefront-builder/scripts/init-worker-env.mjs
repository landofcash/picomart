import fs from 'node:fs/promises';
import {parseEnv} from 'node:util';
const root = new URL('../', import.meta.url);
const values = parseEnv(await fs.readFile(new URL('../tools/storefront-harness/.env.local', root), 'utf8'));
const file = new URL('.env.local', root); let output = await fs.readFile(file, 'utf8');
const current = parseEnv(output), example = await fs.readFile(new URL('.env.example', root), 'utf8');
for (const line of example.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/); if (!match || current[match[1]] !== undefined) continue;
  const [_, name, fallback] = match;
  const value = /^(RAILWAY_|OPENAI_)/.test(name) ? values[name] || fallback : fallback;
  if (/[\r\n"\\]/.test(value)) throw new Error(`Invalid setting: ${name}`);
  output += `\n${name}="${value}"`;
}
await fs.writeFile(file, output + '\n');
console.log('Added missing worker settings to ignored .env.local. Existing values preserved; worker activation remains explicit.');
