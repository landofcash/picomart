import {describe, expect, it, vi} from 'vitest'
import type {WalletAdapter} from '@/context/wallet/types'
import {wrapWalletAdapterWithWalletAction} from '@/context/wallet/wrapWalletAdapterWithWalletAction'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function makeAdapter(overrides?: Partial<WalletAdapter>): WalletAdapter {
  return {
    chain: 'hedera',
    name: 'test',
    id: 'test',

    getAddress: async () => '0.0.123',
    connect: async () => '0.0.123',
    disconnect: async () => {},

    signMessage: async () => new Uint8Array([1, 2, 3]),
    executeContract: async () => ({hash: '0xdef'}),
    executeBatch: async () => ({hash: '0xghi'}),
    signAndSubmit: async () => ({hash: '0xabc'}),

    ...overrides,
  }
}

describe('wrapWalletAdapterWithWalletAction', () => {
  it('calls onStart/end around signAndSubmit resolve', async () => {
    const end = vi.fn()
    const onStart = vi.fn().mockReturnValue(end)

    const d = deferred<{ hash: string }>()
    const adapter = makeAdapter({
      signAndSubmit: () => d.promise,
    })

    const wrapped = wrapWalletAdapterWithWalletAction(adapter, {onStart})

    const p = wrapped.signAndSubmit!({})
    expect(onStart).toHaveBeenCalledWith('signAndSubmit', expect.any(String))
    expect(end).not.toHaveBeenCalled()

    d.resolve({hash: 'ok'})
    await expect(p).resolves.toEqual({hash: 'ok'})
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('calls onStart/end around signMessage reject', async () => {
    const end = vi.fn()
    const onStart = vi.fn().mockReturnValue(end)

    const err = new Error('nope')
    const adapter = makeAdapter({
      signMessage: async () => {
        throw err
      },
    })

    const wrapped = wrapWalletAdapterWithWalletAction(adapter, {onStart})

    await expect(wrapped.signMessage('x', 'y')).rejects.toThrow('nope')
    expect(onStart).toHaveBeenCalledWith('signMessage', expect.any(String))
    expect(end).toHaveBeenCalledTimes(1)
  })
})
