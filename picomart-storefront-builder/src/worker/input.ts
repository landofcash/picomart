import {isPaymentCurrency} from '@picomart/config';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {z} from 'zod';
import {loadTempoCatalog} from '@picomart/order-protocol/tempo-protocol';
import {sha256} from '../storage/bunny.ts';
import {readOwnedCatalog,PATH_USD} from '../tempo.ts';
import {StorefrontConfigSchema} from '../domain/public-storefront.ts';
import type {GenerationJob} from '../domain/records.ts';
import type {Config} from '../config.ts';
import type {FileSet} from './files.ts';

const Product = z.object({ProductId: z.string().regex(/^[A-Za-z0-9_-]{22}$/), PriceToken: z.string().refine(isPaymentCurrency),
  Price: z.union([z.string().regex(/^[0-9]+$/).max(78), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String).refine(value => BigInt(value) > 0n && BigInt(value) < 2n ** 256n), Name: z.string().min(1).max(2000),
  Description: z.string().max(30000), Image: z.union([z.string().url().max(4000), z.literal('')]).default('')});
export const InputSchema = z.object({config: StorefrontConfigSchema, products: z.array(Product).min(1).max(1000), brief: z.string().min(1).max(12000)}).strict();
export function parseInput(value: unknown) {
  const input = InputSchema.parse(value);
  if (new Set(input.products.map(product => product.ProductId)).size !== input.products.length) throw new Error('Duplicate products');
  return input;
}
export type GenerationInput = ReturnType<typeof parseInput>;
export function configureSource(source: FileSet, input: GenerationInput): FileSet {
  const result = new Map(source); result.set('public/storefront.json', Buffer.from(JSON.stringify(input.config, null, 2) + '\n')); return result;
}
export async function boundedJson(url: string, signal: AbortSignal, maxBytes = 2 * 1024 * 1024, transport: typeof fetch = fetch) {
  const response = await transport(url, {redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])});
  if (!response.ok) { await response.body?.cancel(); throw new Error('Catalog request failed'); }
  const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw new Error('Catalog response limit'); chunks.push(value); } }
  finally { await reader.cancel(); }
  const bytes=Buffer.concat(chunks),hash=new URL(url).pathname.match(/^\/moderato\/v1\/0x[0-9a-f]{40}\/catalogs\/([0-9a-f]{64})\.json$/)?.[1];
  if(hash&&sha256(bytes)!==hash)throw new Error('Catalog revision digest mismatch');
  return JSON.parse(bytes.toString()) as unknown;
}
export async function catalogInput(config: Config, job: GenerationJob, signal: AbortSignal): Promise<GenerationInput> {
  const metadata=await readOwnedCatalog(config,job.catalogSeed,job.ownerAccountId);
  const url = new URL(metadata.catalogUrl);
  // Catalog URLs are merchant input. Fetch only HTTPS Bunny CDN hosts, with no redirects
  // or credentials, so the coordinator cannot be used to read private network services.
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    url.origin !== PICOMART_TEMPO_CONFIG.services.catalogOrigin) throw new Error('Unsupported catalog host; expected Bunny CDN');
  const catalog=await loadTempoCatalog(url.href,PICOMART_TEMPO_CONFIG.services.catalogOrigin,fetch,signal);
  return parseInput({config: job.config, brief: job.brief, products: catalog.products});
}
