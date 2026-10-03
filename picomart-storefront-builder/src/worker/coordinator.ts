import {randomUUID} from 'node:crypto';
import type {Config} from '../config.ts';
import {activeJob, BuildAttemptSchema, RevisionManifestSchema, type BuildAttempt, type GenerationJob, type RecordValue, type Revision, type Shop} from '../domain/records.ts';
import {Journal} from '../storage/journal.ts';
import {jsonBytes, sha256} from '../storage/bunny.ts';
import {commitRevision, stageRevision, verifyStagedRevision} from '../storage/revisions.ts';
import {PinnedSchema, type Engine, type Pinned} from './engine.ts';
import {BuildFailure, type Machine, type Provider, type VirtualMachine} from './provider.ts';
import {privateError} from './errors.ts';

type Scope = Pick<BuildAttempt, 'network' | 'ownerAccountId' | 'id'>;
export class Coordinator {
  #journal: Journal; #config: Config; #provider: Provider; #engine: Engine; #now: () => number;
  #tasks = new Map<string, {controller: AbortController; done: Promise<void>}>();
  #timer?: ReturnType<typeof setInterval>; #tick?: Promise<void>;
  #started = false; #stopping = false; #inventory: VirtualMachine[] = []; #unresolved = 0;
  #log: (event: object) => void;
  #lastMetrics = '';
  constructor(journal: Journal, config: Config, provider: Provider, engine: Engine, now = Date.now, log = (event: object) => console.log(JSON.stringify(event))) {
    this.#journal = journal; this.#config = config; this.#provider = provider; this.#engine = engine; this.#now = now; this.#log = log;
  }
  #at() { return new Date(this.#now()).toISOString(); }
  #attempt(scope: Scope) { const value = this.#journal.get<BuildAttempt>('attempt', scope.network, scope.ownerAccountId, scope.id); if (!value) throw new Error('Attempt not found'); return value; }
  #job(attempt: BuildAttempt) { const job = this.#journal.get<GenerationJob>('job', attempt.network, attempt.ownerAccountId, attempt.jobId); if (!job) throw new Error('Job not found'); return job; }
  #attempts() { return this.#journal.list<BuildAttempt>('attempt', () => true); }
  #path(attempt: BuildAttempt) { return `${this.#journal.prefix}/${attempt.network}/${attempt.ownerAccountId}/shops/${attempt.shopId}/attempts/${attempt.id}`; }
  #event(attempt: BuildAttempt, event: string) { this.#log({event, shopId: attempt.shopId, jobId: attempt.jobId, attemptId: attempt.id, stage: attempt.stage, cleanup: attempt.cleanup, errorCode: attempt.errorCode, timings: attempt.timings, artifactBytes: attempt.artifactBytes, retry: attempt.attemptNumber - 1}); }
  async #change(scope: Scope, patch: Partial<BuildAttempt>, jobPatch?: Partial<GenerationJob>) {
    await this.#journal.transact(null, async () => {
      const previous = this.#attempt(scope), updatedAt = this.#at();
      const next = {...previous, ...patch, recordVersion: previous.recordVersion + 1, updatedAt};
      const changes: RecordValue[] = [next];
      if (jobPatch) {
        const job = this.#job(previous);
        if (job.currentAttemptId !== previous.id || !activeJob(job) || job.cancelRequested) throw new BuildFailure('attempt_superseded');
        changes.push({...job, ...jobPatch, recordVersion: job.recordVersion + 1, updatedAt});
      }
      return {changes, result: {status: 200, data: {}}};
    });
  }
  #check(scope: Scope, signal: AbortSignal) {
    signal.throwIfAborted(); const attempt = this.#attempt(scope), job = this.#job(attempt);
    if (this.#stopping) throw new BuildFailure('coordinator_stopping', true);
    if (job.currentAttemptId !== attempt.id || !activeJob(job) || job.cancelRequested || attempt.cancelRequested) throw new BuildFailure('canceled');
    if (this.#now() >= Date.parse(attempt.deadline)) throw new BuildFailure('attempt_timeout');
  }
  async start(poll = true) {
    if (this.#started) throw new Error('Coordinator already started');
    this.#started = true;
    // Recovery is conservative: validated, fully staged results can finish; other
    // interrupted attempts are destroyed before a bounded retry in a fresh VM.
    await this.#reconcile();
    for (const attempt of this.#attempts().filter(value => !value.finalized)) {
      const job = this.#job(attempt);
      if (attempt.preparedRevisionHash && !attempt.cancelRequested && activeJob(job)) continue;
      if (!['failed', 'canceled'].includes(attempt.state)) await this.#change(attempt, {state: job.cancelRequested ? 'canceled' : 'failed', errorCode: 'coordinator_restart', retryable: true});
    }
    // Compatibility for Phase 3 jobs that used the coarse running state.
    for (const job of this.#journal.list<GenerationJob>('job', value => value.state === 'running' && !value.currentAttemptId)) {
      await this.#journal.transact(null, async () => ({changes: [{...job, recordVersion: job.recordVersion + 1, updatedAt: this.#at(),
        state: job.attemptIds.length ? 'running' : 'queued', currentAttemptId: job.attemptIds.at(-1) ?? null}], result: {status: 200, data: {}}}));
    }
    await this.tick();
    if (poll) this.#timer = setInterval(() => { void this.tick().catch(() => this.#log({event: 'worker_tick_failed', storageHealthy: this.#journal.healthy})); }, this.#config.workerPollMs);
  }
  tick(): Promise<void> {
    if (this.#tick) return this.#tick;
    this.#tick = this.#runTick().finally(() => {
      this.#tick = undefined;
      if (this.#journal.healthy) { const metrics = this.metrics(), encoded = JSON.stringify(metrics); if (encoded !== this.#lastMetrics) { this.#lastMetrics = encoded; this.#log({event: 'worker_capacity', ...metrics}); } }
      else for (const task of this.#tasks.values()) task.controller.abort(new BuildFailure('storage_recovery_required'));
    }); return this.#tick;
  }
  async #runTick() {
    if (this.#stopping) return;
    this.#journal.assertHealthy();
    for (const [id, task] of this.#tasks) {
      const attempt = this.#attempts().find(value => value.id === id)!;
      try { this.#check(attempt, task.controller.signal); } catch (error) { task.controller.abort(error); }
    }
    await this.#reconcile();
    for (const attempt of this.#attempts().filter(value => !value.finalized && !this.#tasks.has(value.id))) {
      if (attempt.cleanup !== 'destroyed') await this.#cleanup(attempt);
      if (this.#attempt(attempt).cleanup === 'destroyed') await this.#finish(attempt);
    }
    if (this.#unresolved || this.#stopping) return;
    while (true) {
      if (this.#stopping) return;
      const reserved = this.#attempts().filter(value => value.cleanup !== 'destroyed' || this.#tasks.has(value.id));
      if (reserved.length >= this.#config.maxConcurrentBuilds) return;
      const jobs = this.#journal.list<GenerationJob>('job', job => job.state === 'queued' && !job.cancelRequested && this.#config.networks.has(job.network))
        // Stable sort preserves the journal's insertion order for equal timestamps.
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const job = jobs.find(job => reserved.filter(attempt => attempt.shopId === job.shopId && attempt.network === job.network && attempt.ownerAccountId === job.ownerAccountId).length < this.#config.maxConcurrentBuildsPerShop);
      if (!job) return;
      const attempt = await this.#reserve(job);
      const controller = new AbortController();
      const done = Promise.resolve().then(() => this.#execute(attempt, controller)).catch(() => {
        this.#log({event: 'worker_attempt_interrupted', attemptId: attempt.id, storageHealthy: this.#journal.healthy});
      }).finally(() => { this.#tasks.delete(attempt.id); });
      this.#tasks.set(attempt.id, {controller, done});
    }
  }
  async #reserve(candidate: GenerationJob): Promise<BuildAttempt> {
    let reserved!: BuildAttempt;
    await this.#journal.transact(null, async () => {
      const job = this.#journal.get<GenerationJob>('job', candidate.network, candidate.ownerAccountId, candidate.id)!;
      if (job.state !== 'queued' || job.cancelRequested) throw new BuildFailure('job_no_longer_queued');
      const now = this.#at(), id = randomUUID();
      reserved = BuildAttemptSchema.parse({schemaVersion: 2, kind: 'attempt', id, recordVersion: 1, createdAt: now, updatedAt: now,
        network: job.network, ownerAccountId: job.ownerAccountId, shopId: job.shopId, jobId: job.id, attemptNumber: job.attemptIds.length + 1,
        baseRevisionId: job.baseRevisionId, sandboxId: null, state: 'created', cleanup: 'pending', cancelRequested: false,
        deadline: new Date(this.#now() + this.#config.attemptMs).toISOString(), commandRefs: [], stage: 'provisioning', stageStartedAt: now,
        timings: {queueMs: Math.max(0, this.#now() - Date.parse(job.createdAt))}, cleanupAttempts: 0});
      const shop = this.#journal.get<Shop>('shop', job.network, job.ownerAccountId, job.shopId)!;
      return {changes: [reserved, {...job, recordVersion: job.recordVersion + 1, updatedAt: now, state: 'provisioning', currentAttemptId: id,
        attemptIds: [...job.attemptIds, id], selectionVersion: job.selectionVersion ?? shop.recordVersion, errorCode: null}], result: {status: 200, data: {}}};
    });
    this.#event(reserved, 'attempt_reserved'); return reserved;
  }
  async #execute(initial: BuildAttempt, controller: AbortController) {
    const signal = controller.signal, deadline = setTimeout(() => controller.abort(new BuildFailure('attempt_timeout')), Math.max(1, Date.parse(initial.deadline) - this.#now()));
    let vm: Machine | undefined;
    try {
      this.#check(initial, signal);
      let job = this.#job(initial), pin: Pinned;
      if (job.inputHash) {
        const bytes = await this.#journal.store.get(`${this.#journal.prefix}/inputs/${job.inputHash}.json`, 20 * 1024 * 1024);
        if (!bytes || sha256(bytes) !== job.inputHash) throw new BuildFailure('pinned_input_integrity'); pin = PinnedSchema.parse(JSON.parse(bytes.toString()));
      } else {
        pin = await this.#engine.pin(job, signal); this.#check(initial, signal);
        const bytes = jsonBytes(PinnedSchema.parse(pin)), hash = sha256(bytes);
        if (bytes.length > 20 * 1024 * 1024) throw new BuildFailure('pinned_input_limit');
        await this.#journal.store.putVerified(`${this.#journal.prefix}/inputs/${hash}.json`, bytes); this.#check(initial, signal);
        await this.#change(initial, {}, {inputHash: hash});
      }
      this.#check(initial, signal);
      await this.#change(initial, {creationRequestedAt: this.#at()});
      vm = await this.#provider.create(initial, pin.environment.checkpointName, signal, async id => {
        const attempt = this.#attempt(initial);
        if (attempt.sandboxId && attempt.sandboxId !== id) throw new BuildFailure('duplicate_sandbox_allocation');
        if (!attempt.sandboxId) await this.#change(initial, {sandboxId: id});
      }, async ref => { const attempt = this.#attempt(initial); await this.#change(initial, {commandRefs: [...attempt.commandRefs, ref]}); });
      this.#check(initial, signal); job = this.#job(initial);
      const previous = this.#attempts().find(value => value.jobId === job.id && value.attemptNumber === initial.attemptNumber - 1);
      const result = await this.#engine.run(job, pin, vm, signal, value => this.#stage(initial, value, signal), previous?.feedback ?? '');
      this.#check(initial, signal); await this.#stage(initial, 'uploading', signal);
      const now = this.#at();
      const revision = RevisionManifestSchema.parse({schemaVersion: 2, kind: 'revision', id: randomUUID(), recordVersion: 1, createdAt: now, updatedAt: now,
        network: job.network, ownerAccountId: job.ownerAccountId, shopId: job.shopId, jobId: job.id, attemptId: initial.id, parentRevisionId: job.baseRevisionId,
        state: 'ready', templateVersion: result.templateVersion, environmentVersion: result.environmentVersion, model: result.model, config: job.config,
        files: [...result.files].map(([path, bytes]) => ({path, size: bytes.length, sha256: sha256(bytes)})), validation: {typecheck: true, lint: true, build: true, browser: true, cleanup: 'destroyed'}});
      await stageRevision(this.#journal, revision, result.files, () => this.#check(initial, signal));
      const bytes = jsonBytes(revision);
      await this.#journal.store.putVerified(`${this.#path(initial)}/candidate.json`, bytes); this.#check(initial, signal);
      const attempt = this.#attempt(initial);
      await this.#change(initial, {state: 'ready', preparedRevisionHash: sha256(bytes), artifactBytes: revision.files.reduce((sum, file) => sum + file.size, 0),
        timings: {...attempt.timings, uploading: Math.max(0, this.#now() - Date.parse(attempt.stageStartedAt!))}});
    } catch (error) {
      const failure = signal.aborted ? signal.reason : error;
      if (this.#journal.healthy) {
        const canceled = this.#job(initial).cancelRequested;
        const code = canceled ? 'canceled' : failure instanceof BuildFailure ? failure.code : 'build_failed';
        try { await this.#journal.store.putVerified(`${this.#path(initial)}/error.json`, jsonBytes({code, detail: privateError(failure)})); } catch { /* Metadata and VM cleanup take priority over diagnostics. */ }
        await this.#change(initial, {state: canceled ? 'canceled' : 'failed', errorCode: code,
          retryable: !canceled && (this.#stopping || failure instanceof BuildFailure && failure.repairable), feedback: failure instanceof BuildFailure ? failure.feedback : ''},
          activeJob(this.#job(initial)) ? {state: 'failed', errorCode: code} : undefined);
        // Logs stay in private storage and never enter public HTTP error bodies.
        if (vm) try { await this.#journal.store.putVerified(`${this.#path(initial)}/build.log`, vm.logs()); } catch { this.#log({event: 'private_log_upload_failed', attemptId: initial.id}); }
      }
    } finally {
      clearTimeout(deadline);
      if (this.#journal.healthy) { await this.#cleanup(initial, true); if (this.#attempt(initial).cleanup === 'destroyed') await this.#finish(initial); }
      else if (vm) { try { await this.#provider.destroy(vm.id); } catch { /* Startup reconciles the durably reserved attempt. */ } }
    }
  }
  async #stage(scope: Scope, stage: GenerationJob['state'], signal: AbortSignal) {
    this.#check(scope, signal); const attempt = this.#attempt(scope);
    const timings = {...attempt.timings, [attempt.stage ?? 'provisioning']: Math.max(0, this.#now() - Date.parse(attempt.stageStartedAt ?? attempt.createdAt))};
    await this.#change(scope, {stage, stageStartedAt: this.#at(), timings, state: stage === 'validating' ? 'collecting' : 'running'}, {state: stage});
    this.#event(this.#attempt(scope), 'attempt_stage');
  }
  async #reconcile() {
    this.#inventory = await this.#provider.inventory(); this.#unresolved = 0;
    const attempts = this.#attempts();
    for (const vm of this.#inventory.filter(value => value.status !== 'DESTROYED')) {
      const known = attempts.find(attempt => attempt.sandboxId === vm.id);
      if (known) {
        if (known.cleanup === 'destroyed' && !await this.#provider.destroy(vm.id)) this.#unresolved++;
        continue;
      }
      if (vm.status !== 'RUNNING') { this.#unresolved++; continue; }
      const marker = await this.#provider.identify(vm);
      if (!marker || marker.owner !== this.#provider.owner) continue;
      const reference = attempts.find(value => value.id === marker.attemptId), attempt = reference ? this.#attempt(reference) : undefined;
      if (attempt && !attempt.sandboxId && !attempt.finalized) await this.#change(attempt, {sandboxId: vm.id});
      else if (!await this.#provider.destroy(vm.id)) this.#unresolved++;
    }
  }
  async #cleanup(scope: Scope, force = false) {
    let attempt = this.#attempt(scope);
    if (attempt.cleanup === 'destroyed' || !force && attempt.nextCleanupAt && Date.parse(attempt.nextCleanupAt) > this.#now()) return;
    const started = this.#now(), count = (attempt.cleanupAttempts ?? 0) + 1;
    await this.#change(scope, {cleanup: 'destroying', cleanupAttempts: count,
      timings: {...attempt.timings, ...(!(attempt.stage! in (attempt.timings ?? {})) ? {[attempt.stage ?? 'provisioning']: Math.max(0, this.#now() - Date.parse(attempt.stageStartedAt ?? attempt.createdAt))} : {})}});
    let destroyed = false;
    try {
      if (attempt.sandboxId) destroyed = await this.#provider.destroy(attempt.sandboxId);
      else if (!attempt.creationRequestedAt) destroyed = true;
      else {
        // Fresh complete inventory + atomic ownership markers close the lost-ID window.
        // Allow an in-flight create request to settle before confirming absence.
        await this.#reconcile(); attempt = this.#attempt(scope);
        if (attempt.sandboxId) destroyed = await this.#provider.destroy(attempt.sandboxId);
        else destroyed = this.#unresolved === 0 && this.#now() - Date.parse(attempt.creationRequestedAt!) >= 120000;
      }
    } catch { /* Keep the reservation; a later tick retries cleanup independently. */ }
    attempt = this.#attempt(scope);
    await this.#change(scope, {cleanup: destroyed ? 'destroyed' : 'failed', nextCleanupAt: new Date(this.#now() + Math.min(60000, 2000 * 2 ** Math.min(count, 5))).toISOString(),
      timings: {...attempt.timings, cleanupMs: (attempt.timings?.cleanupMs ?? 0) + Math.max(0, this.#now() - started)}});
    this.#event(this.#attempt(scope), 'attempt_cleanup');
  }
  async #finish(scope: Scope) {
    let attempt = this.#attempt(scope); const job = this.#job(attempt);
    if (attempt.finalized || attempt.cleanup !== 'destroyed') return;
    if (attempt.preparedRevisionHash && attempt.state === 'ready' && activeJob(job) && !job.cancelRequested && job.currentAttemptId === attempt.id) {
      try {
        const bytes = await this.#journal.store.get(`${this.#path(attempt)}/candidate.json`);
        if (!bytes || sha256(bytes) !== attempt.preparedRevisionHash) throw new Error('Candidate integrity');
        const revision: Revision = RevisionManifestSchema.parse(JSON.parse(bytes.toString()));
        if (revision.attemptId !== attempt.id || revision.jobId !== job.id || revision.network !== job.network || revision.ownerAccountId !== job.ownerAccountId || revision.shopId !== job.shopId) throw new Error('Candidate scope');
        await verifyStagedRevision(this.#journal, revision); await commitRevision(this.#journal, revision, this.#now);
        this.#event(this.#attempt(scope), 'revision_ready'); return;
      } catch {
        if (!this.#journal.healthy) throw new Error('Storage recovery required');
        await this.#change(scope, {state: 'failed', errorCode: 'revision_completion_failed', retryable: false});
      }
    }
    attempt = this.#attempt(scope);
    await this.#journal.transact(null, async () => {
      const latest = this.#attempt(scope), current = this.#job(latest), updatedAt = this.#at();
      const canceled = current.cancelRequested || latest.cancelRequested;
      const retry = !canceled && latest.retryable && current.attemptIds.length < this.#config.maxAttempts;
      const changes: RecordValue[] = [{...latest, recordVersion: latest.recordVersion + 1, updatedAt, finalized: true,
        timings: {...latest.timings, totalMs: Math.max(0, this.#now() - Date.parse(latest.createdAt))}}];
      if (current.currentAttemptId === latest.id && current.state !== 'ready') changes.push({...current, recordVersion: current.recordVersion + 1, updatedAt,
        state: canceled ? 'canceled' : retry ? 'queued' : 'failed', currentAttemptId: retry ? null : current.currentAttemptId, errorCode: latest.errorCode ?? 'build_failed'});
      return {changes, result: {status: 200, data: {}}};
    });
    this.#event(this.#attempt(scope), 'attempt_finished');
  }
  metrics() {
    const attempts = this.#attempts();
    return {activeAttempts: attempts.filter(attempt => attempt.cleanup !== 'destroyed').length,
      activeVms: this.#inventory.filter(vm => vm.status !== 'DESTROYED' && attempts.some(attempt => attempt.sandboxId === vm.id)).length,
      queuedJobs: this.#journal.list<GenerationJob>('job', job => job.state === 'queued').length,
      pendingCleanup: attempts.filter(attempt => ['destroying', 'failed'].includes(attempt.cleanup)).length,
      unresolvedVms: this.#unresolved, maxConcurrentBuilds: this.#config.maxConcurrentBuilds, maxConcurrentBuildsPerShop: this.#config.maxConcurrentBuildsPerShop};
  }
  async stop() {
    this.#stopping = true; if (this.#timer) clearInterval(this.#timer);
    for (const task of this.#tasks.values()) task.controller.abort(new BuildFailure('coordinator_stopping', true));
    await this.#tick; await Promise.allSettled([...this.#tasks.values()].map(task => task.done)); await this.#journal.drain();
  }
}
