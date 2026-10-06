import { ACCOUNT_CURRENCY_CONFIG, TEMPO_ACCOUNT_CURRENCIES } from "@/config/accountCurrencies";
import { getAddress, parseUnits, ZeroAddress } from "ethers";

export const ACCOUNT_CURRENCIES = TEMPO_ACCOUNT_CURRENCIES;
export function accountCurrencies(network: string) {
  return Object.prototype.hasOwnProperty.call(ACCOUNT_CURRENCY_CONFIG, network)
    ? ACCOUNT_CURRENCY_CONFIG[network]
    : [];
}
/** Display only: round in integer base units, without losing precision to Number. */
export function formatAccountBalance(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const magnitude = raw < 0n ? -raw : raw;
  const cents = (magnitude * 100n + scale / 2n) / scale;
  return `${raw < 0n && cents > 0n ? "-" : ""}${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}
export function accountCurrency(token: string) {
  const found = ACCOUNT_CURRENCIES.find(
    (currency) => currency.tokenId.toLowerCase() === token.toLowerCase(),
  );
  if (!found)
    throw new Error("This currency is not supported by this account.");
  return found;
}
export function transferRecipient(input: string, account: string) {
  let recipient: string;
  try {
    recipient = getAddress(input.trim());
  } catch {
    throw new Error("Enter a valid receiving address.");
  }
  if (
    recipient === ZeroAddress ||
    recipient.toLowerCase() === account.toLowerCase() ||
    ACCOUNT_CURRENCIES.some(
      (c) => c.tokenId.toLowerCase() === recipient.toLowerCase(),
    )
  )
    throw new Error(
      "Use another account’s receiving address, not your own or a currency contract.",
    );
  return recipient;
}
export function transferAmount(input: string, decimals = 6) {
  if (
    !new RegExp(`^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,${decimals}})?$`).test(
      input.trim(),
    )
  )
    throw new Error(`Enter an amount with up to ${decimals} decimal places.`);
  const amount = parseUnits(input.trim(), decimals);
  if (amount <= 0n || amount >= 2n ** 256n)
    throw new Error("Enter a positive amount within the supported range.");
  return amount;
}
