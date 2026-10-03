import {RevisionManifestSchema, type BuildAttempt, type GenerationJob, type Revision, type Shop} from '../domain/records.ts';
import {ApiError} from '../domain/errors.ts';
import {Journal, canonical} from './journal.ts';
import {sha256} from './bunny.ts';

// Trusted worker boundary, deliberately not an HTTP upload endpoint. The Phase 4 worker
// supplies validated source/dist/log files after its own sandbox and cleanup checks.
function validate(candidate: Revision, files: Map<string, Uint8Array>) {
  const revision = RevisionManifestSchema.parse(candidate);
  if (revision.recordVersion !== 1 || new Set(revision.files.map(file => file.path)).size !== revision.files.length || files.size !== revision.files.length) throw new Error('Invalid revision file set');
  if (revision.files.reduce((size, file) => size + file.size, 0) > 50 * 1024 * 1024) throw new Error('Revision exceeds artifact budget');
  // A source archive, catalog snapshot and compiled entry/config are required.
  for (const name of ['source.tar.gz', 'catalog-snapshot.json', 'dist/index.html', 'dist/storefront.json']) if (!files.has(name)) throw new Error('Incomplete revision artifacts');
  for (const entry of revision.files) {
    const bytes = files.get(entry.path);
    if (!bytes || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('Revision artifact mismatch');
  }
  if (canonical(JSON.parse(Buffer.from(files.get('dist/storefront.json')!).toString())) !== canonical(revision.config)) throw new Error('Revision public configuration mismatch');
  return revision;
}
export const revisionPath = (journal: Journal, revision: Revision) => `${journal.prefix}/${revision.network}/${revision.ownerAccountId}/shops/${revision.shopId}/revisions/${revision.id}`;
function approved(journal: Journal, revision: Revision, cleaned: boolean) {
    if (journal.get('revision', revision.network, revision.ownerAccountId, revision.id)) throw new ApiError(409, 'revision_already_complete');
    const job = journal.get<GenerationJob>('job', revision.network, revision.ownerAccountId, revision.jobId);
    const shop = journal.get<Shop>('shop', revision.network, revision.ownerAccountId, revision.shopId);
    const attempt = journal.get<BuildAttempt>('attempt', revision.network, revision.ownerAccountId, revision.attemptId);
    if (!shop || !job || job.shopId !== shop.id || !['running', 'uploading'].includes(job.state) || job.cancelRequested || !attempt || attempt.cancelRequested || attempt.jobId !== job.id || attempt.shopId !== shop.id ||
      (cleaned && (attempt.cleanup !== 'destroyed' || attempt.state !== 'ready')) || (job.currentAttemptId ?? job.attemptIds.at(-1)) !== attempt.id || job.baseRevisionId !== revision.parentRevisionId) throw new Error('Revision does not match an approved build attempt');
    if (canonical(job.config) !== canonical(revision.config)) throw new Error('Revision changed the job configuration');
    return {job, shop, attempt};
}
// Upload outside the journal lock so cancellation and other shops remain responsive.
export async function stageRevision(journal: Journal, candidate: Revision, files: Map<string, Uint8Array>, check = () => {}) {
  const revision = validate(candidate, files); approved(journal, revision, false);
  for (const entry of revision.files) { check(); approved(journal, revision, false); await journal.store.putVerified(`${revisionPath(journal, revision)}/${entry.path}`, files.get(entry.path)!); }
  check(); approved(journal, revision, false);
}
export async function commitRevision(journal: Journal, candidate: Revision, now = Date.now) {
  const revision = RevisionManifestSchema.parse(candidate);
  return journal.transact(null, async () => {
    const {job, shop, attempt} = approved(journal, revision, true);
    const updatedAt = new Date(Math.max(now(), Date.parse(shop.updatedAt), Date.parse(job.updatedAt), Date.parse(attempt.updatedAt))).toISOString();
    // Only the latest submitted job may select a draft, and only while its shop version
    // is still current. Other completions remain independently selectable revisions.
    const select = job.selectionVersion === undefined || shop.recordVersion === job.selectionVersion;
    return {changes: [revision, {...job, recordVersion: job.recordVersion + 1, updatedAt, state: 'ready', revisionId: revision.id},
      {...attempt, recordVersion: attempt.recordVersion + 1, updatedAt, finalized: true, timings: {...attempt.timings, totalMs: Math.max(0, now() - Date.parse(attempt.createdAt))}},
      ...(select ? [{...shop, recordVersion: shop.recordVersion + 1, updatedAt, selectedDraftId: revision.id}] : [])], result: {status: 201, data: revision}};
  });
}
export async function verifyStagedRevision(journal: Journal, revision: Revision) {
  const files = new Map<string, Uint8Array>();
  if (revision.files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) throw new Error('Revision exceeds artifact budget');
  for (const entry of revision.files) {
    const bytes = await journal.store.get(`${revisionPath(journal, revision)}/${entry.path}`, entry.size + 1);
    if (!bytes) throw new Error('Missing staged artifact'); files.set(entry.path, bytes);
  }
  validate(revision, files);
}
export async function saveRevision(journal: Journal, candidate: Revision, files: Map<string, Uint8Array>) {
  await stageRevision(journal, candidate, files); return commitRevision(journal, candidate);
}
