import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {z} from 'zod'

export const ProductSchema = z.object({
  ProductId: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  PriceToken: z.literal(PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId),
  Price: z.bigint().positive().max(2n**256n-1n),
  Name: z.string().min(1),
  Description: z.string(),
  Image: z.union([z.string().url(), z.literal('')]).default(''),
})

export const ProductCatalogueSchema = z.array(ProductSchema)

export type Product = z.infer<typeof ProductSchema>
export type ProductCatalogue = z.infer<typeof ProductCatalogueSchema>
