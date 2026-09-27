import {pathToFileURL} from "node:url";

function decodeString(hex) {
  if (!/^0x(?:[0-9a-f]{64}){2,}$/i.test(hex)) throw new Error("Invalid ABI string result");
  const bytes = Buffer.from(hex.slice(2), "hex");
  const offset = Number(BigInt(`0x${bytes.subarray(0, 32).toString("hex")}`));
  if (!Number.isSafeInteger(offset) || offset < 32 || offset + 32 > bytes.length) throw new Error("Invalid ABI string offset");
  const length = Number(BigInt(`0x${bytes.subarray(offset, offset + 32).toString("hex")}`));
  if (!Number.isSafeInteger(length) || length < 1 || offset + 32 + length > bytes.length) throw new Error("Invalid ABI string length");
  return new TextDecoder("utf-8", {fatal: true}).decode(bytes.subarray(offset + 32, offset + 32 + length));
}

/** Read-only RPC calls; no wallet, secret, transaction, or faucet request is used. */
export async function verifyTempoConfig(config, fetchImpl = globalThis.fetch) {
  let requestId = 0;
  async function rpc(method, params = []) {
    const id = ++requestId;
    const response = await fetchImpl(config.rpcUrl, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id, method, params}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(`RPC ${method}: ${result.error.message}`);
    if (result.id !== id || typeof result.result !== "string") throw new Error(`Invalid RPC ${method} response`);
    return result.result;
  }
  const chainId = Number(BigInt(await rpc("eth_chainId")));
  if (chainId !== config.chainId) throw new Error(`RPC chain mismatch: expected ${config.chainId}, received ${chainId}`);
  const block = await rpc("eth_blockNumber");
  const tokens = await Promise.all(config.tokens.map(async token => {
    const address = token.tokenId;
    const code = await rpc("eth_getCode", [address, block]);
    if (!/^0x[0-9a-f]+$/i.test(code) || code === "0x0") throw new Error(`No token code at ${address}`);
    const [nameHex, symbolHex, decimalsHex] = await Promise.all([
      "0x06fdde03", "0x95d89b41", "0x313ce567",
    ].map(data => rpc("eth_call", [{to: address, data}, block])));
    const name = decodeString(nameHex), symbol = decodeString(symbolHex);
    const decimals = Number(BigInt(decimalsHex));
    if (symbol !== token.symbol || decimals !== token.decimals) {
      throw new Error(`Token metadata mismatch at ${address}: ${symbol}, ${decimals} decimals; expected ${token.symbol}, ${token.decimals}`);
    }
    return {address, name, symbol, decimals};
  }));
  return {chainId, block, tokens};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const {PICOMART_TEMPO_CONFIG} = await import("../dist/tempo.js");
    console.log(JSON.stringify(await verifyTempoConfig(PICOMART_TEMPO_CONFIG), null, 2));
  } catch (error) {
    console.error(`Tempo configuration verification failed: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`);
    process.exitCode = 1;
  }
}
