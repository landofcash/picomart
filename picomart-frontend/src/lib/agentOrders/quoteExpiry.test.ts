import {describe, expect, it} from 'vitest'
import {
  MIN_QUOTE_EXECUTION_WINDOW_SECONDS,
  assertQuoteExecutable,
  quoteExecutionDeadlineMilliseconds,
} from './quoteExpiry'

describe('agent-order quote execution window', () => {
  it('accepts a quote with more than the required execution window remaining', () => {
    expect(() => assertQuoteExecutable({expiresAt: 1_061}, 1_000)).not.toThrow()
  })

  it('rejects expired quotes and quotes at the execution-window boundary', () => {
    expect(() => assertQuoteExecutable({expiresAt: 999}, 1_000)).toThrow('too close to expiry')
    expect(() => assertQuoteExecutable({
      expiresAt: 1_000 + MIN_QUOTE_EXECUTION_WINDOW_SECONDS,
    }, 1_000)).toThrow('too close to expiry')
  })

  it('calculates when an open approval page must become unavailable', () => {
    expect(quoteExecutionDeadlineMilliseconds({expiresAt: 1_700_000_600}))
      .toBe(1_700_000_540_000)
  })
})
