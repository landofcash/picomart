import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeeData, JsonRpcProvider, Network, keccak256 } from "ethers";
import { Account, Transaction } from "viem/tempo";
import { PICOMART_TEMPO_CONFIG as config } from "@picomart/config";
import {
  createTempoTransactionService,
  tempoTokenInterface,
  type TempoTransactionWallet,
} from "./tempoTransactions";
import { transferAmount, type TransferRecord } from "./tempoTransfers";

const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  get: async (key: string) => db.get(key),
  set: async (key: string, value: unknown) => {
    db.set(key, structuredClone(value));
  },
}));
const signer = Account.fromSecp256k1(`0x${"11".repeat(32)}`);
const account = signer.address.toLowerCase();
const recipient = `0x${"22".repeat(20)}`;
const path = config.defaultPaymentToken.tokenId;
const alpha = config.tokens[1].tokenId;
const rpc = new JsonRpcProvider("https://unused.test");
const state = {
  revision: 0,
  locked: false,
  balances: new Map<string, bigint>(),
  receipts: new Map<string, unknown>(),
  nonce: 7,
  estimate: 50000n,
  outcome: "confirmed",
  fee: 1_000_000_000n,
  chain: config.chainId,
};
const wallet: TempoTransactionWallet = {
  capture: async () => {
    if (state.locked) throw new Error("Unlock account");
    return { walletId: "test", address: account, revision: state.revision };
  },
  assert: async (s) => {
    if (state.locked || s.revision !== state.revision)
      throw new Error("Account changed or locked");
  },
  sign: async () => {
    throw new Error("Use the Tempo signing path");
  },
  signTransfer: async (_session, request) => signer.signTransaction(request),
};
const service = () =>
  createTempoTransactionService({ wallet, rpc, deployment: () => null });
let s = service();
const input = () => ({
  token: alpha,
  recipient,
  amount: "1.234567",
  feeToken: path,
});
const opts = (operationId = "transfer-test") => ({
  operationId,
  expectedAccount: account,
});
let submitted: Transaction.TransactionSerializableTempo | undefined;
beforeEach(() => {
  vi.restoreAllMocks();
  db.clear();
  state.revision = 0;
  state.locked = false;
  state.nonce = 7;
  state.estimate = 50000n;
  state.outcome = "confirmed";
  state.fee = 1_000_000_000n;
  state.chain = config.chainId;
  state.receipts.clear();
  state.balances = new Map(
    config.tokens.map((t) => [t.tokenId.toLowerCase(), 10_000_000n]),
  );
  submitted = undefined;
  s = service();
  const queues = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    locks: {
      request: <T>(key: string, work: () => Promise<T>) => {
        const next = (queues.get(key) ?? Promise.resolve())
          .catch(() => {})
          .then(work);
        queues.set(key, next);
        return next;
      },
    },
  });
  vi.spyOn(rpc, "getNetwork").mockImplementation(async () =>
    Network.from(state.chain),
  );
  vi.spyOn(rpc, "getCode").mockImplementation(async () => {
    throw new Error("Commerce verification is not needed");
  });
  vi.spyOn(rpc, "getFeeData").mockImplementation(
    async () => new FeeData(null, state.fee, 0n),
  );
  vi.spyOn(rpc, "getTransactionCount").mockImplementation(
    async () => state.nonce,
  );
  vi.spyOn(rpc, "call").mockImplementation(async (tx) =>
    tempoTokenInterface.encodeFunctionResult("balanceOf", [
      state.balances.get(String(tx.to).toLowerCase()) ?? 0n,
    ]),
  );
  vi.spyOn(rpc, "waitForTransaction").mockResolvedValue(null);
  vi.spyOn(rpc, "send").mockImplementation(async (method, params) => {
    const args = params as unknown[];
    if (method === "eth_estimateGas") return `0x${state.estimate.toString(16)}`;
    if (method === "eth_getTransactionReceipt")
      return state.receipts.get(String(args[0])) ?? null;
    if (method === "eth_sendRawTransaction") {
      const raw = args[0] as `0x76${string}`;
      submitted = Transaction.deserialize(raw);
      const hash = keccak256(raw);
      expect(await s.pending(account)).toMatchObject({
        hash,
        state: "uncertain",
      });
      state.nonce++;
      if (state.outcome === "uncertain") throw new Error("Response lost");
      state.receipts.set(hash, {
        from: account,
        to: submitted.calls[0].to,
        status: state.outcome === "confirmed" ? "0x1" : "0x0",
        blockNumber: "0x10",
        gasUsed: "0xc350",
        effectiveGasPrice: "0x3b9aca00",
      });
      return hash;
    }
    throw new Error(`Unexpected RPC method ${method}`);
  });
});
describe("account transfers with explicit Tempo fees", () => {
  it("previews the selected token and fee currency without signing or checking commerce", async () => {
    const sign = vi.spyOn(wallet, "signTransfer");
    const quote = await s.estimateTransfer(input(), account);
    expect(quote).toMatchObject({
      token: alpha,
      baseUnits: "1234567",
      feeToken: path,
      maximumFee: "60",
    });
    expect(rpc.send).toHaveBeenCalledWith("eth_estimateGas", [
      expect.objectContaining({
        to: alpha,
        feeToken: path,
        type: "0x76",
        data: tempoTokenInterface.encodeFunctionData("transfer", [
          recipient,
          1234567n,
        ]),
      }),
    ]);
    expect(sign).not.toHaveBeenCalled();
    expect(rpc.getCode).not.toHaveBeenCalled();
    expect(db.size).toBe(0);
  });
  it("signs and broadcasts exactly the selected token, amount and fee token", async () => {
    const quote = await s.estimateTransfer(input(), account);
    const result = await s.transferToken(quote, opts());
    expect(result.state).toBe("confirmed");
    expect(submitted).toMatchObject({
      type: "tempo",
      chainId: config.chainId,
      feeToken: path,
      nonce: 7,
    });
    expect(submitted!.calls).toEqual([
      {
        to: alpha,
        data: tempoTokenInterface.encodeFunctionData("transfer", [
          recipient,
          1234567n,
        ]),
      },
    ]);
    expect(submitted!.calls[0].value ?? 0n).toBe(0n);
    expect(rpc.getCode).not.toHaveBeenCalled();
  });
  it("accepts a different fee currency and combines amount and fees when they use the same token", async () => {
    const quote = await s.estimateTransfer(
      { ...input(), feeToken: alpha },
      account,
    );
    await s.transferToken(quote, opts());
    expect(submitted?.feeToken).toBe(alpha);
    state.balances.set(alpha, 1234567n);
    await expect(
      s.estimateTransfer({ ...input(), feeToken: alpha }, account),
    ).rejects.toThrow("network fee");
  });
  it("rejects missing fee funds even when the transfer token has funds", async () => {
    state.balances.set(path, 0n);
    await expect(s.estimateTransfer(input(), account)).rejects.toThrow(
      "PathUSD",
    );
  });
  it("rejects unsupported tokens, invalid addresses, zero and excess precision", async () => {
    expect(() => transferAmount("1.0000001", 6)).toThrow("decimal places");
    expect(() => transferAmount("0", 6)).toThrow("positive");
    await expect(
      s.estimateTransfer({ ...input(), token: recipient }, account),
    ).rejects.toThrow("not enabled");
    await expect(
      s.estimateTransfer({ ...input(), recipient: "0x0" }, account),
    ).rejects.toThrow("address");
  });
  it("rejects wrong chain, account switches, locks and expired reviews before broadcast", async () => {
    state.chain = 1;
    await expect(s.estimateTransfer(input(), account)).rejects.toThrow(
      "network",
    );
    state.chain = config.chainId;
    const quote = await s.estimateTransfer(input(), account);
    await expect(
      s.transferToken({ ...quote, reviewedAt: Date.now() - 130000 }, opts()),
    ).rejects.toThrow("expired");
    await expect(
      s.transferToken(quote, { ...opts(), expectedAccount: recipient }),
    ).rejects.toThrow("changed");
    state.locked = true;
    await expect(s.transferToken(quote, opts())).rejects.toThrow("Unlock");
    state.locked = false;
    vi.mocked(rpc.getFeeData).mockImplementationOnce(async () => {
      state.revision++;
      return new FeeData(null, state.fee, 0n);
    });
    await expect(s.transferToken(quote, opts())).rejects.toThrow("changed");
    expect(submitted).toBeUndefined();
  });
  it("requires review again when fees increase and rejects a changed signed fee token", async () => {
    const quote = await s.estimateTransfer(input(), account);
    state.fee *= 2n;
    await expect(s.transferToken(quote, opts())).rejects.toThrow("fee changed");
    state.fee /= 2n;
    vi.spyOn(wallet, "signTransfer").mockImplementationOnce(
      async (_session, request) =>
        signer.signTransaction({ ...request, feeToken: alpha }),
    );
    await expect(s.transferToken(quote, opts())).rejects.toThrow("differs");
    expect(db.size).toBe(0);
    expect(submitted).toBeUndefined();
  });
  it("never broadcasts twice after response loss, retries or concurrent tabs", async () => {
    const quote = await s.estimateTransfer(input(), account);
    state.outcome = "uncertain";
    const [first, second] = await Promise.all([
      s.transferToken(quote, opts()),
      s.transferToken(quote, opts()),
    ]);
    expect(first.hash).toBe(second.hash);
    expect(state.nonce).toBe(8);
    expect((await service().transferToken(quote, opts())).hash).toBe(
      first.hash,
    );
    await expect(s.transferToken(quote, opts("new-transfer"))).rejects.toThrow(
      "pending",
    );
    expect(state.nonce).toBe(8);
    await expect(s.approve(1n, opts("checkout"))).rejects.toThrow(
      "not enabled",
    );
  });
  it("recovers saved transfer metadata after reload and does not expose signing material", async () => {
    const quote = await s.estimateTransfer(input(), account);
    state.outcome = "uncertain";
    const result = await s.transferToken(quote, opts());
    state.receipts.set(result.hash, {
      from: account,
      to: alpha,
      status: "0x1",
      blockNumber: "0x11",
      gasUsed: "0xc350",
      effectiveGasPrice: "0x3b9aca00",
    });
    expect(await service().recoverTransfer(account)).toMatchObject({
      state: "confirmed",
      hash: result.hash,
      transfer: { token: alpha, feeToken: path },
    });
    const persisted = JSON.stringify([...db.values()]);
    expect(persisted).not.toContain("11".repeat(32));
    expect(persisted).not.toContain("0x76");
  });
  it("does not resubmit a reverted transfer or replace an unrelated unresolved transaction", async () => {
    const quote = await s.estimateTransfer(input(), account);
    state.outcome = "reverted";
    const result = await s.transferToken(quote, opts());
    expect((await s.transferToken(quote, opts())).hash).toBe(result.hash);
    expect(state.nonce).toBe(8);
    const old: TransferRecord = {
      hash: `0x${"33".repeat(32)}`,
      account,
      nonce: 9,
      method: "approve",
      state: "uncertain",
    };
    db.set(`picomart_tempo_contract_test_tx_${config.chainId}_${account}`, old);
    await expect(s.transferToken(quote, opts("next-transfer"))).rejects.toThrow(
      "pending",
    );
    expect(state.nonce).toBe(8);
  });
});
