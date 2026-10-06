import { describe, it, expect } from "vitest";
import {
  accountCurrencies,
  accountCurrency,
  transferAmount,
  transferRecipient,
} from "./currencies";
describe("account currency and transfer inputs", () => {
  it("keeps enabled currencies scoped to the supported network", () => {
    expect(accountCurrencies("moderato").map((c) => c.symbol)).toEqual([
      "PathUSD",
      "AlphaUSD",
      "BetaUSD",
      "OUSD",
    ]);
    expect(accountCurrencies("mainnet")).toEqual([]);
    expect(() => accountCurrency("0x" + "12".repeat(20))).toThrow(
      "not supported",
    );
  });
  it("parses exactly without floating-point rounding", () => {
    expect(transferAmount("123456789.123456")).toBe(123456789123456n);
    for (const value of [
      "0",
      "-1",
      "1e3",
      "1.0000001",
      "1,000",
      "1.2abc",
      "Infinity",
      "9".repeat(79),
    ])
      expect(() => transferAmount(value)).toThrow();
  });
  it("rejects zero, self and currency-contract recipients", () => {
    const self = "0x" + "11".repeat(20),
      other = "0x" + "22".repeat(20);
    expect(transferRecipient(other, self)).toBe(other);
    for (const value of [
      "bad",
      "0x" + "00".repeat(20),
      self,
      ...accountCurrencies("moderato").map((c) => c.tokenId),
    ])
      expect(() => transferRecipient(value, self)).toThrow();
  });
});
