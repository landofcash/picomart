import { z } from "zod";
import {
  AgentEncryptedDeliverySchema as PicomartEncryptedDeliveryV1Schema,
  AgentQuoteSchema as PicomartOrderQuoteV1Schema,
  AgentPaymentRequiredSchema as PaymentRequiredSchema,
} from "@picomart/order-protocol/tempo-agent";
import { createClient, type RedisClientType } from "redis";

export const QuoteRecordSchema = z.object({
  version: z.literal(2),
  quote: PicomartOrderQuoteV1Schema,
  quoteDigest: z.string(),
  quoteJws: z.string(),
  paymentRequired: PaymentRequiredSchema,
  requestHash: z.string(),
  encryptedDelivery: PicomartEncryptedDeliveryV1Schema,
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  recoverUntil: z.number().int(),
  verification: z.object({ signingKid: z.string() }).strict(),
}).strict();
export type QuoteRecord = z.infer<typeof QuoteRecordSchema>;

export interface QuoteStore {
  create(network: string, seed: string, record: QuoteRecord, ttlSeconds: number): Promise<boolean>;
  get(network: string, seed: string): Promise<QuoteRecord | null>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const key = (network: string, seed: string) => `picomart:tempo:x402:quote:v2:${network}:${seed}`;

export class InMemoryQuoteStore implements QuoteStore {
  private records = new Map<string, { record: QuoteRecord; expires: number }>();
  constructor(private now = () => Math.floor(Date.now() / 1000)) {}
  async create(network: string, seed: string, record: QuoteRecord, ttlSeconds: number) {
    const name = key(network, seed);
    const existing=this.records.get(name);
    if (existing && existing.expires>this.now()) return false;
    this.records.set(name, { record: QuoteRecordSchema.parse(record), expires: this.now() + ttlSeconds });
    return true;
  }
  async get(network: string, seed: string) {
    const name = key(network, seed), value = this.records.get(name);
    if (!value) return null;
    if (value.expires <= this.now()) { this.records.delete(name); return null; }
    return QuoteRecordSchema.parse(structuredClone(value.record));
  }
  async ping() {}
  async close() {}
}

export class RedisQuoteStore implements QuoteStore {
  private constructor(private client: RedisClientType) {}
  static async connect(url: string) {
    const client = createClient({ url });
    await client.connect();
    return new RedisQuoteStore(client as RedisClientType);
  }
  async create(network: string, seed: string, record: QuoteRecord, ttlSeconds: number) {
    return (await this.client.set(key(network, seed), JSON.stringify(QuoteRecordSchema.parse(record)), {
      NX: true, EX: ttlSeconds,
    })) === "OK";
  }
  async get(network: string, seed: string) {
    const raw = await this.client.get(key(network, seed));
    return raw ? QuoteRecordSchema.parse(JSON.parse(raw)) : null;
  }
  async ping() { await this.client.ping(); }
  async close() { await this.client.quit(); }
}
