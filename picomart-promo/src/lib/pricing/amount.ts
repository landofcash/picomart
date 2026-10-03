/** Format exact base units without passing a monetary amount through Number. */
export function formatBaseUnits(amount: bigint, decimals: number, locale = 'en-US'): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) throw new Error('Invalid token decimals');
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const integer = new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(absolute / scale);
  const fraction = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  const separator = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.';
  return `${negative ? '-' : ''}${integer}${fraction ? separator + fraction : separator + '00'}`;
}

export function exactBaseUnits(value: number | string | bigint): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Prices must use exact integer base units');
  if (typeof value === 'string' && !/^\d+$/.test(value)) throw new Error('Prices must use decimal integer strings');
  return BigInt(value);
}
