import {PICOMART_CONFIG} from '@picomart/config';

// UI estimate only: storage retention starts before on-chain confirmation.
// If retention changes, add a dated historical policy before changing this cutoff.
export function messagePastRetention(message: {blockTimestamp?: number}, now = Date.now()): boolean {
  const timestamp = message.blockTimestamp;
  return Number.isSafeInteger(timestamp) && timestamp! > 0 &&
    now >= (timestamp! + PICOMART_CONFIG.orderMessageRetentionDays * 86400) * 1000;
}
export class OrderMessageUnavailableError extends Error {
  constructor() { super('Details no longer available.'); }
}
