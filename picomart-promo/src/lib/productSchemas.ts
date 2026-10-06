import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {z} from 'zod'

export function createProductSchema(paymentTokens: readonly {tokenId: string}[]) {
return z.object({
  ProductId: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  PriceToken: z.string().regex(/^0x[0-9a-f]{40}$/).refine(token => paymentTokens.some(currency => currency.tokenId === token), 'Unsupported payment currency'),
  Price: z.bigint().positive().max(2n**256n-1n),
  Name: z.string().min(1),
  Description: z.string(),
  Image: z.union([z.string().url(), z.literal('')]).default(''),
})
}

export const ProductSchema = createProductSchema(PICOMART_TEMPO_CONFIG.paymentTokens)
export const ProductCatalogueSchema = z.array(ProductSchema)

export type Product = z.infer<typeof ProductSchema>
export type ProductCatalogue = z.infer<typeof ProductCatalogueSchema>
