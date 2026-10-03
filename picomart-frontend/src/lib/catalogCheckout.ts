import {getCurrentConfig, type NetworkConfig} from '@/config'
import {CartItemSchema} from './cartStorage'
import {catalogKey, cartItemKey} from './cartIdentity'

export function validateCatalogCheckout(
  selection: unknown,
  tokenTotals?: unknown,
  config: Pick<NetworkConfig, 'name' | 'supportedTokens'> = getCurrentConfig(),
) {
  const parsed = CartItemSchema.array().nonempty().safeParse(selection)
  if (!parsed.success) throw new Error('Choose a nonempty catalog with valid items and quantities from your cart.')
  const items = parsed.data
  const first = items[0]
  if (items.some(item => item.network !== config.name)) {
    throw new Error('This checkout belongs to another network. Switch back or return to your cart.')
  }
  if (!first.shopWallet || !first.seed || items.some(item => catalogKey(item) !== catalogKey(first))) {
    throw new Error('Checkout must contain items from one seller and one catalog.')
  }
  if (items.some(item => !item.id || item.price <= 0n || !Number.isSafeInteger(item.quantity))) {
    throw new Error('Every item must have a positive price and a valid positive quantity.')
  }
  if (new Set(items.map(cartItemKey)).size !== items.length) {
    throw new Error('This checkout contains duplicate items. Return to your cart and select the catalog again.')
  }
  const tokenId = first.priceToken
  if (!config.supportedTokens.some(token => token.tokenId === tokenId) || items.some(item => item.priceToken !== tokenId)) {
    throw new Error('A catalog checkout must use one supported payment token. Choose separate catalogs for different tokens.')
  }
  const amount = items.reduce((total, item) => total + item.price * BigInt(item.quantity), 0n)
  if (tokenTotals !== undefined) {
    if (!tokenTotals || typeof tokenTotals !== 'object' || Array.isArray(tokenTotals)) {
      throw new Error('The checkout total is invalid. Select the catalog again from your cart.')
    }
    const entries = Object.entries(tokenTotals)
    if (entries.length !== 1 || entries[0][0] !== tokenId || entries[0][1] !== amount) {
      throw new Error('The checkout total does not match the selected items. Select the catalog again from your cart.')
    }
  }
  return {items, tokenId, amount, tokenTotals: {[tokenId]: amount}}
}

export function checkoutError(order: {cartItems: unknown; tokenTotals: unknown}, network?: string): string | null {
  try {
    const config = getCurrentConfig()
    if (network && config.name !== network) throw new Error('The active network changed. Return to your cart.')
    if (order.tokenTotals === undefined) throw new Error('The checkout total is missing. Return to your cart.')
    validateCatalogCheckout(order.cartItems, order.tokenTotals, config)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid checkout. Return to your cart.'
  }
}
