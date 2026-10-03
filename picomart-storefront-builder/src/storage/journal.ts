import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from '../domain/errors.ts';
import {Hash, Id, RecordSchema, recordKey, type Kind, type RecordValue} from '../domain/records.ts';
import {jsonBytes, sha256, type ObjectStore} from './bunny.ts';

const ReceiptSchema = z.object({scope: z.string().max(100), requestId: Id, fingerprint: Hash}).strict();
export type Receipt = z.infer<typeof ReceiptSchema>;
export interface Result {status: number; data: unknown;}
const ResultSchema = z.object({status: z.number().int().min(200).max(299), data: z.unknown()}).strict();
const OperationSchema = z.object({
  schemaVersion: z.literal(2), id: Id, sequence: z.number().int().positive(), previousHash: Hash.nullable(),
  receipt: ReceiptSchema.nullable(), changes: z.array(RecordSchema).min(1).max(10), result: ResultSchema,
}).strict();
const CommitSchema = z.object({schemaVersion: z.literal(2), id: Id, sequence: z.number().int().positive(), sha256: Hash}).strict();
type Operation = z.infer<typeof OperationSchema>;

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
export function receipt(scope: string, requestId: string, action: string, input: unknown): Receipt {
  return ReceiptSchema.parse({scope, requestId, fingerprint: sha256(canonical({action, input}))});
}

// Immutable operations + verified completion markers are the durable source of truth.
// The maps are rebuilt on startup. One coordinator serializes every writer to this prefix.
export class Journal {
  readonly store: ObjectStore;
  readonly prefix: string;
  #records = new Map<string, RecordValue>();
  #receipts = new Map<string, {fingerprint: string; result: Result}>();
  #sequence = 0;
  #lastHash: string | null = null;
  #tail: Promise<unknown> = Promise.resolve();
  #pending = 0;
  #healthy = false;
  #maxOperations: number;
  #maxPending: number;
  private constructor(store: ObjectStore, prefix: string, maxOperations: number, maxPending: number) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(prefix)) throw new Error('Invalid journal prefix');
    this.store = store; this.prefix = prefix; this.#maxOperations = maxOperations; this.#maxPending = maxPending;
  }
  static async open(store: ObjectStore, prefix: string, maxOperations = 50000, maxPending = 32) {
    const journal = new Journal(store, prefix, maxOperations, maxPending);
    const entries = await store.list(`${prefix}/operations`);
    if (entries.length > maxOperations) throw new Error('Journal operation limit exceeded');
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.directory || !/^\d{12}-[a-f0-9-]{36}$/.test(entry.name)) throw new Error('Unexpected journal entry');
      const sequence = Number(entry.name.slice(0, 12)), id = Id.parse(entry.name.slice(13));
      if (sequence <= journal.#sequence) throw new Error('Conflicting coordinator sequence');
      journal.#sequence = sequence;
      const location = `${prefix}/operations/${entry.name}`;
      const marker = await store.get(`${location}/commit.json`, 1024);
      if (!marker) continue; // A partial upload was never acknowledged as committed.
      const commit = CommitSchema.parse(JSON.parse(marker.toString()));
      const bytes = await store.get(`${location}/operation.json`);
      if (commit.sequence !== sequence || commit.id !== id || !bytes || sha256(bytes) !== commit.sha256) throw new Error('Committed operation integrity failure');
      const operation = OperationSchema.parse(JSON.parse(bytes.toString()));
      if (operation.sequence !== sequence || operation.id !== id || operation.previousHash !== journal.#lastHash) throw new Error('Broken journal history');
      journal.#validate(operation);
      journal.#apply(operation, commit.sha256);
    }
    journal.#healthy = true;
    return journal;
  }
  get healthy() { return this.#healthy; }
  assertHealthy() { if (!this.#healthy) throw new ApiError(503, 'storage_recovery_required'); }
  get<T extends RecordValue>(kind: T['kind'], network: string, ownerAccountId: string, id: string): T | null {
    this.assertHealthy();
    const value = this.#records.get(`${network}/${ownerAccountId}/${kind}/${id}`);
    return value ? structuredClone(value) as T : null;
  }
  list<T extends RecordValue>(kind: T['kind'], predicate: (value: T) => boolean): T[] {
    this.assertHealthy();
    return [...this.#records.values()].filter(value => value.kind === kind).map(value => structuredClone(value) as T).filter(predicate);
  }
  #validate(operation: Operation) {
    const keys = new Set<string>();
    for (const value of operation.changes) {
      const key = recordKey(value), previous = this.#records.get(key);
      if (keys.has(key) || value.recordVersion !== (previous?.recordVersion ?? 0) + 1) throw new Error('Invalid record version');
      if (previous && (previous.createdAt !== value.createdAt || value.updatedAt < previous.updatedAt)) throw new Error('Invalid record history');
      keys.add(key);
    }
    if (operation.receipt && this.#receipts.has(`${operation.receipt.scope}/${operation.receipt.requestId}`)) throw new Error('Duplicate committed request');
  }
  #apply(operation: Operation, hash: string) {
    for (const value of operation.changes) this.#records.set(recordKey(value), structuredClone(value));
    if (operation.receipt) this.#receipts.set(`${operation.receipt.scope}/${operation.receipt.requestId}`, {fingerprint: operation.receipt.fingerprint, result: structuredClone(operation.result)});
    this.#lastHash = hash;
  }
  async transact(request: Receipt | null, build: () => Promise<{changes: RecordValue[]; result: Result}>, authorize?: () => void): Promise<Result> {
    this.assertHealthy();
    if (this.#pending >= this.#maxPending) throw new ApiError(503, 'coordinator_busy');
    this.#pending++;
    const run = this.#tail.then(async () => {
      this.assertHealthy(); authorize?.();
      if (request) {
        const prior = this.#receipts.get(`${request.scope}/${request.requestId}`);
        if (prior) {
          if (prior.fingerprint !== request.fingerprint) throw new ApiError(409, 'idempotency_conflict');
          return structuredClone(prior.result);
        }
      }
      if (this.#sequence >= this.#maxOperations) throw new ApiError(503, 'journal_capacity_reached');
      const draft = await build();
      const operation = OperationSchema.parse({schemaVersion: 2, id: randomUUID(), sequence: this.#sequence + 1, previousHash: this.#lastHash, receipt: request, ...draft});
      this.#validate(operation);
      const bytes = jsonBytes(operation);
      if (bytes.length > 2 * 1024 * 1024) throw new ApiError(413, 'operation_too_large');
      const hash = sha256(bytes), location = `${this.prefix}/operations/${String(operation.sequence).padStart(12, '0')}-${operation.id}`;
      try {
        await this.store.putVerified(`${location}/operation.json`, bytes);
        await this.store.putVerified(`${location}/commit.json`, jsonBytes({schemaVersion: 2, id: operation.id, sequence: operation.sequence, sha256: hash}));
      } catch {
        // The marker could have reached storage despite a lost response. Do not continue
        // with stale in-memory state or reuse this sequence. Startup reconciles it.
        this.#healthy = false;
        throw new ApiError(503, 'storage_recovery_required');
      }
      this.#sequence = operation.sequence; this.#apply(operation, hash);
      return structuredClone(operation.result);
    });
    this.#tail = run.catch(() => {});
    try { return await run; } finally { this.#pending--; }
  }
  async drain() { await this.#tail; }
}
