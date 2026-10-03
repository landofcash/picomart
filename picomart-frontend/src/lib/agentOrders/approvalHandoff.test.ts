import {afterEach, describe, expect, it, vi} from 'vitest'
import {clearApprovalFragment, consumeApprovalFragment, parseApprovalFragment} from './approvalHandoff'

afterEach(() => vi.unstubAllGlobals())

describe('agent-order approval handoff', () => {
  it('parses the minimal fragment and removes it immediately', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('history', {state: null, replaceState})
    const handoff = consumeApprovalFragment({
      pathname: '/agent-orders/approve',
      search: '',
      hash: '#v=1&network=testnet&orderSeed=AAAAAAAAAAAAAAAAAAAAAA&deliveryKey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    } as Location)
    expect(handoff.orderSeed).toBe('AAAAAAAAAAAAAAAAAAAAAA')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/agent-orders/approve')
  })

  it('rejects unknown fragment fields', () => {
    vi.stubGlobal('history', {state: null, replaceState: vi.fn()})
    expect(() => consumeApprovalFragment({
      pathname: '/agent-orders/approve',
      search: '',
      hash: '#v=1&network=testnet&orderSeed=AAAAAAAAAAAAAAAAAAAAAA&deliveryKey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&origin=https://evil.test',
    } as Location)).toThrow('Invalid approval link')
  })

  it('can retain the parsed handoff before clearing the fragment', () => {
    const replaceState = vi.fn()
    const location = {
      pathname: '/agent-orders/approve',
      search: '?source=qr',
      hash: '#v=1&network=testnet&orderSeed=AAAAAAAAAAAAAAAAAAAAAA&deliveryKey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    } as Location
    const navigationHistory = {state: null, replaceState} as unknown as History

    const handoff = parseApprovalFragment(location)
    expect(handoff.deliveryKey).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    expect(replaceState).not.toHaveBeenCalled()

    clearApprovalFragment(location, navigationHistory)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/agent-orders/approve?source=qr')
  })
})
