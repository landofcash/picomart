import { PICOMART_TEMPO_CONFIG, type TokenConfig } from "@picomart/config";
import {
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  keccak256,
  recoverAddress,
  toBeHex,
} from "ethers";
import { get, set } from "idb-keyval";
import { parseUnits, type Hex } from "viem";
import { Transaction } from "viem/tempo";
import {
  tempoTokenInterface,
  type TempoTransactionOptions,
  type TempoTransactionRecord,
  type TempoTransactionWallet,
} from "./tempoTransactions";

export interface TransferInput {
  token: string;
  recipient: string;
  amount: string;
  feeToken: string;
}
export interface TransferQuote extends TransferInput {
  account: string;
  chainId: number;
  baseUnits: string;
  balance: string;
  feeBalance: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  maximumFee: string;
  reviewedAt: number;
}
export type TempoTransferRequest = Transaction.TransactionSerializableTempo;
export interface TransferRecord extends TempoTransactionRecord {
  transfer?: {
    token: string;
    recipient: string;
    amount: string;
    feeToken: string;
  };
}
const chain = PICOMART_TEMPO_CONFIG.chainId;
// Shared with checkout: unresolved transfers must also block checkout writes.
const pendingKey = (account: string) =>
  `picomart_tempo_contract_test_tx_${chain}_${account.toLowerCase()}`;
const operationKey = (account: string, id: string) =>
  `picomart_tempo_transfer_v1_${chain}_${account.toLowerCase()}_${id}`;
let pageRevision = 0;
if (typeof window !== "undefined")
  window.addEventListener("pagehide", () => {
    pageRevision++;
  });

function address(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || value.toLowerCase() === ZeroAddress)
    throw new Error("Enter a valid Tempo address.");
  return value.toLowerCase() as Hex;
}
export function transferToken(value: string): TokenConfig {
  const token = PICOMART_TEMPO_CONFIG.tokens.find(
    (t) => t.tokenId.toLowerCase() === address(value),
  );
  if (!token) throw new Error("This token is not enabled for this account.");
  return token;
}
export function transferAmount(value: string, decimals: number): bigint {
  const amount = value.trim();
  if (!/^\d+(\.\d+)?$/.test(amount))
    throw new Error("Enter a positive amount.");
  if ((amount.split(".")[1]?.length ?? 0) > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`);
  const raw = parseUnits(amount, decimals);
  if (raw <= 0n || raw >= 2n ** 256n)
    throw new Error("Enter a valid positive amount.");
  return raw;
}
function normalized(input: TransferInput) {
  const token = transferToken(input.token),
    fee = transferToken(input.feeToken);
  return {
    token: address(token.tokenId),
    recipient: address(input.recipient),
    amount: input.amount.trim(),
    feeToken: address(fee.tokenId),
    baseUnits: transferAmount(input.amount, token.decimals).toString(),
  };
}
function validateRecord(
  value: unknown,
  account: string,
): TransferRecord | null {
  if (value == null) return null;
  const r = value as TransferRecord;
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(r.hash) ||
    address(r.account) !== address(account) ||
    !Number.isSafeInteger(r.nonce) ||
    r.nonce < 0 ||
    !["uncertain", "confirmed", "reverted", "not-submitted"].includes(
      r.state,
    ) ||
    (r.chainId !== undefined && r.chainId !== chain) ||
    typeof r.method !== "string"
  )
    throw new Error("Invalid saved transaction record.");
  return { ...r };
}

export function createTempoTransferService(options: {
  rpc: JsonRpcProvider;
  wallet: TempoTransactionWallet;
}) {
  const { rpc, wallet } = options;
  async function checkChain() {
    if (Number((await rpc.getNetwork()).chainId) !== chain)
      throw new Error("The network does not match this account.");
  }
  async function pending(account: string) {
    return validateRecord(await get(pendingKey(account)), account);
  }
  async function save(record: TransferRecord, latest = true) {
    if (record.transfer && record.operationId)
      await set(operationKey(record.account, record.operationId), record);
    if (latest) await set(pendingKey(record.account), record);
  }
  async function refresh(record: TransferRecord) {
    await checkChain();
    if (record.state === "not-submitted") return record;
    // Raw RPC avoids imposing Ethereum transaction/receipt formatting on Tempo.
    const receipt = await rpc.send("eth_getTransactionReceipt", [record.hash]);
    if (!receipt) {
      if (record.state !== "uncertain") record.state = "uncertain";
    } else {
      if (
        (receipt.transactionHash &&
          String(receipt.transactionHash).toLowerCase() !==
            record.hash.toLowerCase()) ||
        address(receipt.from) !== address(record.account) ||
        (record.to && receipt.to && address(receipt.to) !== address(record.to))
      )
        throw new Error("Transaction receipt differs from the saved transfer.");
      const status = BigInt(receipt.status);
      if (status !== 0n && status !== 1n)
        throw new Error("Transaction has no definitive result.");
      record.state = status === 1n ? "confirmed" : "reverted";
      record.block = Number(BigInt(receipt.blockNumber));
      record.fee = (
        BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)
      ).toString();
    }
    await save(record, false);
    if ((await pending(record.account))?.hash === record.hash)
      await set(pendingKey(record.account), record);
    return record;
  }
  async function estimate(
    input: TransferInput,
    expectedAccount: string,
  ): Promise<TransferQuote> {
    const terms = normalized(input),
      session = await wallet.capture();
    if (address(session.address) !== address(expectedAccount))
      throw new Error("The selected account changed.");
    await wallet.assert(session);
    await checkChain();
    await wallet.assert(session);
    const data = tempoTokenInterface.encodeFunctionData("transfer", [
      terms.recipient,
      terms.baseUnits,
    ]);
    // Explicit feeToken both overrides account preferences and lets RPC simulate liquidity checks.
    const estimated = BigInt(
      await rpc.send("eth_estimateGas", [
        {
          from: session.address,
          to: terms.token,
          data,
          value: "0x0",
          type: "0x76",
          feeToken: terms.feeToken,
        },
      ]),
    );
    await wallet.assert(session);
    if (estimated <= 0n || estimated > 30_000_000n)
      throw new Error("Transfer exceeds the supported transaction limit.");
    const buffered = (estimated * 120n + 99n) / 100n;
    const gas = buffered > 30_000_000n ? 30_000_000n : buffered;
    const fees = await rpc.getFeeData();
    await wallet.assert(session);
    if (
      !fees.maxFeePerGas ||
      fees.maxPriorityFeePerGas == null ||
      fees.maxPriorityFeePerGas < 0n ||
      fees.maxPriorityFeePerGas > fees.maxFeePerGas
    )
      throw new Error("Could not estimate the network fee.");
    const maximumFee =
      (gas * fees.maxFeePerGas + 999_999_999_999n) / 1_000_000_000_000n;
    const balance = BigInt(
      await new Contract(terms.token, tempoTokenInterface, rpc).balanceOf(
        session.address,
      ),
    );
    await wallet.assert(session);
    const feeBalance =
      terms.token === terms.feeToken
        ? balance
        : BigInt(
            await new Contract(
              terms.feeToken,
              tempoTokenInterface,
              rpc,
            ).balanceOf(session.address),
          );
    await wallet.assert(session);
    if (balance < BigInt(terms.baseUnits))
      throw new Error(
        `Insufficient ${transferToken(terms.token).symbol} to send this amount.`,
      );
    if (
      feeBalance <
      maximumFee +
        (terms.token === terms.feeToken ? BigInt(terms.baseUnits) : 0n)
    )
      throw new Error(
        `Insufficient ${transferToken(terms.feeToken).symbol} for the amount and network fee.`,
      );
    return {
      ...terms,
      account: address(session.address),
      chainId: chain,
      balance: balance.toString(),
      feeBalance: feeBalance.toString(),
      gas: gas.toString(),
      maxFeePerGas: fees.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      maximumFee: maximumFee.toString(),
      reviewedAt: Date.now(),
    };
  }
  return {
    estimateTransfer: estimate,
    async recoverTransfer(account: string) {
      if (!navigator.locks)
        throw new Error("This browser does not support safe transfers.");
      return navigator.locks.request(
        `picomart_tempo_transaction_${chain}_${address(account)}`,
        async () => {
          const r = await pending(account);
          return r ? refresh(r) : null;
        },
      );
    },
    async transferToken(quote: TransferQuote, opts: TempoTransactionOptions) {
      if (!/^[A-Za-z0-9:_-]{1,100}$/.test(opts.operationId))
        throw new Error("Invalid transfer operation.");
      if (!navigator.locks)
        throw new Error("This browser does not support safe transfers.");
      const terms = normalized(quote),
        account = address(opts.expectedAccount),
        page = pageRevision;
      if (
        address(quote.account) !== account ||
        quote.chainId !== chain ||
        terms.baseUnits !== quote.baseUnits
      )
        throw new Error("Transfer details changed after review.");
      const data = tempoTokenInterface.encodeFunctionData("transfer", [
        terms.recipient,
        terms.baseUnits,
      ]);
      const digest = keccak256(data);
      const matches = (r: TransferRecord) =>
        r.to === terms.token &&
        r.dataHash === digest &&
        r.transfer?.feeToken === terms.feeToken;
      return navigator.locks.request(
        `picomart_tempo_transaction_${chain}_${account}`,
        async () => {
          opts.signal?.throwIfAborted();
          await checkChain();
          const existing = validateRecord(
            await get(operationKey(account, opts.operationId)),
            account,
          );
          if (existing) {
            if (!matches(existing))
              throw new Error(
                "This operation belongs to different transfer details.",
              );
            if (existing.state !== "not-submitted") return refresh(existing);
          }
          const latest = await pending(account);
          if (
            latest &&
            latest.state !== "not-submitted" &&
            (await refresh(latest)).state === "uncertain"
          )
            throw new Error(
              "A transaction is still pending. Check its status before sending again.",
            );
          if (Date.now() - quote.reviewedAt > 120_000)
            throw new Error("This review expired. Review the transfer again.");
          const session = await wallet.capture();
          const checkpoint = async () => {
            opts.signal?.throwIfAborted();
            if (page !== pageRevision || address(session.address) !== account)
              throw new Error("The account or page changed.");
            await wallet.assert(session);
          };
          await checkpoint();
          const fresh = await estimate(terms, account);
          await checkpoint();
          const maximumFee = BigInt(quote.maximumFee);
          if (
            maximumFee !==
              (BigInt(quote.gas) * BigInt(quote.maxFeePerGas) +
                999_999_999_999n) /
                1_000_000_000_000n ||
            BigInt(quote.gas) > 30_000_000n ||
            BigInt(quote.gas) <= 0n ||
            BigInt(quote.maxPriorityFeePerGas) < 0n ||
            BigInt(quote.maxPriorityFeePerGas) > BigInt(quote.maxFeePerGas)
          )
            throw new Error("Invalid reviewed network fee.");
          if (
            BigInt(fresh.feeBalance) <
            maximumFee +
              (terms.token === terms.feeToken ? BigInt(terms.baseUnits) : 0n)
          )
            throw new Error(
              "Insufficient balance for the reviewed network fee.",
            );
          if (
            BigInt(fresh.maximumFee) > BigInt(quote.maximumFee) ||
            BigInt(fresh.gas) > BigInt(quote.gas) ||
            BigInt(fresh.maxFeePerGas) > BigInt(quote.maxFeePerGas) ||
            BigInt(fresh.maxPriorityFeePerGas) >
              BigInt(quote.maxPriorityFeePerGas)
          )
            throw new Error(
              "The network fee changed. Review the transfer again.",
            );
          const nonce = await rpc.getTransactionCount(account, "pending");
          await checkpoint();
          const request: TempoTransferRequest = {
            type: "tempo",
            chainId: chain,
            calls: [{ to: terms.token, data: data as Hex, value: 0n }],
            feeToken: terms.feeToken,
            nonce,
            nonceKey: 0n,
            gas: BigInt(quote.gas),
            maxFeePerGas: BigInt(quote.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(quote.maxPriorityFeePerGas),
          };
          const unsigned = await Transaction.serialize(request);
          await opts.beforeSign?.();
          await checkpoint();
          if (!wallet.signTransfer)
            throw new Error("This wallet does not support Tempo transfers.");
          const signed = await wallet.signTransfer(session, request);
          await checkpoint();
          if (!signed.startsWith("0x76"))
            throw new Error("Invalid transfer signature.");
          const checked = Transaction.deserialize(signed as `0x76${string}`),
            signature = checked.signature;
          if (
            !signature ||
            signature.type !== "secp256k1" ||
            checked.feePayerSignature != null ||
            (await Transaction.serialize({
              ...checked,
              signature: undefined,
            })) !== unsigned ||
            recoverAddress(keccak256(unsigned), {
              r: toBeHex(signature.signature.r, 32),
              s: toBeHex(signature.signature.s, 32),
              yParity: signature.signature.yParity as 0 | 1,
            }).toLowerCase() !== account
          )
            throw new Error(
              "Signed transaction differs from the reviewed transfer.",
            );
          const record: TransferRecord = {
            hash: keccak256(signed),
            account,
            method: "transfer",
            nonce,
            state: "uncertain",
            chainId: chain,
            to: terms.token,
            dataHash: digest,
            operationId: opts.operationId,
            gasLimit: quote.gas,
            maximumFeeBaseUnits: quote.maximumFee,
            transfer: {
              token: terms.token,
              recipient: terms.recipient,
              amount: terms.baseUnits,
              feeToken: terms.feeToken,
            },
          };
          try {
            await save(record);
          } catch (error) {
            record.state = "not-submitted";
            try {
              await save(record);
            } catch {
              /* Nothing was broadcast; retain available intent evidence. */
            }
            throw error;
          }
          try {
            await checkpoint();
          } catch (error) {
            record.state = "not-submitted";
            await save(record);
            throw error;
          }
          const notify = () => {
            try {
              opts.onSaved?.({ ...record });
            } catch {
              /* Observers cannot affect submission. */
            }
          };
          notify();
          try {
            const hash = await rpc.send("eth_sendRawTransaction", [signed]);
            if (String(hash).toLowerCase() !== record.hash)
              throw new Error("Unexpected transaction hash.");
            await rpc.waitForTransaction(record.hash, 1, 45_000);
          } catch {
            /* Preserve the saved intent when the submission response is lost. */
          }
          try {
            const result = await refresh(record);
            notify();
            return result;
          } catch {
            return record;
          }
        },
      );
    },
  };
}
