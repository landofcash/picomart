import { describe, expect, it } from "vitest";
import { PICOMART_TEMPO_CONFIG } from "@picomart/config";
import { parseTempoRecipientQr } from "./tempoRecipientQr";
const address = "0x" + "11".repeat(20);
describe("recipient QR addresses", () => {
  it("accepts the plain address emitted by Receive and trims whitespace", () => {
    expect(parseTempoRecipientQr(" " + address + "\n")).toBe(address);
  });
  it("accepts Ethereum payment URIs on this network without importing amounts", () => {
    expect(
      parseTempoRecipientQr(
        `ethereum:${address}@${PICOMART_TEMPO_CONFIG.chainId}?value=1000000`,
      ),
    ).toBe(address);
  });
  it("rejects another network, zero addresses, malformed values and catalog links", () => {
    for (const text of [
      `ethereum:${address}@1`,
      "0x" + "00".repeat(20),
      address.slice(0, -1),
      `https://example.test/?address=${address}`,
      `ethereum:${address}/transfer?address=${address}`,
    ])
      expect(() => parseTempoRecipientQr(text)).toThrow();
  });
});
