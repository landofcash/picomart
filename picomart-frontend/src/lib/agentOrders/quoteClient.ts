import {
  QuoteResolutionSchema,
  base64UrlToBytes,
  canonicalEqual,
  canonicalHash,
  decryptDelivery,
  importQuotePublicKey,
  verifyQuoteDigestJws,
  type PicomartDeliveryDetailsV1,
  type PicomartFrontendApprovalHandoffV1,
  type PicomartOrderQuoteV1,
  type PaymentRequired,
  type TrustedPicomartProfileV1,
} from '@picomart/order-protocol'

export type ValidatedAgentOrder = {
  quote: PicomartOrderQuoteV1
  paymentRequired: PaymentRequired
  delivery: PicomartDeliveryDetailsV1
}

export async function resolveAndValidateAgentOrder(
  handoff: PicomartFrontendApprovalHandoffV1,
  profile: TrustedPicomartProfileV1,
  fetcher: typeof fetch = fetch,
): Promise<ValidatedAgentOrder> {
  const endpoint = `${profile.quoteOrigin}${profile.quoteResolutionPath}`
  const response = await fetcher(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({orderSeed: handoff.orderSeed}),
  })
  if (!response.ok || new URL(response.url || endpoint).origin !== profile.quoteOrigin) {
    throw new Error('The quote could not be resolved from the trusted Picomart origin.')
  }
  const resolved = QuoteResolutionSchema.parse(await response.json())
  const {quote, paymentRequired, quoteDigest, quoteJws, encryptedDelivery} = resolved
  if (quote.orderSeed !== handoff.orderSeed || quoteDigest !== await canonicalHash(quote) || quoteJws !== resolved.quoteJws) {
    throw new Error('Quote digest mismatch.')
  }
  const keys = new Map()
  for (const entry of profile.trustedQuoteKeys) keys.set(entry.kid, await importQuotePublicKey(entry.publicKey))
  await verifyQuoteDigestJws(quoteJws, quoteDigest, keys)
  const resourcePath = profile.confirmationPathTemplate.replace('{orderSeed}', handoff.orderSeed)
  const requirements = paymentRequired.accepts[0]
  if (quote.network !== profile.network || quote.picomart.contractId !== profile.contractId ||
      quote.picomart.contractEvmAddress !== profile.contractEvmAddress ||
      quote.picomart.hcsTopicId !== profile.hcsTopicId ||
      quote.x402.resourcePath !== resourcePath ||
      paymentRequired.resource.url !== `${profile.resourceOrigin}${resourcePath}` ||
      requirements.extra.quotePath !== profile.quoteResolutionPath ||
      requirements.extra.orderSeed !== quote.orderSeed || requirements.extra.quoteDigest !== quoteDigest ||
      requirements.extra.quoteJws !== quoteJws || requirements.amount !== quote.payment.amount ||
      requirements.asset !== quote.payment.asset || requirements.payTo !== quote.payment.payTo ||
      Date.now() / 1000 >= quote.expiresAt) {
    throw new Error('Quote does not match the installed trusted Picomart profile.')
  }
  const expectedRequestHash = await canonicalHash({
    orderSeed: quote.orderSeed,
    catalogSeed: quote.catalog.seed,
    items: quote.items.map(item => ({productId: item.productId, quantity: item.quantity})),
    encryptedDelivery,
  })
  if (quote.requestHash !== expectedRequestHash ||
      quote.delivery.encryptedDeliveryHash !== await canonicalHash(encryptedDelivery) ||
      !canonicalEqual(requirements, paymentRequired.accepts[0])) {
    throw new Error('Quote request commitment mismatch.')
  }
  const delivery = await decryptDelivery(
    encryptedDelivery,
    quote.orderSeed,
    base64UrlToBytes(handoff.deliveryKey),
  )
  if (quote.delivery.deliveryDetailsHash !== await canonicalHash(delivery)) {
    throw new Error('Delivery details commitment mismatch.')
  }
  return {quote, paymentRequired, delivery}
}
