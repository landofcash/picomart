import {z} from 'zod';
import {NetworkSchema} from '../config.ts';
import {CatalogIdSchema, StorefrontConfigSchema} from './public-storefront.ts';

export const Id = z.string().uuid();
export const AccountId = z.string().regex(/^0x[a-f0-9]{40}$/).refine(value=>value!=='0x'+'0'.repeat(40),'Expected a nonzero Tempo address');
export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const Address = z.string().regex(/^0x[a-f0-9]{40}$/);
export const Timestamp = z.string().datetime();
const common = {schemaVersion: z.literal(2), id: Id, recordVersion: z.number().int().positive(), createdAt: Timestamp, updatedAt: Timestamp};
const owned = {network: NetworkSchema, ownerAccountId: AccountId};
const scoped = {...owned, shopId: Id};
export const ShopSchema = z.object({
  ...common, ...owned, kind: z.literal('shop'), catalogSeed: CatalogIdSchema,
  config: StorefrontConfigSchema, selectedDraftId: Id.nullable(), publishedRevisionId: Id.nullable(),
}).strict().refine(value => value.config.shopId === value.id && value.config.network === value.network && value.config.catalogSeed === value.catalogSeed, 'Shop identity must match public configuration');
export const GenerationJobSchema = z.object({
  ...common, ...scoped, kind: z.literal('job'), catalogSeed: CatalogIdSchema,
  state: z.enum(['queued', 'running', 'provisioning', 'generating', 'building', 'validating', 'uploading', 'ready', 'failed', 'canceled']),
  brief: z.string().trim().min(1).max(12000), config: StorefrontConfigSchema,
  baseRevisionId: Id.nullable(), attemptIds: z.array(Id).max(10), revisionId: Id.nullable(),
  currentAttemptId: Id.nullable().optional(), inputHash: Hash.optional(),
  cancelRequested: z.boolean().optional(), errorCode: z.string().max(100).nullable().optional(),
  selectionVersion: z.number().int().positive().optional(),
}).strict().refine(value => value.config.shopId === value.shopId && value.config.network === value.network && value.config.catalogSeed === value.catalogSeed, 'Job snapshot identity mismatch');
export const BuildAttemptSchema = z.object({
  ...common, ...scoped, kind: z.literal('attempt'), jobId: Id, attemptNumber: z.number().int().positive(),
  baseRevisionId: Id.nullable(), sandboxId: z.string().max(200).nullable(),
  state: z.enum(['created', 'running', 'collecting', 'ready', 'failed', 'canceled']),
  cleanup: z.enum(['pending', 'destroying', 'destroyed', 'failed']),
  deadline: Timestamp, commandRefs: z.array(z.string().max(200)).max(100), cancelRequested: z.boolean(),
  creationRequestedAt: Timestamp.optional(), cleanupAttempts: z.number().int().nonnegative().optional(),
  nextCleanupAt: Timestamp.optional(), errorCode: z.string().max(100).nullable().optional(),
  stage: z.string().max(100).optional(), stageStartedAt: Timestamp.optional(),
  timings: z.record(z.string(), z.number().nonnegative()).optional(), artifactBytes: z.number().int().nonnegative().optional(),
  retryable: z.boolean().optional(), feedback: z.string().max(24000).optional(), finalized: z.boolean().optional(),
  preparedRevisionHash: Hash.optional(),
}).strict();
export const ArtifactPath = z.string().max(300).refine(value => value.split('/').every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part)), 'Invalid artifact path');
export const ArtifactSchema = z.object({path: ArtifactPath, size: z.number().int().min(0).max(50 * 1024 * 1024), sha256: Hash}).strict();
export const RevisionManifestSchema = z.object({
  ...common, ...scoped, kind: z.literal('revision'), jobId: Id, attemptId: Id, parentRevisionId: Id.nullable(),
  state: z.literal('ready'), templateVersion: z.string().min(1).max(100), environmentVersion: z.string().min(1).max(200), model: z.string().min(1).max(100),
  config: StorefrontConfigSchema, files: z.array(ArtifactSchema).min(1).max(2000),
  validation: z.object({typecheck: z.literal(true), lint: z.literal(true), build: z.literal(true), browser: z.literal(true), cleanup: z.literal('destroyed')}).strict(),
}).strict().refine(value => value.config.shopId === value.shopId && value.config.network === value.network, 'Revision identity mismatch');
export const PublicationOperationSchema = z.object({
  ...common, ...scoped, kind: z.literal('publication'), previousRevisionId: Id.nullable(), requestedRevisionId: Id,
  state: z.enum(['pending', 'uploading', 'switching', 'restoring', 'completed', 'failed']),
  intent: z.enum(['publish', 'rollback']).optional(), signerAddress: Address.optional(),
  verifiedAt: Timestamp.nullable(), errorCode: z.string().max(100).nullable(),
}).strict();
export const ChallengeSchema = z.object({
  ...common, ...owned, kind: z.literal('challenge'), origin: z.string().url(), signerAddress: Address,
  expiresAt: Timestamp, consumedAt: Timestamp.nullable(), message: z.string().max(2000),
}).strict();
export const SessionSchema = z.object({
  ...common, id: Hash, ...owned, kind: z.literal('session'), origin: z.string().url(), signerAddress: Address,
  expiresAt: Timestamp, revokedAt: Timestamp.nullable(),
}).strict();
export const RecordSchema = z.union([ShopSchema, GenerationJobSchema, BuildAttemptSchema, RevisionManifestSchema, PublicationOperationSchema, ChallengeSchema, SessionSchema]);
export type RecordValue = z.infer<typeof RecordSchema>;
export type Shop = z.infer<typeof ShopSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type BuildAttempt = z.infer<typeof BuildAttemptSchema>;
export const activeJob = (job: GenerationJob) => !['ready', 'failed', 'canceled'].includes(job.state);
export type Challenge = z.infer<typeof ChallengeSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Revision = z.infer<typeof RevisionManifestSchema>;
export type Publication = z.infer<typeof PublicationOperationSchema>;
export type Kind = RecordValue['kind'];
export const recordKey = (value: Pick<RecordValue, 'kind' | 'network' | 'ownerAccountId' | 'id'>) => `${value.network}/${value.ownerAccountId}/${value.kind}/${value.id}`;
