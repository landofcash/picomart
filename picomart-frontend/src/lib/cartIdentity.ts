import type {CartItem} from './cartStorage'

type ShopIdentity = Pick<CartItem, 'network' | 'shopWallet'>
type CatalogIdentity = ShopIdentity & Pick<CartItem, 'seed'>
type ItemIdentity = CatalogIdentity & Pick<CartItem, 'id'>

function sellerKey(wallet: string): string {
  return /^0x[0-9a-f]{40}$/i.test(wallet) ? wallet.toLowerCase() : wallet
}

export const shopKey = (item: ShopIdentity): string => JSON.stringify([item.network, sellerKey(item.shopWallet)])
export const catalogKey = (item: CatalogIdentity): string => JSON.stringify([item.network, sellerKey(item.shopWallet), item.seed])
export const cartItemKey = (item: ItemIdentity): string => JSON.stringify([item.network, sellerKey(item.shopWallet), item.seed, item.id])

export function groupCartByCatalog(items: CartItem[]) {
  const shops = new Map<string, {key: string; wallet: string; catalogs: Map<string, CartItem[]>}>()
  for (const item of items) {
    const key = shopKey(item)
    let shop = shops.get(key)
    if (!shop) {
      shop = {key, wallet: item.shopWallet, catalogs: new Map()}
      shops.set(key, shop)
    }
    const catalog = catalogKey(item)
    const lines = shop.catalogs.get(catalog) ?? []
    lines.push(item)
    shop.catalogs.set(catalog, lines)
  }
  return [...shops.values()]
}
