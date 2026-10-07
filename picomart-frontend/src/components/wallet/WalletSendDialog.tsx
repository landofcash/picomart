import { useEffect, useRef, useState } from "react";
import { PICOMART_TEMPO_CONFIG } from "@picomart/config";
import { formatUnits, isAddress } from "viem";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  RefreshCcw,
  Send,
  X,
  ScanLine,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TokenIcon from "@/components/TokenIcon";
import WalletActionDialog from "./WalletActionDialog";
import WalletTokenSelect from "./WalletTokenSelect";
import WalletAddressScanner from "./WalletAddressScanner";
import {
  transferAmount,
  type TransferQuote,
  type TransferRecord,
} from "@/lib/internalWallet/tempoTransfers";
import { tempoNetworkLabel } from "@/lib/tempoNetworks";

const tokens = PICOMART_TEMPO_CONFIG.tokens;
const outlineClass =
  "border-slate-300 bg-background text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
function message(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (e.code)
    return "Could not prepare this transfer. Check the address, balances, and selected fee token, then try again.";
  return (
    e.message ??
    "Could not complete the transfer. Check its status before trying again."
  );
}

export default function WalletSendDialog({
  initialToken,
  onClose,
}: {
  initialToken?: string;
  onClose: () => void;
}) {
  const {
    walletAddress,
    walletAdapter,
    walletLocked,
    unlockInternalWallet,
    walletBalances,
    network,
    activeInternalWalletId,
    refreshActiveInternalWallet,
  } = useWallet();
  const [token, setToken] = useState(
    tokens.find((t) => t.tokenId.toLowerCase() === initialToken?.toLowerCase())
      ?.tokenId ?? PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId,
  );
  const [recipient, setRecipient] = useState("");
  const [scanning, setScanning] = useState(false);
  const [amount, setAmount] = useState("");
  const [feeToken, setFeeToken] = useState(() => {
    const defaultFee = PICOMART_TEMPO_CONFIG.feeToken.tokenId;
    const balance = walletBalances.find(
      (b) => b.tokenId.toLowerCase() === defaultFee.toLowerCase(),
    );
    return balance && balance.raw === 0n ? token : defaultFee;
  });
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"details" | "review" | "result">("details");
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [record, setRecord] = useState<TransferRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(
    "Checking transaction status…",
  );
  const [error, setError] = useState<string | null>(null);
  const actionRef = useRef(false);
  const operationId = useRef(crypto.randomUUID());
  const service = walletAdapter?.tempo;
  const identity = `${activeInternalWalletId}:${walletAddress}:${network}`;
  const originalIdentity = useRef(identity);
  const changed = identity !== originalIdentity.current;
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  const abort = useRef(new AbortController());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    if (!walletAddress || !service) {
      setBusy(null);
      return;
    }
    void service
      .recoverTransfer(walletAddress)
      .then((saved) => {
        if (cancelled) return;
        if (saved?.state === "uncertain") {
          setRecord(saved);
          setStep("result");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [service, walletAddress]);
  useEffect(() => {
    mounted.current = true;
    abort.current = new AbortController();
    return () => {
      mounted.current = false;
      abort.current.abort();
    };
  }, []);
  useEffect(() => {
    if (changed) {
      abort.current.abort();
      setQuote(null);
      setPassword("");
      setScanning(false);
    }
  }, [changed]);
  useEffect(() => {
    if (walletLocked) {
      setQuote(null);
      setScanning(false);
    }
  }, [walletLocked]);

  const asset = tokens.find((t) => t.tokenId === token)!;
  const feeAsset = tokens.find((t) => t.tokenId === feeToken)!;
  const balance = walletBalances.find(
    (b) => b.tokenId.toLowerCase() === token.toLowerCase(),
  );
  const resultAsset = tokens.find(
    (t) => t.tokenId.toLowerCase() === record?.transfer?.token.toLowerCase(),
  );
  const guarded = () => {
    if (
      latestIdentity.current !== originalIdentity.current ||
      abort.current.signal.aborted
    )
      throw new Error(
        "The selected account changed. Close this dialog and start again.",
      );
  };
  const run = async (label: string, work: () => Promise<void>) => {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusy(label);
    setError(null);
    try {
      guarded();
      await work();
    } catch (e) {
      if (mounted.current) {
        setError(message(e));
        setQuote(null);
      }
    } finally {
      actionRef.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const prepare = (selectedFee = feeToken) =>
    run("Estimating network fee…", async () => {
      if (!service || !walletAddress)
        throw new Error("Select an account first.");
      if (walletLocked) throw new Error("Unlock the account first.");
      if (!isAddress(recipient.trim()) || /^0x0{40}$/i.test(recipient.trim()))
        throw new Error("Enter a valid Tempo address.");
      transferAmount(amount, asset.decimals);
      setScanning(false);
      setStep("review");
      setQuote(null);
      const preview = await service.estimateTransfer(
        { token, recipient: recipient.trim(), amount, feeToken: selectedFee },
        walletAddress,
      );
      guarded();
      setQuote(preview);
      setStep("review");
    });
  const submit = () =>
    run("Sending transfer…", async () => {
      if (!service || !walletAddress || !quote)
        throw new Error("Review the transfer first.");
      const result = await service.transferToken(quote, {
        expectedAccount: walletAddress,
        operationId: operationId.current,
        signal: abort.current.signal,
        beforeSign: async () => {
          guarded();
        },
        onSaved: (saved) => {
          if (mounted.current) {
            setRecord(saved as TransferRecord);
            setStep("result");
          }
        },
      });
      guarded();
      setRecord(result);
      setStep("result");
      setQuote(null);
      if (result.state === "confirmed") {
        try {
          await refreshActiveInternalWallet();
        } catch {
          /* The successful receipt remains visible even if balances cannot refresh. */
        }
      }
    });
  const recover = () =>
    run("Checking transaction status…", async () => {
      if (!service || !walletAddress) return;
      const saved = await service.recoverTransfer(walletAddress);
      guarded();
      setRecord(saved);
      if (saved?.state === "confirmed") {
        try {
          await refreshActiveInternalWallet();
        } catch {
          /* Keep receipt visible. */
        }
      }
    });

  return (
    <WalletActionDialog
      title={
        step === "details"
          ? "Send"
          : step === "review"
            ? "Review transfer"
            : record?.state === "confirmed"
              ? "Transfer complete"
              : record?.state === "reverted"
                ? "Transfer failed"
                : "Transfer pending"
      }
      description={
        step === "details"
          ? "Send tokens to another account on this network."
          : ""
      }
      busy={busy !== null}
      error={
        changed
          ? "The selected account changed. Close this dialog and start again."
          : error
      }
      status={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="text-xs font-medium text-muted-foreground">
        Tempo · {tempoNetworkLabel(network)}
      </p>
      {changed ? (
        <Button className="w-full" onClick={onClose}>
          <X /> Close
        </Button>
      ) : step === "result" ? (
        <div className="space-y-4">
          <div
            className={`flex items-center gap-2 text-sm font-medium ${record?.state === "confirmed" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
          >
            {record?.state === "confirmed" ? <Check /> : <RefreshCcw />}
            {record?.state === "confirmed"
              ? "Your transfer is confirmed."
              : record?.state === "reverted"
                ? "The transfer did not complete. A network fee may have been charged."
                : "Waiting for the network to confirm this transaction. Check its status before sending again."}
          </div>
          {record?.transfer && resultAsset && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Amount</dt>
                <dd className="font-semibold">
                  {formatUnits(
                    BigInt(record.transfer.amount),
                    resultAsset.decimals,
                  )}{" "}
                  {resultAsset.symbol}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">To</dt>
                <dd className="break-all font-mono text-xs">
                  {record.transfer.recipient}
                </dd>
              </div>
            </dl>
          )}
          {record?.hash && (
            <Button
              asChild
              variant="outline"
              className={`w-full ${outlineClass}`}
            >
              <a
                href={`${PICOMART_TEMPO_CONFIG.explorerUrl}/tx/${record.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink /> View Network Activity
              </a>
            </Button>
          )}
          {record?.state === "uncertain" && (
            <Button className="w-full" onClick={() => void recover()}>
              <RefreshCcw /> Check status
            </Button>
          )}
          <Button
            variant="outline"
            className={`w-full ${outlineClass}`}
            onClick={onClose}
          >
            <X /> Close
          </Button>
        </div>
      ) : walletLocked ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run("Unlocking account…", async () => {
              await unlockInternalWallet(password);
              guarded();
              setPassword("");
            });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Unlock your account to prepare the transfer.
          </p>
          <label className="block space-y-2">
            <span className="text-sm">Password</span>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button type="submit" className="w-full" disabled={!password}>
            <LockKeyhole /> Unlock Account
          </Button>
        </form>
      ) : step === "details" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void prepare();
          }}
        >
          <WalletTokenSelect
            label="Token"
            value={token}
            onChange={(selected) => {
              setToken(selected);
              setQuote(null);
            }}
          />
          <div className="space-y-2">
            <label htmlFor="send-recipient" className="text-sm font-medium">
              Recipient address
            </label>
            <div className="flex gap-2">
              <Input
                id="send-recipient"
                aria-label="Recipient address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Paste address or scan QR"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="h-12 min-w-0 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0"
                aria-label={
                  scanning ? "Stop scanning" : "Scan recipient QR code"
                }
                onClick={() => setScanning(!scanning)}
              >
                <ScanLine />
              </Button>
            </div>
          </div>
          {scanning && (
            <WalletAddressScanner
              onAddress={(address) => {
                setRecipient(address);
                setError(null);
              }}
              onClose={() => setScanning(false)}
            />
          )}
          <label className="block space-y-2">
            <span className="text-sm">Amount</span>
            <Input
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="h-16 bg-muted/30 px-4 text-2xl font-semibold tabular-nums md:text-2xl"
              required
              autoComplete="off"
            />
            <span className="block text-xs text-muted-foreground">
              Available: {balance?.formatted ?? "—"} {asset.symbol}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" disabled={!service || !amount || !recipient}>
              <Send /> Review transfer
            </Button>
            <Button
              type="button"
              variant="outline"
              className={outlineClass}
              onClick={onClose}
            >
              <X /> Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-muted/40 px-3 py-4">
            <TokenIcon assetId={token} size={32} />
            <p className="text-xl font-semibold tabular-nums break-all">
              {amount} {asset.symbol}
            </p>
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">From</dt>
              <dd className="break-all font-mono text-xs">{walletAddress}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">To</dt>
              <dd className="break-all font-mono text-xs">{recipient}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <WalletTokenSelect
              label="Pay network fee with"
              value={feeToken}
              onChange={(selected) => {
                setFeeToken(selected);
                setQuote(null);
                void prepare(selected);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Applies only to this transfer.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Maximum network fee:{" "}
            <span className="font-medium text-foreground">
              {quote
                ? formatUnits(BigInt(quote.maximumFee), feeAsset.decimals)
                : "—"}{" "}
              {feeAsset.symbol}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Check the full address before confirming. Completed transfers cannot
            be reversed by Picomart.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => void submit()}
              disabled={!quote || busy !== null}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Send />}{" "}
              Confirm send
            </Button>
            <Button
              variant="outline"
              className={outlineClass}
              onClick={() => {
                setStep("details");
                setQuote(null);
                setError(null);
              }}
            >
              <ArrowLeft /> Edit
            </Button>
          </div>
          {!quote && !busy && (
            <Button
              variant="outline"
              className={`w-full ${outlineClass}`}
              onClick={() => void prepare()}
            >
              <RefreshCcw /> Update estimate
            </Button>
          )}
        </div>
      )}
    </WalletActionDialog>
  );
}
