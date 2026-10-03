import type {PicomartOrderQuoteV1} from '@picomart/order-protocol'

export const MIN_QUOTE_EXECUTION_WINDOW_SECONDS = 60
export const QUOTE_NOT_EXECUTABLE_MESSAGE =
  'The quote has expired or is too close to expiry. Request a new quote.'

export function assertQuoteExecutable(
  quote: Pick<PicomartOrderQuoteV1, 'expiresAt'>,
  nowSeconds = Date.now() / 1000,
): void {
  if (nowSeconds + MIN_QUOTE_EXECUTION_WINDOW_SECONDS >= quote.expiresAt) {
    throw new Error(QUOTE_NOT_EXECUTABLE_MESSAGE)
  }
}

export function quoteExecutionDeadlineMilliseconds(
  quote: Pick<PicomartOrderQuoteV1, 'expiresAt'>,
): number {
  return (quote.expiresAt - MIN_QUOTE_EXECUTION_WINDOW_SECONDS) * 1000
}
