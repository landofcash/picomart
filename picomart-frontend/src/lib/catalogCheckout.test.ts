import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {getLegacyHederaConfig} from '@/testFixtures/legacyHederaConfig'
import {addItemToCart, getCartItems, saveCartItems, subtractPurchasedItems, type CartItem} from './cartStorage'
import {cartItemKey, catalogKey, groupCartByCatalog} from './cartIdentity'
import {checkoutError, validateCatalogCheckout} from './catalogCheckout'

const base: CartItem = {
  id: 'same-id', name: 'Item', price: 100n, quantity: 2, priceToken: '0.0.0',
  image: 'https://picomart.zkbytes.com/logo.svg', shopWallet: `0x${'ab'.repeat(20)}`,
  sellerPubKey: 'seller-key', seed: 'CatalogA', network: 'testnet',
}
const item = (changes: Partial<CartItem> = {}): CartItem => ({...base, ...changes})
const testnet = getLegacyHederaConfig('testnet')

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('cart identities and catalog snapshots', () => {
  it('merges only the same complete identity, including case-insensitive EVM sellers', () => {
    const others = [item({seed: 'CatalogB'}), item({shopWallet: `0x${'cd'.repeat(20)}`}), item({network: 'mainnet'})]
    saveCartItems([item(), ...others])
    addItemToCart(item({shopWallet: `0x${'AB'.repeat(20)}`, quantity: 1}))
    expect(getCartItems()).toEqual([item({quantity: 3}), ...others])
    expect(new Set([item(), ...others].map(cartItemKey)).size).toBe(4)
  })

  it('preserves exact seeds and product IDs and avoids separator collisions', () => {
    expect(catalogKey(item({seed: 'catalogA'}))).not.toBe(catalogKey(item()))
    expect(cartItemKey(item({id: 'SAME-ID'}))).not.toBe(cartItemKey(item()))
    expect(cartItemKey(item({seed: 'a|b', id: 'c'}))).not.toBe(cartItemKey(item({seed: 'a', id: 'b|c'})))
  })

  it('separates catalogs even when they share a seller and token, and clones the selection', () => {
    const lines = [item(), item({id: 'second'}), item({seed: 'CatalogB'})]
    const shops = groupCartByCatalog(lines)
    expect(shops).toHaveLength(1)
    expect(shops[0].catalogs.size).toBe(2)
    const selected = validateCatalogCheckout([...shops[0].catalogs.values()][0], undefined, testnet)
    expect(selected.items).toHaveLength(2)
    expect(selected.tokenTotals).toEqual({'0.0.0': 400n})
    lines[0].quantity = 100
    expect(selected.items[0].quantity).toBe(2)
  })

  it('subtracts only purchased quantities and preserves additions and other identities', () => {
    const otherCatalog = item({seed: 'CatalogB'})
    const otherSeller = item({shopWallet: '0.0.123'})
    const otherNetwork = item({network: 'mainnet'})
    const current = [item({quantity: 5}), item({id: 'second'}), otherCatalog, otherSeller, otherNetwork]
    expect(subtractPurchasedItems(current, [item(), item({id: 'second'})])).toEqual([
      item({quantity: 3}), otherCatalog, otherSeller, otherNetwork,
    ])
    expect(current[0].quantity).toBe(5)
    expect(subtractPurchasedItems(current, [])).toEqual(current)
  })
})

describe('catalog checkout validation', () => {
  it.each([
    ['empty', []],
    ['mixed catalog', [item(), item({seed: 'CatalogB'})]],
    ['mixed seller', [item(), item({shopWallet: '0.0.123'})]],
    ['mixed network', [item(), item({network: 'mainnet'})]],
    ['mixed token', [item(), item({id: 'other', priceToken: testnet.supportedTokens[1].tokenId})]],
    ['unsupported token', [item({priceToken: '0.0.99999999'})]],
    ['zero price', [item({price: 0n})]],
    ['negative price', [item({price: -1n})]],
    ['zero quantity', [item({quantity: 0})]],
    ['fractional quantity', [item({quantity: 1.5})]],
    ['unsafe quantity', [item({quantity: Number.MAX_SAFE_INTEGER + 1})]],
    ['duplicate line', [item(), item()]],
  ])('rejects %s', (_label, items) => {
    expect(() => validateCatalogCheckout(items, undefined, testnet)).toThrow()
  })

  it.each([{}, {'0.0.0': 199n}, {'0.0.0': '200'}, {'other': 200n}, {'0.0.0': 200n, other: 0n}, null])(
    'rejects incorrect totals %#', totals => {
      expect(() => validateCatalogCheckout([item()], totals, testnet)).toThrow()
    },
  )

  it('validates restored state and rejects it after a network switch', () => {
    const order = {cartItems: [item()], tokenTotals: {'0.0.0': 200n}}
    expect(checkoutError(order, 'testnet')).toBeNull()
    localStorage.setItem('Picomart-network', 'mainnet')
    expect(checkoutError(order, 'mainnet')).toMatch(/network/)
    expect(checkoutError({cartItems: null, tokenTotals: {}})).not.toBeNull()
    expect(checkoutError({cartItems: [item()], tokenTotals: undefined})).toMatch(/missing/)
  })
})

// Retained legacy tests explicitly select their historical profile; app defaults are Tempo.
vi.mock('@/config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/config')>();
  const {getLegacyHederaConfig} = await import('@/testFixtures/legacyHederaConfig');
  return {...actual, getCurrentConfig: () => getLegacyHederaConfig(localStorage.getItem('Picomart-network') || 'testnet')};
});
