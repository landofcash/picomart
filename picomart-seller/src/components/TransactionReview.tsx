import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatUnits } from "ethers";
import { useWallet } from "@/context/WalletContext";
import type { TempoFeeReview } from "@/lib/internalWallet/tempoTransactions";
import TempoActionDialog from "./TempoActionDialog";
import { Button } from "./ui/button";

/** A per-operation approval. Cancel/unmount/account changes reject it without signing. */
export function useTransactionReview({
  title,
  description,
  approveLabel,
  children,
}: {
  title: string;
  description: string;
  approveLabel: string;
  children?: ReactNode;
}) {
  const wallet = useWallet();
  const [quote, setQuote] = useState<TempoFeeReview | null>(null);
  const pending = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  } | null>(null);
  const finish = useCallback((approved: boolean) => {
    const request = pending.current;
    pending.current = null;
    setQuote(null);
    request?.cleanup();
    if (approved) request?.resolve();
    else
      request?.reject(
        new Error("Approval canceled. No transaction was submitted."),
      );
  }, []);
  useEffect(
    () => () => finish(false),
    [wallet.walletAddress, wallet.network, wallet.walletLocked, finish],
  );
  const reviewFee = useCallback(
    (fee: TempoFeeReview, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (
          signal?.aborted ||
          wallet.walletLocked ||
          fee.account !== wallet.walletAddress?.toLowerCase()
        ) {
          reject(
            new Error("Account changed or locked. Review this action again."),
          );
          return;
        }
        if (pending.current) {
          reject(new Error("Another approval is already open."));
          return;
        }
        const abort = () => finish(false);
        pending.current = {
          resolve,
          reject,
          cleanup: () => signal?.removeEventListener("abort", abort),
        };
        signal?.addEventListener("abort", abort, { once: true });
        setQuote(fee);
      }),
    [wallet.walletAddress, wallet.walletLocked, finish],
  );
  const dialog = quote && (
    <TempoActionDialog title={title} busy={false} onClose={() => finish(false)}>
      <p className="text-sm text-muted-foreground">{description}</p>
      {children}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <p className="text-sm">Maximum transaction fee</p>
        <p className="text-lg font-semibold">
          {formatUnits(quote.maximumFeeBaseUnits, 6)} PathUSD
        </p>
        <p className="text-xs text-muted-foreground">
          This is the fee limit for this action. The actual fee may be lower. It
          is paid from your account balance.
        </p>
      </div>
      <details className="text-xs text-muted-foreground break-all">
        <summary className="cursor-pointer">Advanced details</summary>
        <p className="mt-2">Account: {quote.account}</p>
        <p>Action: {quote.method}</p>
        <p>Execution limit: {quote.gasLimit}</p>
      </details>
      <Button className="w-full" onClick={() => finish(true)}>
        {approveLabel}
      </Button>
    </TempoActionDialog>
  );
  return { reviewFee, dialog, awaitingApproval: !!quote };
}
