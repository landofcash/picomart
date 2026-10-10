export function currencyLabel(token: {name: string; symbol: string}): string {
  return token.name === token.symbol ? token.name : `${token.name} (${token.symbol})`;
}
