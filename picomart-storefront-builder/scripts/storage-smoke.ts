import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {loadConfig} from '../src/config.ts';
import {BunnyStorage} from '../src/storage/bunny.ts';
import {Journal, receipt} from '../src/storage/journal.ts';
import {GenerationJobSchema, ShopSchema, type GenerationJob, type Shop} from '../src/domain/records.ts';

async function main() {
  const config = loadConfig(), storage = new BunnyStorage(config.storage);
  if (process.argv.includes('--recover')) {
    const prefix = process.argv[3], shopId = process.argv[4], requestId = process.argv[5];
    if (!/^builder-smoke-[a-f0-9-]{36}$/.test(prefix)) throw new Error('Invalid smoke prefix');
    const journal = await Journal.open(storage, prefix);
    const shop = journal.get<Shop>('shop', 'moderato', '0x1111111111111111111111111111111111111111', shopId);
    if (!shop || journal.list<GenerationJob>('job', job => job.shopId === shopId && job.state === 'queued').length !== 1) throw new Error('Records did not survive process exit');
    const existing = await journal.transact(receipt('moderato/0x1111111111111111111111111111111111111111', requestId, 'smoke-job', {shopId}), async () => { throw new Error('Retry attempted duplicate work'); });
    if (existing.status !== 202) throw new Error('Retry receipt missing');
    console.log('Fresh process recovered the shop, queued job and original retry receipt.');
    return;
  }
  const prefix = `builder-smoke-${randomUUID()}`, journal = await Journal.open(storage, prefix), now = new Date().toISOString(), shopId = randomUUID(), requestId = randomUUID();
  const shop = ShopSchema.parse({schemaVersion: 2, kind: 'shop', id: shopId, recordVersion: 1, createdAt: now, updatedAt: now,
    network: 'moderato', ownerAccountId: '0x1111111111111111111111111111111111111111', catalogSeed: 'AQEBAQEBAQEBAQEBAQEBAQ', selectedDraftId: null, publishedRevisionId: null,
    config: {schemaVersion: 2, shopId, network: 'moderato', catalogSeed: 'AQEBAQEBAQEBAQEBAQEBAQ', branding: {name: 'Storage smoke fixture', description: 'Private persistence test', headline: 'Private storage test'}}});
  const job = GenerationJobSchema.parse({schemaVersion: 2, kind: 'job', id: randomUUID(), recordVersion: 1, createdAt: now, updatedAt: now,
    network: 'moderato', ownerAccountId: '0x1111111111111111111111111111111111111111', shopId, catalogSeed: shop.catalogSeed, config: shop.config, state: 'queued', brief: 'Private storage smoke fixture', baseRevisionId: null, attemptIds: [], revisionId: null});
  await journal.transact(null, async () => ({changes: [shop], result: {status: 201, data: shop}}));
  await journal.transact(receipt('moderato/0x1111111111111111111111111111111111111111', requestId, 'smoke-job', {shopId}), async () => ({changes: [job], result: {status: 202, data: job}}));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [process.argv[1], '--recover', prefix, shopId, requestId], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.resume();
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Fresh process recovery check failed')));
  });
  await fs.mkdir(new URL('../artifacts/', import.meta.url), {recursive: true});
  const result = {checkedAt: new Date().toISOString(), prefix, verifiedPrimaryWrites: true, freshProcessRecovery: true, queuedJobRecovered: true, idempotentRetry: true,
    scope: 'Private isolated storage fixture only; no wallet authentication, sandbox or publication'};
  await fs.writeFile(new URL('../artifacts/storage-smoke.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => { console.error('Storage smoke failed; no credentials or provider bodies logged.'); process.exitCode = 1; });
