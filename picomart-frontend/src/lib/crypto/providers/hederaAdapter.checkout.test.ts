import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {WalletAdapter} from '@/context/wallet/types'
import type {CartItem} from '@/lib/cartStorage'
import {hederaAdapter} from './hederaAdapter'
import {uploadEncryptedPayloadToHfs} from '@/lib/hedera/hfsStorage'
import {requireHcsTopicId} from '@/lib/hedera/hederaUtils'
import {getCurrentConfig} from '@/config'

vi.mock('@/lib/hedera/hfsStorage', () => ({uploadEncryptedPayloadToHfs: vi.fn()}))
vi.mock('@/lib/hedera/hederaUtils', () => ({
  requireHcsTopicId: vi.fn(),
  getContractEvmAddress: () => `0x${'11'.repeat(20)}`,
}))

const line: CartItem = {
  id: 'product', name: 'Quoted product', price: 100n, quantity: 2, priceToken: '0.0.0',
  image: 'https://picomart.zkbytes.com/logo.svg', seed: 'catalog', network: 'testnet',
  shopWallet: `0x${'ab'.repeat(20)}`, sellerPubKey: 'seller-key',
}
const hash = Buffer.alloc(32).toString('base64')
const publicKey = Buffer.from(`02${'11'.repeat(32)}`, 'hex').toString('base64')
const executeBatch = vi.fn()
const wallet = {executeBatch} as unknown as WalletAdapter

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', {getItem: () => 'testnet'})
  vi.mocked(requireHcsTopicId).mockResolvedValue('0.0.123')
  vi.mocked(uploadEncryptedPayloadToHfs).mockResolvedValue({fileId: '0.0.456', payloadHash: hash})
  executeBatch.mockResolvedValue({hash: 'transaction'})
})
afterEach(() => vi.unstubAllGlobals())

describe('paid checkout transaction batch', () => {
  it.each(['0.0.0', '0.0.429274'])('uses one final contract call when paying with %s', async tokenId => {
    await hederaAdapter.createOrderPaidOnBlockchain(
      wallet, {[tokenId]: 200n}, [{...line, priceToken: tokenId}],
      '1234567890123456789012', publicKey, 'AA==', 'AA==', hash, hash, 'ciphertext',
    )

    const batch = executeBatch.mock.calls[0][0]
    expect(batch.map((entry: {type: string}) => entry.type)).toEqual(
      tokenId === '0.0.0' ? ['hcs', 'contract'] : ['hcs', 'tokenAllowance', 'contract'],
    )
    if (tokenId !== '0.0.0') {
      expect(batch[1].data).toEqual({tokenId, spender: getCurrentConfig().contractAddress, amount: 200n})
    }
    expect(batch.at(-1).data.function).toBe('createOrderPaid')
    expect(batch.at(-1).data.amount).toBe(tokenId === '0.0.0' ? 200n : 0n)
  })
})

describe.each(['createOrderInitialOnBlockchain', 'createOrderPaidOnBlockchain'] as const)('%s catalog boundary', method => {
  const submit = (items: CartItem[], totals: Record<string, bigint> = {'0.0.0': 200n}) =>
    hederaAdapter[method](wallet, totals, items, '1234567890123456789012', publicKey, 'AA==', 'AA==', hash, hash, 'ciphertext')

  it.each([
    ['empty', []],
    ['mixed catalog', [line, {...line, seed: 'other'}]],
    ['mixed seller', [line, {...line, shopWallet: '0.0.789'}]],
    ['mixed network', [line, {...line, network: 'mainnet'}]],
    ['mixed token', [line, {...line, id: 'second', priceToken: '0.0.429274'}]],
    ['unsupported', [{...line, priceToken: 'unknown'}]],
  ])('rejects %s before any topic, upload or transaction work', async (_name, items) => {
    await expect(submit(items)).rejects.toThrow()
    expect(requireHcsTopicId).not.toHaveBeenCalled()
    expect(uploadEncryptedPayloadToHfs).not.toHaveBeenCalled()
    expect(executeBatch).not.toHaveBeenCalled()
  })

  it('rejects an incorrect total before side effects', async () => {
    await expect(submit([line], {'0.0.0': 201n})).rejects.toThrow(/total/)
    expect(uploadEncryptedPayloadToHfs).not.toHaveBeenCalled()
    expect(executeBatch).not.toHaveBeenCalled()
  })

  it('accepts the existing agent-order item shape and submits its catalog and calculated total', async () => {
    await expect(submit([line])).resolves.toBe('transaction')
    expect(uploadEncryptedPayloadToHfs).toHaveBeenCalledOnce()
    const batch = executeBatch.mock.calls[0][0]
    const contract = batch.find((entry: {type: string}) => entry.type === 'contract').data
    expect(contract.arguments[2].value).toBe(200n)
    expect(new TextDecoder().decode(contract.arguments[1].value).replace(/\0/g, '')).toBe('catalog')
  })

  it('rechecks the network after topic resolution and before upload', async () => {
    vi.mocked(requireHcsTopicId).mockImplementation(async () => {
      vi.stubGlobal('localStorage', {getItem: () => 'mainnet'})
      return '0.0.123'
    })
    await expect(submit([line])).rejects.toThrow(/network/)
    expect(uploadEncryptedPayloadToHfs).not.toHaveBeenCalled()
    expect(executeBatch).not.toHaveBeenCalled()
  })

  it('rechecks the network after upload and before order submission', async () => {
    vi.mocked(uploadEncryptedPayloadToHfs).mockImplementation(async () => {
      vi.stubGlobal('localStorage', {getItem: () => 'mainnet'})
      return {fileId: '0.0.456', payloadHash: hash}
    })
    await expect(submit([line])).rejects.toThrow(/network/)
    expect(executeBatch).not.toHaveBeenCalled()
  })
})

// Retained legacy tests explicitly select their historical profile; app defaults are Tempo.
vi.mock('@/config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/config')>();
  const {getLegacyHederaConfig} = await import('@/testFixtures/legacyHederaConfig');
  return {...actual, getCurrentConfig: () => getLegacyHederaConfig(localStorage.getItem('Picomart-network') || 'testnet')};
});
