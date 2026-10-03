import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AuthService} from '../auth/service.ts';
import type {ShopService} from '../domain/shops.ts';
import {ApiError} from '../domain/errors.ts';
import {Id, PublicationOperationSchema, type Publication, type Revision, type Session, type Shop} from '../domain/records.ts';
import {canonical, receipt} from '../storage/journal.ts';
import {jsonBytes, sha256, type ObjectStore} from '../storage/bunny.ts';
import {revisionPath} from '../storage/revisions.ts';
import {approvedManifest, assetPath, AssetReferenceSchema, isPublicAsset, PublicDelivery, publicRevisionPath, readHttp, selectionPath} from './delivery.ts';

export const PublishRequestSchema = z.object({revisionId: Id, expectedPublishedRevisionId: Id.nullable(), intent: z.enum(['publish', 'rollback'])}).strict();
export const PublicationStatusSchema = z.object({enabled: z.boolean(), liveUrl: z.string().url().nullable(), operations: z.array(PublicationOperationSchema)}).strict();
export const activePublication = (operation: Publication) => !['completed', 'failed'].includes(operation.state);

/** Durable single-coordinator publication worker. All external I/O is outside the
 * journal transaction; switching and compensation are recorded before side effects. */
export class PublicationService {
  readonly delivery: PublicDelivery;
  #auth: AuthService;
  #shops: ShopService;
  #publicStore: ObjectStore;
  #timer?: ReturnType<typeof setInterval>;
  #running: Promise<void> | null = null;
  constructor(auth: AuthService, shops: ShopService, publicStore: ObjectStore, delivery: PublicDelivery) {
    this.#auth = auth; this.#shops = shops; this.#publicStore = publicStore; this.delivery = delivery;
  }
  list(session: Session, shopId: string) {
    const shop = this.#shops.get(session, shopId);
    const operations = this.#auth.journal.list<Publication>('publication', item => item.network === shop.network && item.ownerAccountId === shop.ownerAccountId && item.shopId === shopId);
    return PublicationStatusSchema.parse({enabled: true, liveUrl: shop.publishedRevisionId ? this.delivery.url(shopId) : null, operations});
  }
  async submit(session: Session, shopId: string, requestId: string, input: z.infer<typeof PublishRequestSchema>) {
    return this.#auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, `publish/${shopId}`, input), async () => {
      const shop = this.#shops.get(session, shopId);
      await this.#auth.identity.assertCatalogOwner(shop.network, shop.catalogSeed, shop.ownerAccountId);
      if (shop.publishedRevisionId !== input.expectedPublishedRevisionId) throw new ApiError(409, 'published_revision_conflict');
      const revision = this.#shops.revisions(session, shopId).find(item => item.id === input.revisionId);
      if (!revision) throw new ApiError(404, 'revision_not_found');
      approvedManifest(revision);
      const {operations} = this.list(session, shopId);
      if (operations.some(activePublication)) throw new ApiError(409, 'publication_in_progress');
      if (input.revisionId === shop.publishedRevisionId) throw new ApiError(409, 'revision_already_published');
      if (input.intent === 'rollback' && !operations.some(item => item.state === 'completed' && item.requestedRevisionId === input.revisionId)) throw new ApiError(409, 'revision_not_previously_published');
      const now = new Date(this.#auth.now()).toISOString();
      const operation = PublicationOperationSchema.parse({schemaVersion: 2, kind: 'publication', id: randomUUID(), recordVersion: 1,
        network: shop.network, ownerAccountId: shop.ownerAccountId, shopId, createdAt: now, updatedAt: now,
        previousRevisionId: shop.publishedRevisionId, requestedRevisionId: revision.id, intent: input.intent, signerAddress: session.signerAddress,
        state: 'pending', verifiedAt: null, errorCode: null});
      return {changes: [operation], result: {status: 202, data: operation}};
    }, () => { this.#shops.get(session, shopId); });
  }
  async retry(session: Session, shopId: string, operationId: string, requestId: string) {
    return this.#auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, `retry-publication/${operationId}`, {shopId}), async () => {
      const shop = this.#shops.get(session, shopId), {operations} = this.list(session, shopId);
      const operation = operations.find(item => item.id === operationId);
      if (!operation) throw new ApiError(404, 'publication_not_found');
      if (operation.state !== 'failed' || operations.some(activePublication)) throw new ApiError(409, 'publication_in_progress');
      if (shop.publishedRevisionId !== operation.previousRevisionId) throw new ApiError(409, 'published_revision_conflict');
      await this.#auth.identity.assertCatalogOwner(shop.network, shop.catalogSeed, shop.ownerAccountId);
      const next = this.#next(operation, {state: 'pending', verifiedAt: null, errorCode: null, signerAddress: session.signerAddress});
      return {changes: [next], result: {status: 202, data: next}};
    }, () => { this.#shops.get(session, shopId); });
  }
  #current(operation: Publication) {
    return this.#auth.journal.get<Publication>('publication', operation.network, operation.ownerAccountId, operation.id)!;
  }
  #next(operation: Publication, changes: Partial<Publication>) {
    return PublicationOperationSchema.parse({...operation, ...changes, recordVersion: operation.recordVersion + 1,
      updatedAt: new Date(Math.max(this.#auth.now(), Date.parse(operation.updatedAt))).toISOString()});
  }
  async #update(operation: Publication, changes: Partial<Publication>) {
    await this.#auth.journal.transact(null, async () => {
      const next = this.#next(this.#current(operation), changes);
      return {changes: [next], result: {status: 200, data: {}}};
    });
  }
  #revision(operation: Publication): Revision {
    const revision = this.#auth.journal.get<Revision>('revision', operation.network, operation.ownerAccountId, operation.requestedRevisionId);
    if (!revision || revision.shopId !== operation.shopId) throw new ApiError(404, 'revision_not_found');
    return revision;
  }
  async #authorize(operation: Publication) {
    const shop = this.#auth.journal.get<Shop>('shop', operation.network, operation.ownerAccountId, operation.shopId);
    if (!shop || shop.publishedRevisionId !== operation.previousRevisionId) throw new ApiError(409, 'published_revision_conflict');
    const identity = await this.#auth.identity.account(shop.network, shop.ownerAccountId);
    if (operation.signerAddress && identity.signerAddress !== operation.signerAddress) throw new ApiError(403, 'account_key_changed');
    await this.#auth.identity.assertCatalogOwner(shop.network, shop.catalogSeed, shop.ownerAccountId);
  }
  async #prepare(revision: Revision) {
    const {journal} = this.#auth, manifest = approvedManifest(revision), files = new Map<string, Buffer>();
    for (const entry of manifest.files) {
      const bytes = await journal.store.get(`${revisionPath(journal, revision)}/dist/${entry.path}`, entry.size + 1);
      if (!bytes || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new ApiError(409, 'revision_incomplete');
      files.set(entry.path, bytes);
    }
    if (canonical(JSON.parse(files.get('storefront.json')!.toString())) !== canonical(revision.config)) throw new ApiError(409, 'revision_config_mismatch');
    const embedded = /<script\b[^>]*\bid="picomart-storefront-config"[^>]*>([\s\S]*?)<\/script>/.exec(files.get('index.html')!.toString());
    if (!embedded || canonical(JSON.parse(embedded[1])) !== canonical(revision.config)) throw new ApiError(409, 'revision_config_mismatch');
    // Preserve the prototype's immutable asset names. Reject a changed asset under
    // an old name before making any publication change; old tabs must keep working.
    for (const entry of manifest.files.filter(file => isPublicAsset(file.path))) {
      const bytes = await journal.store.get(assetPath(journal.prefix, revision.shopId, entry.path), 4096);
      if (bytes) {
        const previous = AssetReferenceSchema.parse(JSON.parse(bytes.toString()));
        if (previous.shopId !== revision.shopId || previous.path !== entry.path || previous.sha256 !== entry.sha256 || previous.size !== entry.size) throw new ApiError(409, 'immutable_asset_conflict');
      }
    }
    const prefix = publicRevisionPath(journal.prefix, revision.shopId, revision.id);
    for (const entry of manifest.files) {
      const existing = await this.#publicStore.get(`${prefix}/${entry.path}`, entry.size + 1);
      if (!existing || existing.length !== entry.size || sha256(existing) !== entry.sha256) await this.#publicStore.putVerified(`${prefix}/${entry.path}`, files.get(entry.path)!);
    }
    // Validate what the CDN actually returns before changing any routing selection.
    for (const entry of manifest.files) {
      const bytes = await this.delivery.readArtifact(`${prefix}/${entry.path}`, entry.size + 1);
      if (!bytes || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new ApiError(503, 'public_artifact_mismatch');
    }
    await journal.store.putVerified(`${prefix}/ready.json`, jsonBytes(manifest));
    for (const entry of manifest.files.filter(file => isPublicAsset(file.path))) {
      const key = assetPath(journal.prefix, revision.shopId, entry.path);
      if (!await journal.store.get(key, 4096)) await journal.store.putVerified(key, jsonBytes({schemaVersion: 2, shopId: revision.shopId, revisionId: revision.id, ...entry}));
    }
  }
  async #select(operation: Publication, revisionId: string | null) {
    const selected = await this.delivery.selection(operation.shopId);
    if (selected !== operation.previousRevisionId && selected !== operation.requestedRevisionId) throw new ApiError(409, 'public_selection_conflict');
    await this.#auth.journal.store.putVerified(selectionPath(this.#auth.journal.prefix, operation.shopId), jsonBytes({schemaVersion: 2, shopId: operation.shopId, revisionId}));
  }
  async #verifyRoutes(operation: Publication) {
    const revision = this.#revision(operation), manifest = await this.delivery.manifest(operation.shopId, revision.id);
    for (const file of ['', 'products/AQEBAQEBAQEBAQEBAQEBAQ', 'storefront.json', ...manifest.files.filter(file => isPublicAsset(file.path)).map(file => file.path)]) {
      const expected = await this.delivery.resolve(operation.shopId, file);
      if (!expected || ((!file || file.startsWith('products/') || file === 'storefront.json') && expected.revisionId !== revision.id)) throw new ApiError(503, 'public_route_mismatch');
      const actual = await readHttp(this.delivery.url(operation.shopId) + file, expected.bytes.length + 1);
      if (sha256(actual) !== sha256(expected.bytes)) throw new ApiError(503, 'public_route_mismatch');
    }
  }
  async #restore(operation: Publication) {
    await this.#select(operation, operation.previousRevisionId);
    if (await this.delivery.selection(operation.shopId) !== operation.previousRevisionId) throw new ApiError(503, 'public_restore_failed');
    await this.#update(operation, {state: 'failed'});
  }
  async #process(original: Publication) {
    let operation = this.#current(original);
    if (operation.state === 'restoring') { await this.#restore(operation); return; }
    try {
      await this.#authorize(operation);
      if (operation.state !== 'switching') {
        await this.#update(operation, {state: 'uploading'});
        await this.#prepare(this.#revision(operation));
        await this.#authorize(operation);
        await this.#update(operation, {state: 'switching'});
      }
      operation = this.#current(operation);
      await this.#select(operation, operation.requestedRevisionId);
      await this.#verifyRoutes(operation);
      await this.#authorize(operation);
      await this.#auth.journal.transact(null, async () => {
        const current = this.#current(operation), shop = this.#auth.journal.get<Shop>('shop', operation.network, operation.ownerAccountId, operation.shopId)!;
        if (shop.publishedRevisionId !== operation.previousRevisionId || current.state !== 'switching') throw new ApiError(409, 'published_revision_conflict');
        const completed = this.#next(current, {state: 'completed', verifiedAt: new Date(this.#auth.now()).toISOString(), errorCode: null});
        return {changes: [completed, {...shop, recordVersion: shop.recordVersion + 1, updatedAt: new Date(Math.max(this.#auth.now(), Date.parse(shop.updatedAt))).toISOString(), publishedRevisionId: operation.requestedRevisionId}], result: {status: 200, data: {}}};
      });
    } catch (error) {
      // An uncertain journal commit must be reconciled from primary storage on
      // restart, never compensated from an obsolete in-memory snapshot.
      if (!this.#auth.journal.healthy) throw error;
      operation = this.#current(operation);
      const errorCode = error instanceof ApiError ? error.code : 'publication_failed';
      if (operation.state === 'switching') {
        await this.#update(operation, {state: 'restoring', errorCode});
        await this.#restore(this.#current(operation));
      } else await this.#update(operation, {state: 'failed', errorCode});
    }
  }
  tick(): Promise<void> {
    if (this.#running) return this.#running;
    this.#running = (async () => {
      const operations = this.#auth.journal.list<Publication>('publication', activePublication).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      // One publication at a time bounds transfer load; builds retain their own limits.
      if (operations[0]) await this.#process(operations[0]);
    })().finally(() => { this.#running = null; });
    return this.#running;
  }
  start() { if (!this.#timer) this.#timer = setInterval(() => { void this.tick().catch(() => {}); }, 5000); }
  async stop() { clearInterval(this.#timer); this.#timer = undefined; await this.#running; }
}
