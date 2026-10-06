import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from './errors.ts';
import {activeJob, GenerationJobSchema, Id, ShopSchema, type BuildAttempt, type GenerationJob, type Revision, type Session, type Shop} from './records.ts';
import {CatalogIdSchema, StorefrontConfigSchema} from './public-storefront.ts';
import {receipt} from '../storage/journal.ts';
import type {AuthService} from '../auth/service.ts';

export const DesignSchema = StorefrontConfigSchema.omit({schemaVersion: true, shopId: true, network: true, chainId: true, contractAddress: true, catalogSeed: true}).strict();
export const CreateShopSchema = z.object({catalogSeed: CatalogIdSchema, design: DesignSchema}).strict();
export const UpdateShopSchema = z.object({expectedVersion: z.number().int().positive(), design: DesignSchema}).strict();
export const SubmitJobSchema = z.object({expectedShopVersion: z.number().int().positive(), brief: z.string().trim().min(1).max(12000), baseRevisionId: Id.nullable().default(null)}).strict();

export class ShopService {
  #auth: AuthService;
  constructor(auth: AuthService) { this.#auth = auth; }
  list(session: Session) {
    this.#auth.current(session);
    return this.#auth.journal.list<Shop>('shop', shop => shop.ownerAccountId === session.ownerAccountId && shop.network === session.network);
  }
  get(session: Session, shopId: string) {
    this.#auth.current(session);
    const shop = this.#auth.journal.get<Shop>('shop', session.network, session.ownerAccountId, shopId);
    if (!shop) throw new ApiError(404, 'shop_not_found');
    return shop;
  }
  async create(session: Session, requestId: string, input: z.infer<typeof CreateShopSchema>) {
    return this.#auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, 'create-shop', input), async () => {
      await this.#auth.identity.assertCatalogOwner(session.network, input.catalogSeed, session.ownerAccountId);
      const id = randomUUID(), now = new Date(this.#auth.now()).toISOString();
      const shop = ShopSchema.parse({schemaVersion: 2, kind: 'shop', id, recordVersion: 1, network: session.network, ownerAccountId: session.ownerAccountId,
        createdAt: now, updatedAt: now, catalogSeed: input.catalogSeed, selectedDraftId: null, publishedRevisionId: null,
        config: {...input.design, schemaVersion: 2, shopId: id, network: session.network, chainId: PICOMART_TEMPO_CONFIG.chainId, contractAddress: PICOMART_TEMPO_CONFIG.deployment.address, catalogSeed: input.catalogSeed}});
      return {changes: [shop], result: {status: 201, data: shop}};
    }, () => { this.#auth.current(session); });
  }
  async update(session: Session, shopId: string, requestId: string, input: z.infer<typeof UpdateShopSchema>) {
    return this.#auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, `update-shop/${shopId}`, input), async () => {
      const shop = this.get(session, shopId);
      await this.#auth.identity.assertCatalogOwner(session.network, shop.catalogSeed, session.ownerAccountId);
      if (shop.recordVersion !== input.expectedVersion) throw new ApiError(409, 'record_version_conflict');
      const next = ShopSchema.parse({...shop, recordVersion: shop.recordVersion + 1, updatedAt: new Date(this.#auth.now()).toISOString(),
        config: {...input.design, schemaVersion: 2, shopId, network: shop.network, chainId: PICOMART_TEMPO_CONFIG.chainId, contractAddress: PICOMART_TEMPO_CONFIG.deployment.address, catalogSeed: shop.catalogSeed}});
      return {changes: [next], result: {status: 200, data: next}};
    }, () => { this.get(session, shopId); });
  }
  revisions(session: Session, shopId: string) {
    this.get(session, shopId);
    return this.#auth.journal.list<Revision>('revision', value => value.network === session.network && value.ownerAccountId === session.ownerAccountId && value.shopId === shopId);
  }
  jobs(session: Session, shopId: string) {
    this.get(session, shopId);
    return this.#auth.journal.list<GenerationJob>('job', value => value.network === session.network && value.ownerAccountId === session.ownerAccountId && value.shopId === shopId);
  }
  job(session: Session, shopId: string, jobId: string) {
    const job = this.jobs(session, shopId).find(value => value.id === jobId);
    if (!job) throw new ApiError(404, 'job_not_found');
    return job;
  }
  async submit(session: Session, shopId: string, requestId: string, input: z.infer<typeof SubmitJobSchema>) {
    return this.#auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, `submit-job/${shopId}`, input), async () => {
      const shop = this.get(session, shopId);
      await this.#auth.identity.assertCatalogOwner(session.network, shop.catalogSeed, session.ownerAccountId);
      if (shop.recordVersion !== input.expectedShopVersion) throw new ApiError(409, 'record_version_conflict');
      if (input.baseRevisionId && !this.revisions(session, shopId).some(value => value.id === input.baseRevisionId)) throw new ApiError(404, 'revision_not_found');
      if (this.jobs(session, shopId).filter(activeJob).length >= this.#auth.config.maxQueuedJobs) throw new ApiError(429, 'shop_job_limit');
      const now = new Date(this.#auth.now()).toISOString();
      const job = GenerationJobSchema.parse({schemaVersion: 2, kind: 'job', id: randomUUID(), recordVersion: 1, network: shop.network, ownerAccountId: shop.ownerAccountId,
        shopId, catalogSeed: shop.catalogSeed, state: 'queued', brief: input.brief, config: shop.config, baseRevisionId: input.baseRevisionId,
        attemptIds: [], revisionId: null, createdAt: now, updatedAt: now, currentAttemptId: null, cancelRequested: false,
        selectionVersion: shop.recordVersion + 1});
      return {changes: [job, {...shop, recordVersion: shop.recordVersion + 1, updatedAt: now}], result: {status: 202, data: job}};
    }, () => { this.get(session, shopId); });
  }
  attempts(session: Session, shopId: string, jobId: string) {
    this.job(session, shopId, jobId);
    return this.#auth.journal.list<BuildAttempt>('attempt', value => value.network === session.network && value.ownerAccountId === session.ownerAccountId && value.jobId === jobId)
      .map(({feedback: _feedback, ...attempt}) => attempt);
  }
  async cancel(session: Session, shopId: string, jobId: string, requestId: string) {
    return this.#auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, `cancel-job/${jobId}`, {shopId}), async () => {
      const job = this.job(session, shopId, jobId);
      if (!activeJob(job)) throw new ApiError(409, 'job_already_terminal');
      const updatedAt = new Date(this.#auth.now()).toISOString();
      const next: GenerationJob = {...job, recordVersion: job.recordVersion + 1, updatedAt, state: 'canceled', cancelRequested: true, errorCode: 'canceled'};
      const attempt = job.currentAttemptId ? this.#auth.journal.get<BuildAttempt>('attempt', job.network, job.ownerAccountId, job.currentAttemptId) : null;
      return {changes: [next, ...(attempt ? [{...attempt, recordVersion: attempt.recordVersion + 1, updatedAt, cancelRequested: true}] : [])], result: {status: 202, data: next}};
    }, () => { this.job(session, shopId, jobId); });
  }
}
