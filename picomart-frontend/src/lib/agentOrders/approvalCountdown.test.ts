import {describe, expect, it} from 'vitest'

import {formatAgentOrderCountdown} from './approvalCountdown'

describe('agent-order approval countdown', () => {
  it('formats the remaining quote lifetime as a compact countdown', () => {
    expect(formatAgentOrderCountdown(1_000, 478_000)).toBe('8:42')
    expect(formatAgentOrderCountdown(4_600, 1_000_000)).toBe('1:00:00')
    expect(formatAgentOrderCountdown(1_000, 1_000_000)).toBe('0:00')
  })
})
