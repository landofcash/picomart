import {z} from 'zod'

export const ProductSchema = z.object({
  ProductId: z.string(),
  PriceToken: z.string(),
  Price: z.number().int().positive(),
  Name: z.string().min(1),
  Description: z.string(),
  Image: z.string().url(),
})

export const ProductCatalogueSchema = z.array(ProductSchema)

export type Product = z.infer<typeof ProductSchema>
export type ProductCatalogue = z.infer<typeof ProductCatalogueSchema>
