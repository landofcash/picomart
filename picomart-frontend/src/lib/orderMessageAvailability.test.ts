import {describe, it, expect} from 'vitest';
import {PICOMART_CONFIG} from '@picomart/config';
import {messagePastRetention} from './orderMessageAvailability';
describe('order message retention cutoff', () => {
  const start = 1700000000;
  const cutoff = (start + PICOMART_CONFIG.orderMessageRetentionDays * 86400) * 1000;
  it('expires at the exact cutoff, not before', () => {
    expect(messagePastRetention({blockTimestamp:start}, cutoff-1)).toBe(false);
    expect(messagePastRetention({blockTimestamp:start}, cutoff)).toBe(true);
  });
  it('keeps unknown timestamps available', () => {
    for (const timestamp of [undefined, 0, NaN, -1]) expect(messagePastRetention({blockTimestamp:timestamp},cutoff)).toBe(false);
  });
  it('keeps a newer delivery message when the order message expires', () => {
    expect([{blockTimestamp:start},{blockTimestamp:start+86400}].filter(m => !messagePastRetention(m,cutoff))).toEqual([{blockTimestamp:start+86400}]);
  });
});
