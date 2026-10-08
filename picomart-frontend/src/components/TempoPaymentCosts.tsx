import { getCurrency } from '@picomart/config';
import { formatUnits } from 'ethers';
import type { TempoPaymentQuote } from '@/lib/internalWallet/tempoTransactions';
import TokenIcon from './TokenIcon';

export function paymentQuoteInsufficient(quote: TempoPaymentQuote) {
  return BigInt(quote.balance) < BigInt(quote.requiredBalance) || BigInt(quote.feeBalance) < BigInt(quote.requiredFeeBalance);
}

export default function TempoPaymentCosts({ quote }: { quote: TempoPaymentQuote }) {
  const payment = getCurrency(quote.token), fee = getCurrency(quote.feeToken);
  const amount = (value: string, currency: typeof payment) => <span className="inline-flex items-center gap-1.5"><TokenIcon assetId={currency.tokenId} size={16} />{formatUnits(value, currency.decimals)} {currency.symbol}</span>;
  return <section className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm" aria-label="Payment costs">
    <div className="flex justify-between gap-3"><span>Available payment balance</span>{amount(quote.balance, payment)}</div>
    {quote.feeToken !== quote.token && <div className="flex justify-between gap-3"><span>Available fee balance</span>{amount(quote.feeBalance, fee)}</div>}
    <div className="flex justify-between gap-3"><span>Total transaction fees, up to</span>{amount(quote.maximumFee, fee)}</div>
    <div className="flex justify-between gap-3 font-semibold"><span>Payment balance needed</span>{amount(quote.requiredBalance, payment)}</div>
    {quote.feeToken !== quote.token && <div className="flex justify-between gap-3 font-semibold"><span>Fee balance needed</span>{amount(quote.requiredFeeBalance, fee)}</div>}
    <p className="text-muted-foreground">{quote.approvalRequired ? 'The fee limit covers authorization and payment. Payment fees are reserved conservatively until authorization confirms.' : 'The fee limit covers payment.'} Actual fees may be lower. If fees exceed this limit, payment stops for a new review.</p>
    {paymentQuoteInsufficient(quote) && <p role="alert">{BigInt(quote.balance) < BigInt(quote.requiredBalance) ? `Add ${payment.symbol} to cover your payment${quote.token === quote.feeToken ? ' and fees' : ''}.` : `Add ${fee.symbol} to cover transaction fees.`}</p>}
  </section>;
}
