import fs from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = await fs.readFile(new URL('../picomart-storefront-template/src/lib/shop/schema.ts', root), 'utf8');
const expected = '// Generated from picomart-storefront-template/src/lib/shop/schema.ts. Run npm run contracts:sync.\n' + source.replace(/\r\n/g, '\n');
const target = new URL('src/domain/public-storefront.ts', root);
if (process.argv.includes('--check')) {
  if ((await fs.readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== expected) throw new Error('Public storefront contract is stale');
} else {
  await fs.mkdir(new URL('src/domain/', root), {recursive: true});
  await fs.writeFile(target, expected);
}
