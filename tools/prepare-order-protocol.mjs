import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const protocol = path.join(root, 'picomart-order-protocol');
const consumers = [];
for (const entry of await fs.readdir(root, {withFileTypes: true})) {
  if (!entry.isDirectory() || !entry.name.startsWith('picomart-')) continue;
  const manifest = JSON.parse(await fs.readFile(path.join(root, entry.name, 'package.json'), 'utf8'));
  if (manifest.dependencies?.['@picomart/order-protocol']) consumers.push(entry.name);
}
consumers.sort();
if (process.argv.includes('--list-consumers')) {
  console.log(consumers.join('\n'));
  process.exit(0);
}
const staging = path.join(root, '.tmp-protocol-pack');
const offline = process.argv.includes('--offline');
function npm(command, cwd, capture = false) {
  const options = {cwd, windowsHide: true, encoding: 'utf8',
    env: {...process.env, npm_config_cache: path.join(root, '.tmp-npm-cache'),
      npm_config_prefer_offline: 'true', npm_config_fetch_retries: '0',
      ...(offline ? {npm_config_offline: 'true'} : {})},
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'};
  return process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', `npm.cmd ${command}`], options)
    : execFileSync('npm', command.split(' '), options);
}
await fs.mkdir(staging, {recursive: true});
npm('run build', protocol);
const [packed] = JSON.parse(npm('pack --ignore-scripts --json --pack-destination ../.tmp-protocol-pack', protocol, true));
if (!/^[a-zA-Z0-9.-]+\.tgz$/.test(packed.filename)) throw new Error('Unexpected package filename');
const archive = await fs.readFile(path.join(staging, packed.filename));
const digest = createHash('sha256').update(archive).digest('hex');
const packageMetadata = JSON.parse(await fs.readFile(path.join(protocol, 'package.json'), 'utf8'));
for (const consumer of consumers) {
  const directory = path.join(root, consumer);
  await fs.mkdir(path.join(directory, 'vendor'), {recursive: true});
  await fs.writeFile(path.join(directory, 'vendor/picomart-order-protocol.tgz'), archive);
  // Preserve the existing locked transitive graph when only the local archive changes.
  // npm validates and reconciles the lockfile during the following install.
  const manifestPath = path.join(directory, 'package.json');
  const lockPath = path.join(directory, 'package-lock.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  const spec = 'file:vendor/picomart-order-protocol.tgz';
  manifest.dependencies['@picomart/order-protocol'] = spec;
  lock.packages[''].dependencies['@picomart/order-protocol'] = spec;
  lock.packages['node_modules/@picomart/order-protocol'] = {
    version: packed.version, resolved: spec, integrity: packed.integrity,
    dependencies: packageMetadata.dependencies, engines: packageMetadata.engines,
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  npm('install --save-exact --ignore-scripts --no-audit --no-fund ./vendor/picomart-order-protocol.tgz', directory);
}
console.log(`Prepared @picomart/order-protocol@${packed.version} for ${consumers.length} consumers; SHA-256 ${digest}`);
