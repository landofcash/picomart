// Read-only acceptance of the actual indexer. No .env, keys, signing or broadcast.
const fs = require('node:fs/promises');
const path = require('node:path');
const { JsonRpcProvider } = require('ethers');
const { PICOMART_TEMPO_CONFIG } = require('@picomart/order-protocol/tempo');
const { TempoIndexer, createTempoSource } = require('../dist/tempoSync');

async function main() {
  const rpc = new JsonRpcProvider(PICOMART_TEMPO_CONFIG.rpcUrl);
  try {
    const source = createTempoSource(rpc), first = new TempoIndexer(source);
    const begun = Date.now(); await first.tick();
    const initialReplayMs = Date.now() - begun;
    const restart = new TempoIndexer(source), restartedAt = Date.now(); await restart.tick();
    const restartReplayMs = Date.now() - restartedAt;
    const snapshot = restart.snapshot();
    if (!snapshot || !restart.status().ready) throw new Error('Replay not ready');
    const report = { verifiedAt: new Date().toISOString(), readOnly: true, checksPassed: true,
      initialReplayMs, restartReplayMs, status: restart.status(), catalogs: snapshot.catalogs.size,
      orders: snapshot.orders.size, deletedOrders: [...snapshot.orders.values()].filter(o => o.deleted).length,
      checkedMessageCommitments: [...snapshot.orders.values()].reduce((sum, o) => sum + o.messages.length, 0),
      limitations: ['Only observed events establish live evidence; order/UI acceptance remains deferred.',
        'No private message decryption, actual batch/sponsorship transaction or TIP-20 policy test performed.'] };
    await fs.writeFile(path.join(__dirname, '../tempo-sync-verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { rpc.destroy(); }
}
main().catch(() => { console.error('Tempo sync read-only verification failed'); process.exitCode = 1; });
