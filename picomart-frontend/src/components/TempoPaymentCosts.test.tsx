import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PICOMART_TEMPO_CONFIG } from '@picomart/config';
import type { TempoPaymentQuote } from '@/lib/internalWallet/tempoTransactions';
import TempoPaymentCosts, { paymentQuoteInsufficient } from './TempoPaymentCosts';

const path = PICOMART_TEMPO_CONFIG.feeToken;
const alpha = PICOMART_TEMPO_CONFIG.tokens.find(token => token.key === 'alphaUSD')!;
const quote = { token: alpha.tokenId, feeToken: path.tokenId, balance: '1000000', feeBalance: '20000', maximumFee: '20000', requiredBalance: '1000000', requiredFeeBalance: '20000', approvalRequired: true } as TempoPaymentQuote;

describe('payment and fee currency review', () => {
  it('displays AlphaUSD payment funds separately from PathUSD fees and loads both icons', () => {
    const html = renderToStaticMarkup(<TempoPaymentCosts quote={quote} />);
    expect(html).toContain('1.0 AlphaUSD');
    expect(html).toContain('0.02 PathUSD');
    expect(html).not.toContain('0.02 AlphaUSD');
    expect(html).toContain(`src="${alpha.img}"`);
    expect(html).toContain(`src="${path.img}"`);
    expect(paymentQuoteInsufficient(quote)).toBe(false);
  });
  it('blocks insufficient payment or fee funds independently', () => {
    expect(paymentQuoteInsufficient({ ...quote, balance: '999999' })).toBe(true);
    expect(paymentQuoteInsufficient({ ...quote, feeBalance: '19999' })).toBe(true);
    expect(renderToStaticMarkup(<TempoPaymentCosts quote={{ ...quote, feeBalance: '19999' }} />)).toContain('Add PathUSD');
  });
  it('includes fees in the required payment balance when one currency covers both', () => {
    const shared = { ...quote, token: path.tokenId, requiredBalance: '1020000', requiredFeeBalance: '1020000', feeBalance: '1000000' };
    expect(paymentQuoteInsufficient(shared)).toBe(true);
    expect(renderToStaticMarkup(<TempoPaymentCosts quote={shared} />)).toContain('Add PathUSD to cover your payment and fees.');
  });
});
