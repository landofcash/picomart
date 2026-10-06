import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {z} from 'zod';
import {tempoSeedToId} from '@picomart/order-protocol/tempo-protocol';

export const ProductIdSchema=z.string().regex(/^[A-Za-z0-9_-]{22}$/);
export const CatalogIdSchema=ProductIdSchema.refine(value=>{try{tempoSeedToId(value);return true;}catch{return false;}},'Expected a canonical nonzero Tempo catalog seed');
const text = z.string().trim().min(1).max(500);
const httpsUrl = z.string().url().refine(value => value.startsWith('https://'), 'Use an HTTPS URL');
const asset = z.union([
  httpsUrl,
  z.string().regex(/^shop-assets\/[A-Za-z0-9_./-]+$/).refine(value => !value.split('/').includes('..')),
]);

export const StorefrontConfigSchema = z.object({
  schemaVersion: z.literal(2),
  shopId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  network: z.literal('moderato'),
  chainId: z.literal(PICOMART_TEMPO_CONFIG.chainId).default(PICOMART_TEMPO_CONFIG.chainId),
  contractAddress: z.literal(PICOMART_TEMPO_CONFIG.deployment.address).default(PICOMART_TEMPO_CONFIG.deployment.address),
  catalogSeed: CatalogIdSchema,
  branding: z.object({
    name: text,
    description: text,
    eyebrow: text.optional(),
    headline: text,
    story: z.string().trim().max(4000).optional(),
    logo: asset.optional(),
    favicon: asset.optional(),
    shareImage: httpsUrl.optional(),
  }),
  collections: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    name: text,
    description: text.optional(),
    productIds: z.array(ProductIdSchema).max(1000),
  })).max(30).default([]).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Collection IDs must be unique'),
  featuredProductIds: z.array(ProductIdSchema).max(24).default([]),
  links: z.array(z.object({label: text, url: httpsUrl})).max(12).default([]),
});

export type StorefrontConfig = z.infer<typeof StorefrontConfigSchema>;
