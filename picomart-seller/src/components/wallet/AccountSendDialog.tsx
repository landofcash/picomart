import TokenAmount from "@/components/TokenAmount";
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { useWallet } from "@/context/WalletContext";
import {
  accountCurrencies,
  formatAccountBalance,
  transferAmount,
  transferRecipient,
} from "@/lib/internalWallet/currencies";
import {
  tempoTransactionError,
  type TempoFeeReview,
  type TempoTransactionRecord,
} from "@/lib/internalWallet/tempoTransactions";
import { getConfig, DEFAULT_PAYMENT_CURRENCY } from "@/config";
import AccountDialog from "./AccountDialog";
import AccountUnlockButton from "./AccountUnlockButton";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import AccountCurrencyPicker from "./AccountCurrencyPicker";

export default function AccountSendDialog({
  onClose,
  onBusyChange,
}: {
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const wallet = useWallet(),
    service = wallet.walletAdapter?.tempo,
    currencies = accountCurrencies(wallet.network);
  const [token, setToken] = useState<string>(currencies[0]?.tokenId ?? ""),
    [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState("");
  const [receipt, setReceipt] = useState<TempoTransactionRecord | null>(null),
    [fee, setFee] = useState<TempoFeeReview | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [recipientError, setRecipientError] = useState(""),
    [amountError, setAmountError] = useState("");
  const recipientInput = useRef<HTMLInputElement>(null);
  const approval = useRef<{
      resolve: () => void;
      reject: (error: Error) => void;
    } | null>(null),
    running = useRef(false),
    controller = useRef<AbortController | null>(null),
    live = useRef(true);
  const asset = currencies.find((item) => item.tokenId === token),
    balance = wallet.walletBalances.find(
      (item) => item.tokenId.toLowerCase() === token.toLowerCase(),
    );
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (wallet.walletLocked) {
      controller.current?.abort();
      approval.current?.reject(
        new Error("Account locked. Unlock it to review this transfer again."),
      );
      approval.current = null;
      setFee(null);
    }
  }, [wallet.walletLocked]);
  useEffect(() => {
    live.current = true;
    let active = true;
    setChecking(true);
    if (!service || !wallet.walletAddress || wallet.network !== PICOMART_TEMPO_CONFIG.network) {
      setChecking(false);
      return;
    }
    void service
      .pending(wallet.walletAddress)
      .then((saved) => {
        if (active && saved?.state === "uncertain") setReceipt(saved);
      })
      .catch(() => {
        if (active) {
          setCheckFailed(true);
          setError(
            "Could not check the last transfer. Close and reopen this dialog before sending.",
          );
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      live.current = false;
      controller.current?.abort();
      approval.current?.reject(new Error("Transfer review canceled."));
      approval.current = null;
    };
  }, [service, wallet.walletAddress, wallet.network]);
  function reviewDecision(approved: boolean) {
    const request = approval.current;
    approval.current = null;
    setFee(null);
    if (approved) request?.resolve();
    else request?.reject(new Error("Transfer review canceled."));
  }
  async function work(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (cause) {
      if (
        live.current &&
        !(
          cause instanceof Error &&
          cause.message === "Transfer review canceled."
        )
      )
        setError(tempoTransactionError(cause));
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function send() {
    if (
      !service ||
      !wallet.walletAddress ||
      !asset ||
      receipt ||
      checking ||
      checkFailed ||
      wallet.walletLocked
    )
      return;
    const address = wallet.walletAddress;
    let to: string, value: bigint;
    try {
      to = transferRecipient(recipient, address);
      setRecipientError("");
    } catch (cause) {
      setRecipientError((cause as Error).message);
      recipientInput.current?.focus();
      return;
    }
    try {
      value = transferAmount(amount, asset.decimals);
      setAmountError("");
    } catch (cause) {
      setAmountError((cause as Error).message);
      return;
    }
    await work(async () => {
      setRecipient(to);
      setAmount(formatUnits(value, asset.decimals));
      const abort = new AbortController();
      controller.current = abort;
      const result = await service.transfer(
        to,
        value,
        {
          operationId: `account-send:${crypto.randomUUID()}`,
          expectedAccount: address,
          signal: abort.signal,
          onSaved: (saved) => {
            if (live.current) setReceipt(saved);
          },
          reviewFee: (quote) =>
            new Promise<void>((resolve, reject) => {
              if (abort.signal.aborted) {
                reject(new Error("Transfer review canceled."));
                return;
              }
              approval.current = { resolve, reject };
              setFee(quote);
            }),
        },
        asset.tokenId,
      );
      if (live.current) setReceipt(result);
      void wallet.refreshActiveInternalWallet().catch(() => {});
    });
  }
  const close = () => {
    if (fee) reviewDecision(false);
    else if (!busy) onClose();
  };
  const disabled =
    busy || checking || checkFailed || !!receipt;
  const receiptCurrency = receipt?.to
    ? currencies.find(
        (item) => item.tokenId.toLowerCase() === receipt.to?.toLowerCase(),
      )
    : null;
  return (
    <AccountDialog
      open
      title={fee ? "Review transfer" : "Send funds"}
      onClose={close}
      busy={busy && !fee}
      className="max-w-md"
      headerAccessory={
        wallet.network === PICOMART_TEMPO_CONFIG.network ? (
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {PICOMART_TEMPO_CONFIG.label}
          </span>
        ) : undefined
      }
    >
      {receipt ? (
        <div className="space-y-4" role="status">
          <h3 className="font-semibold">
            {receipt.state === "confirmed"
              ? "Transfer confirmed"
              : receipt.state === "reverted"
                ? "Transfer did not complete"
                : receipt.state === "not-submitted"
                  ? "Transfer was not sent"
                  : "Checking payment status"}
          </h3>
          {receipt.method === "transfer" &&
            receiptCurrency &&
            receipt.amount &&
            /^\d+$/.test(receipt.amount) && (
              <p>
                {formatUnits(receipt.amount, receiptCurrency.decimals)}{" "}
                {receiptCurrency.symbol}
              </p>
            )}
          {receipt.recipient && (
            <p className="break-all text-sm">To: {receipt.recipient}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {receipt.state === "uncertain"
              ? "A saved payment is awaiting confirmation. Check its status before sending again."
              : receipt.state === "reverted"
                ? "The funds were not transferred. A network fee may still apply."
                : receipt.state === "not-submitted"
                  ? "No funds were sent. Close this dialog to start again."
                  : "You can view the payment record below."}
          </p>
          <a
            className="text-sm text-primary underline"
            href={`${getConfig(wallet.network).explorerBaseUrl}/tx/${receipt.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View payment record
          </a>
          {receipt.state === "uncertain" && (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const recovered = await service?.recover(
                    wallet.walletAddress!,
                  );
                  if (recovered && live.current) setReceipt(recovered);
                  void wallet.refreshActiveInternalWallet().catch(() => {});
                })
              }
            >
              {busy ? "Checking…" : "Check status"}
            </Button>
          )}
        </div>
      ) : fee ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 space-y-5">
            <div className="flex items-center gap-3">
              {asset && (
                <img
                  src={asset.img}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full"
                />
              )}
              <div className="min-w-0">
                <p className="mb-1 text-xs text-muted-foreground">
                  You're sending
                </p>
                <p className="break-all text-2xl font-semibold tracking-tight tabular-nums">
                  {amount}
                </p>
                <p className="text-sm text-muted-foreground">{asset?.symbol}</p>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="mb-2 text-xs text-muted-foreground">Send to</p>
              <p className="break-all font-mono text-sm leading-6">
                {recipient}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="text-sm text-muted-foreground">Maximum fee</p>
              <p className="text-sm font-semibold tabular-nums">
                <TokenAmount token={fee.feeToken ?? DEFAULT_PAYMENT_CURRENCY.tokenId} amount={fee.maximumFeeBaseUnits} size={16} />
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The actual fee may be lower. Check the address carefully before
            sending.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-12 shrink-0"
              onClick={() => reviewDecision(false)}
            >
              Back
            </Button>
            <Button
              className="h-12 min-w-0 flex-1 gap-2 px-3"
              onClick={() => reviewDecision(true)}
            >
              Confirm and send
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <AccountCurrencyPicker
                network={wallet.network}
                value={token}
                balances={wallet.walletBalances}
                disabled={disabled}
                onChange={(value) => {
                  setToken(value);
                  setAmount("");
                  setAmountError("");
                  setError("");
                }}
              />
              <label htmlFor="account-transfer-amount" className="sr-only">
                Amount
              </label>
              <Input
                id="account-transfer-amount"
                className="h-14 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-right text-xl font-semibold tracking-tight tabular-nums shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-primary md:text-3xl"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setAmountError("");
                  setError("");
                }}
                disabled={disabled}
                placeholder="0.00"
                required
                aria-invalid={!!amountError}
                aria-describedby={
                  amountError
                    ? "account-transfer-amount-error"
                    : "account-transfer-available"
                }
              />
            </div>
            {amountError && (
              <p
                id="account-transfer-amount-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {amountError}
              </p>
            )}
            <p
              id="account-transfer-available"
              className="text-xs text-muted-foreground"
            >
              {balance ? (
                <span title={`${balance.formatted} ${asset?.symbol}`}>
                  Available:{" "}
                  {formatAccountBalance(balance.raw, balance.decimals)}{" "}
                  {asset?.symbol}
                </span>
              ) : (
                "Balance unavailable. We’ll check your funds before review."
              )}
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="account-transfer-recipient"
              className="text-sm font-medium"
            >
              Send to
            </label>
            <div className="flex items-center gap-1 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/50">
              <Input
                id="account-transfer-recipient"
                ref={recipientInput}
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setRecipientError("");
                  setError("");
                }}
                onBlur={() => {
                  if (recipient.trim())
                    try {
                      transferRecipient(recipient, wallet.walletAddress!);
                      setRecipientError("");
                    } catch (cause) {
                      setRecipientError((cause as Error).message);
                    }
                }}
                disabled={disabled}
                placeholder="Receiving address"
                autoComplete="off"
                spellCheck={false}
                required
                className="h-12 min-w-0 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
                aria-invalid={!!recipientError}
                aria-describedby={
                  recipientError
                    ? "account-transfer-recipient-error"
                    : undefined
                }
              />
            </div>
            {recipientError && (
              <p
                id="account-transfer-recipient-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {recipientError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-12 shrink-0"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </Button>
            <div className="min-w-0 flex-1">
              {wallet.walletLocked ? (
                <AccountUnlockButton
                  variant="default"
                  label="Unlock to continue"
                  className="h-12 gap-2 px-3"
                />
              ) : (
                <Button
                  className="h-12 w-full gap-2 px-3"
                  disabled={
                    disabled ||
                    !asset ||
                    !service ||
                    wallet.network !== PICOMART_TEMPO_CONFIG.network
                  }
                  type="submit"
                >
                  {checking
                    ? "Checking account…"
                    : busy
                      ? "Preparing…"
                      : "Review transfer"}
                  {busy || checking ? (
                    <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {receipt && !fee && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={close}
          disabled={busy}
        >
          Done
        </Button>
      )}
    </AccountDialog>
  );
}
