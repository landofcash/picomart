import { expect, it, vi } from "vitest";
import { PICOMART_TEMPO_CONFIG as config } from "@picomart/config";
import { Contract, JsonRpcProvider } from "ethers";
import { generatePrivateKey } from "viem/accounts";
import { Account } from "viem/tempo";
import {
  createTempoTransactionService,
  tempoTokenInterface,
} from "./tempoTransactions";

// Explicit opt-in. Uses only fresh throwaway accounts and testnet faucet funds.
// Keys remain in memory and are never printed or persisted.
const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  get: async (key: string) => db.get(key),
  set: async (key: string, value: unknown) => {
    db.set(key, structuredClone(value));
  },
}));
it.runIf(process.env.PICOMART_TRANSFER_LIVE === "1")(
  "confirms selected-token transfers and explicit fee choices on the configured testnet",
  async () => {
    if (config.network !== "moderato" || config.chainId !== 42431)
      throw new Error("This check is restricted to Tempo testnet.");
    const sender = Account.fromSecp256k1(generatePrivateKey());
    const recipient = Account.fromSecp256k1(generatePrivateKey()).address;
    const rpc = new JsonRpcProvider(config.rpcUrl);
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
    try {
      expect(Number((await rpc.getNetwork()).chainId)).toBe(config.chainId);
      const funding: string[] = await rpc.send("tempo_fundAddress", [
        sender.address,
      ]);
      await Promise.all(
        funding.map((hash) => rpc.waitForTransaction(hash, 1, 45_000)),
      );
      const session = {
        walletId: "throwaway-live-check",
        address: sender.address,
        revision: 0,
      };
      const service = createTempoTransactionService({
        rpc,
        deployment: () => null,
        wallet: {
          capture: async () => session,
          assert: async (s) => {
            if (s !== session) throw new Error("Account changed");
          },
          sign: async () => {
            throw new Error("Use Tempo signing");
          },
          signTransfer: async (_session, request) =>
            sender.signTransaction(request),
        },
      });
      const funded = [];
      for (const token of config.tokens) {
        const balance: bigint = await new Contract(
          token.tokenId,
          tempoTokenInterface,
          rpc,
        ).balanceOf(sender.address);
        if (balance > 1_000_000n) funded.push(token);
      }
      expect(funded.length).toBeGreaterThanOrEqual(2);
      for (let index = 0; index < funded.length; index++) {
        const token = funded[index],
          fee = funded[(index + 1) % funded.length];
        const contract = new Contract(token.tokenId, tempoTokenInterface, rpc);
        const before: bigint = await contract.balanceOf(recipient);
        const quote = await service.estimateTransfer(
          {
            token: token.tokenId,
            recipient,
            amount: "0.01",
            feeToken: fee.tokenId,
          },
          sender.address,
        );
        const receipt = await service.transferToken(quote, {
          operationId: `live-transfer-${index}`,
          expectedAccount: sender.address,
        });
        expect(receipt.state).toBe("confirmed");
        expect(await contract.balanceOf(recipient)).toBe(before + 10_000n);
        const raw = await rpc.send("eth_getTransactionByHash", [receipt.hash]);
        expect(raw.feeToken.toLowerCase()).toBe(fee.tokenId.toLowerCase());
        expect(raw.type).toBe("0x76");
        const retry = await service.transferToken(quote, {
          operationId: `live-transfer-${index}`,
          expectedAccount: sender.address,
        });
        expect(retry.hash).toBe(receipt.hash);
        console.log(
          `Confirmed ${token.symbol} transfer, fees in ${fee.symbol}: ${receipt.hash}`,
        );
      }
    } finally {
      rpc.destroy();
      vi.unstubAllGlobals();
    }
  },
  120_000,
);
