import {loadConfig} from './config.ts';
import {BunnyStorage} from './storage/bunny.ts';
import {Journal} from './storage/journal.ts';
import {PicomartIdentity} from './auth/identity.ts';
import {createApp} from './api/app.ts';
import {Coordinator} from './worker/coordinator.ts';
import {BuildFailure, RailwayProvider} from './worker/provider.ts';
import {GenerationEngine, loadCheckpoint} from './worker/engine.ts';
import {readHttp} from './publishing/delivery.ts';
import {assertDeploymentVolume} from './deployment.ts';
import {startupDiagnostic} from './startup-diagnostics.ts';

let startupStage = 'configuration';
function stage(value: string) {
  startupStage = value;
  console.info(JSON.stringify({event: 'builder_startup_stage', stage: value}));
}

async function main() {
  stage('configuration');
  const config = loadConfig();
  stage('coordinator_volume');
  await assertDeploymentVolume(config);
  stage('checkpoint_metadata');
  if (config.workerEnabled) await loadCheckpoint();
  stage('publication_configuration');
  const publicationConfigured = !!(config.publicStorage.key || config.publicBaseUrl);
  if (publicationConfigured && (!config.publicStorage.key || !config.publicStorage.zone || !config.publicBaseUrl || config.publicStorage.zone === config.storage.zone)) throw new Error('Configure separate public Bunny storage and its CDN URL');
  if ([config.previewPort, config.publicPort].includes(config.port) || config.previewPort === config.publicPort) throw new Error('API, preview and public listeners need separate ports');
  const publicStore = publicationConfigured ? new BunnyStorage(config.publicStorage) : undefined;
  stage('private_storage');
  const privateStore = new BunnyStorage(config.storage);
  stage('journal_replay');
  const journal = await Journal.open(privateStore, config.prefix, config.maxOperations, config.maxPendingWrites);
  stage('worker_configuration');
  const worker = config.workerEnabled ? new Coordinator(journal, config, new RailwayProvider(config.prefix), new GenerationEngine(journal, config)) : undefined;
  let ready = false;
  stage('application_setup');
  const {app, previews, publications} = createApp({journal, config, identity: new PicomartIdentity(config), ready: () => ready,
    publicStore, publicReader: publicStore ? (file, maxBytes) => readHttp(`${config.publicBaseUrl}/${file}`, maxBytes) : undefined});
  // Bind the listener before scheduling/writing. A second local start on the same
  // address must fail before it can provision work from a stale journal snapshot.
  stage('api_listener');
  const server = app.listen(config.port, config.host);
  let previewServer: ReturnType<typeof app.listen> | undefined;
  let publicServer: ReturnType<typeof app.listen> | undefined;
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    stage('preview_listener');
    previewServer = previews.app().listen(config.previewPort, config.host);
    await new Promise<void>((resolve, reject) => { previewServer!.once('listening', resolve); previewServer!.once('error', reject); });
    if (publications) {
      stage('public_listener');
      publicServer = publications.delivery.app().listen(config.publicPort, config.host);
      await new Promise<void>((resolve, reject) => { publicServer!.once('listening', resolve); publicServer!.once('error', reject); });
    }
    stage('worker_reconciliation');
    await worker?.start(); ready = true;
    stage('publication_start');
    publications?.start();
    stage('ready');
    console.log(`Storefront builder listening on ${config.host}:${config.port}`);
    console.log(`Private preview listener on ${config.host}:${config.previewPort}`);
    if (publicServer) console.log(`Public shop listener on ${config.host}:${config.publicPort}`);
  } catch (error) {
    server.close(); previewServer?.close(); publicServer?.close();
    // Cleanup must not replace the original startup failure in diagnostics.
    for (const stop of [() => worker?.stop(), () => publications?.stop()]) {
      try { await stop(); } catch (cleanupError) { console.error(startupDiagnostic('startup_cleanup', cleanupError)); }
    }
    throw error;
  }
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  previewServer.requestTimeout = 30000; previewServer.headersTimeout = 10000;
  if (publicServer) { publicServer.requestTimeout = 30000; publicServer.headersTimeout = 10000; }
  let stopping = false;
  const shutdown = () => {
    if (stopping) return; stopping = true; ready = false;
    const deadline = setTimeout(() => process.exit(1), 120000); deadline.unref();
    const closed = Promise.all([server, previewServer!].map(listener => new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))));
    void (async () => {
      // Keep delivery available until an in-flight publication has finished its HTTP checks.
      await Promise.all([closed, worker?.stop(), publications?.stop()]);
      await new Promise<void>((resolve, reject) => publicServer ? publicServer.close(error => error ? reject(error) : resolve()) : resolve());
      await journal.drain(); clearTimeout(deadline);
    })().catch(() => { process.exitCode = 1; });
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
main().catch(error => {
  console.error(startupDiagnostic(startupStage, error));
  console.error(error instanceof BuildFailure && error.code === 'checkpoint_not_prepared'
    ? 'Builder worker checkpoint is not prepared. Follow docs/local/picomart-storefront-builder/DEPLOYMENT.md or start with BUILDER_WORKER_ENABLED=false.'
    : 'Builder startup failed. Check configuration and private storage integrity.');
  process.exitCode = 1;
});
