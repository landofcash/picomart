import { formatUnits } from 'ethers';
import { getCurrency } from '@picomart/config';
import TokenIcon from './TokenIcon';

export function TokenLabel({ token, size = 20 }: { token: string; size?: number }) {
  const currency = getCurrency(token);
  return <span className="inline-flex items-center gap-1.5 align-middle"><TokenIcon assetId={currency.tokenId} size={size} />{currency.symbol}</span>;
}

export default function TokenAmount({ token, amount, size = 20 }: { token: string; amount: string | bigint; size?: number }) {
  const currency = getCurrency(token);
  return <span className="inline-flex items-center gap-1.5 align-middle"><TokenIcon assetId={currency.tokenId} size={size} /><span>{formatUnits(amount, currency.decimals)} {currency.symbol}</span></span>;
}
