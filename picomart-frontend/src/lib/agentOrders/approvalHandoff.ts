import {PicomartFrontendApprovalHandoffV1Schema} from '@picomart/order-protocol'

export function parseApprovalFragment(location: Location = window.location) {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  const allowed = new Set(['v', 'network', 'orderSeed', 'deliveryKey'])
  if ([...params.keys()].some(key => !allowed.has(key)) ||
      params.get('v') !== '1' || params.get('network') !== 'testnet') {
    throw new Error('Invalid approval link.')
  }
  const handoff = PicomartFrontendApprovalHandoffV1Schema.parse({
    version: 1,
    network: 'hedera:testnet',
    orderSeed: params.get('orderSeed'),
    deliveryKey: params.get('deliveryKey'),
  })
  return handoff
}

export function clearApprovalFragment(
  location: Location = window.location,
  navigationHistory: History = history,
) {
  navigationHistory.replaceState(
    navigationHistory.state,
    '',
    `${location.pathname}${location.search}`,
  )
}

export function consumeApprovalFragment(location: Location = window.location) {
  const handoff = parseApprovalFragment(location)
  clearApprovalFragment(location)
  return handoff
}
