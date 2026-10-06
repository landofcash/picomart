import {describe, expect, it} from "vitest";
import {assertTempoChainId, PICOMART_TEMPO_CONFIG, TEMPO_TOKENS} from "../test-support/tempo.js";
import {verifyTempoConfig} from "../scripts/verify-tempo-config.mjs";

const encodeString = (value: string) => {
  const hex = Buffer.from(value).toString("hex");
  return `0x${"20".padStart(64, "0")}${(hex.length / 2).toString(16).padStart(64, "0")}${hex.padEnd(Math.ceil(hex.length / 64) * 64, "0")}`;
};

function rpcFixture(options: {chainId?: number; decimals?: number; symbol?: string; missingCode?: boolean; error?: boolean} = {}) {
  const calls: string[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    calls.push(request.method);
    let result: string;
    if (request.method === "eth_chainId") result = `0x${(options.chainId ?? 42431).toString(16)}`;
    else if (request.method === "eth_blockNumber") result = "0x123";
    else if (request.method === "eth_getCode") result = options.missingCode ? "0x" : "0x6000";
    else {
      expect(request.params[1]).toBe("0x123");
      const {to, data} = request.params[0];
      const token = PICOMART_TEMPO_CONFIG.tokens.find(token => token.tokenId === to)!;
      result = data === "0x313ce567" ? `0x${(options.decimals ?? 6).toString(16)}` :
        encodeString(data === "0x95d89b41" ? options.symbol ?? (to.endsWith("0000") ? "PathUSD" : "AlphaUSD") : token.name);
    }
    return {ok: true, json: async () => options.error ?
      {id: request.id, error: {message: "RPC unavailable"}} : {id: request.id, result}};
  };
  return {fetchImpl, calls};
}

describe("prepared Tempo configuration", () => {
  it("rejects mainnet and invalid chains before signing", () => {
    assertTempoChainId(42431);
    assertTempoChainId(42431n);
    for (const chain of [4217, 295, 0, NaN]) expect(() => assertTempoChainId(chain)).toThrow();
  });

  it("keeps undeployed commerce disabled and AlphaUSD outside the payment allowlist", () => {
    expect(PICOMART_TEMPO_CONFIG.deployment).toBeNull();
    expect(PICOMART_TEMPO_CONFIG.mainnetEnabled).toBe(false);
    expect(PICOMART_TEMPO_CONFIG.paymentTokens).toEqual([TEMPO_TOKENS.pathUSD]);
    expect(PICOMART_TEMPO_CONFIG.feeToken).toBe(TEMPO_TOKENS.pathUSD);
    expect(() => Object.assign(TEMPO_TOKENS.pathUSD, {decimals: 8})).toThrow();
  });

  it("checks both tokens at one recorded block with read-only RPC calls", async () => {
    const {fetchImpl, calls} = rpcFixture();
    const result = await verifyTempoConfig(PICOMART_TEMPO_CONFIG, fetchImpl);
    expect(result.chainId).toBe(42431);
    expect(result.tokens.map((token: {symbol: string}) => token.symbol)).toEqual(["PathUSD", "AlphaUSD"]);
    expect(new Set(calls)).toEqual(new Set(["eth_chainId", "eth_blockNumber", "eth_getCode", "eth_call"]));
  });

  it("rejects a wrong RPC chain before reading token data", async () => {
    const {fetchImpl, calls} = rpcFixture({chainId: 4217});
    await expect(verifyTempoConfig(PICOMART_TEMPO_CONFIG, fetchImpl)).rejects.toThrow("chain mismatch");
    expect(calls).toEqual(["eth_chainId"]);
  });

  it.each([{decimals: 8}, {symbol: "USDC"}, {symbol: "pathUSD"}, {missingCode: true}, {error: true}])("rejects invalid token/RPC evidence: %j", async options => {
    const {fetchImpl} = rpcFixture(options);
    await expect(verifyTempoConfig(PICOMART_TEMPO_CONFIG, fetchImpl)).rejects.toThrow();
  });
});
