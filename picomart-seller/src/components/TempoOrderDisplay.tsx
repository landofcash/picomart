import { useEffect, useRef, useState } from "react";
import TokenAmount from "./TokenAmount";
import {
  Eye,
  Unlock,
  Package,
  Truck,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import CopyableField from "@/components/CopyableField";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import TempoOrderExports from "@/components/TempoOrderExports";
import TempoPrivateMessage from "@/components/TempoPrivateMessage";
import TempoActionDialog from "@/components/TempoActionDialog";
import { useTransactionReview } from "@/components/TransactionReview";
import CommerceError from "@/components/CommerceError";
import AccountUnlockButton from "@/components/wallet/AccountUnlockButton";
import {
  TEMPO_MARKET_ENABLED,
  marketTransactions,
  marketInterface,
  statusNames,
  decryptOrderMessage,
  verifyOrderTerms,
  prepareOrResumeSellerMessage,
  resumeSellerMessage,
  previewPreparedMessage,
  type MarketOrder,
} from "@/lib/tempoMarket";
import {
  tempoWalletRevision,
  assertTempoWalletRevision,
} from "@/lib/internalWallet/providers/tempoInternalWalletProvider";
import {
  tempoTransactionError,
  type TempoContractCall,
} from "@/lib/internalWallet/tempoTransactions";
import type { TempoMessagePayload } from "@picomart/order-protocol/tempo-protocol";

type Action =
  | "cancelOrder"
  | "confirmOrder"
  | "requireRefund"
  | "seller-delivery"
  | "seller-refusal";
export default function TempoOrderDisplay({
  order,
  seller = false,
  onUpdated,
}: {
  order: MarketOrder;
  seller?: boolean;
  onUpdated: () => void;
}) {
  const wallet = useWallet(),
    account = wallet.walletAddress?.toLowerCase();
  const [visible, setVisible] = useState(false),
    [messages, setMessages] = useState<TempoMessagePayload[]>([]),
    [technical, setTechnical] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [action, setAction] = useState<Action | null>(null),
    [tracking, setTracking] = useState(""),
    [comment, setComment] = useState(""),
    [call, setCall] = useState<TempoContractCall | null>(null),
    [preview, setPreview] = useState<TempoMessagePayload | null>(null),
    [submitted, setSubmitted] = useState(false);
  const title =
    action === "seller-delivery"
      ? "Mark as dispatched"
      : action === "seller-refusal"
        ? "Cancel and refund"
        : action === "cancelOrder"
          ? "Cancel order"
          : action === "requireRefund"
            ? "Request refund"
            : "Confirm receipt";
  const consequence =
    action === "seller-delivery"
      ? "Share these delivery details with the customer and mark this order as dispatched. Payment remains held until the customer confirms receipt or the confirmation deadline is settled."
      : action === "seller-refusal"
        ? "Cancel this paid order and return the held payment to the original payer. This cannot be undone."
        : action === "cancelOrder"
          ? "Cancel this order. Any held payment is returned to the original payer."
          : action === "requireRefund"
            ? "Request a refund decision. This does not issue an immediate refund."
            : "Confirm that the order was received and release the held payment to the seller. This cannot be undone.";
  const review = useTransactionReview({
    title,
    description: consequence,
    approveLabel: title,
    children: (
      <div className="space-y-3">
        <p className="text-sm">
          Order total: <TokenAmount token={order.priceToken} amount={order.priceAmount} />
        </p>
        {preview && <TempoPrivateMessage message={preview} />}
      </div>
    ),
  });
  const running = useRef(false),
    controller = useRef<AbortController | null>(null);
  const usable =
    TEMPO_MARKET_ENABLED && wallet.walletAdapter && !wallet.walletLocked;
  useEffect(() => {
    setMessages([]);
    setVisible(false);
    setSubmitted(false);
    setAction(null);
    setCall(null);
    setPreview(null);
    setTracking("");
    setComment("");
    setError("");
    setSuccess("");
    return () => controller.current?.abort();
  }, [account, order.orderId, wallet.walletLocked]);
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      await work();
    } catch (e) {
      setError(tempoTransactionError(e));
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  async function decrypt() {
    if (visible) {
      setVisible(false);
      setMessages([]);
      return;
    }
    const revision = tempoWalletRevision();
    const decoded = await Promise.all(
      order.messages.map((m) =>
        decryptOrderMessage(
          wallet.walletAdapter!,
          order,
          m,
          seller ? "seller" : "buyer",
        ),
      ),
    );
    assertTempoWalletRevision(revision);
    if (controller.current?.signal.aborted) return;
    setMessages(decoded);
    setVisible(true);
  }
  function open(next: Action) {
    setSubmitted(false);
    setAction(next);
    setCall(null);
    setPreview(null);
    setTracking("");
    setComment("");
    setError("");
  }
  async function prepare() {
    if (action !== "seller-delivery" && action !== "seller-refusal") return;
    const revision = tempoWalletRevision();
    const prepared = await prepareOrResumeSellerMessage(
      wallet.walletAdapter!,
      order,
      action,
      action === "seller-delivery"
        ? { shipmentCode: tracking, customInfo: comment }
        : { customInfo: comment },
      controller.current?.signal,
    );
    const decoded = await previewPreparedMessage(
      wallet.walletAdapter!,
      order.context,
      action,
      controller.current?.signal,
    );
    assertTempoWalletRevision(revision);
    if (controller.current?.signal.aborted) return;
    setCall(prepared);
    setPreview(decoded);
  }
  async function submit(next: Action | null = action) {
    if (!next || !account) return;
    const revision = tempoWalletRevision();
    const sellerAction =
      next === "seller-delivery" || next === "seller-refusal";
    if (sellerAction && (!call || !preview))
      throw new Error("Review the delivery details first.");
    const prepared = sellerAction
      ? call!
      : { method: next, args: [order.orderId] };
    const tx = await marketTransactions.sendContract(prepared, {
      operationId: order.orderId + ":" + prepared.method,
      expectedAccount: account,
      signal: controller.current?.signal,
      reviewFee: review.reviewFee,
      onSaved: (tx) => setSubmitted(tx.state !== "not-submitted"),
      beforeSign: async () => {
        await verifyOrderTerms(order);
        if (sellerAction) {
          const verified = await resumeSellerMessage(
            wallet.walletAdapter!,
            order,
            next as "seller-delivery" | "seller-refusal",
            controller.current?.signal,
          );
          if (
            marketInterface.encodeFunctionData(
              prepared.method,
              prepared.args,
            ) !==
            marketInterface.encodeFunctionData(verified.method, verified.args)
          )
            throw new Error("Private message changed.");
        }
      },
    });
    assertTempoWalletRevision(revision);
    if (controller.current?.signal.aborted) return;
    if (tx.state !== "confirmed")
      throw new Error(
        "Order update " +
          tx.state +
          ". Check action status to recover the same operation.",
      );
    setAction(null);
    setCall(null);
    setPreview(null);
    setSuccess("Order updated successfully.");
    onUpdated();
  }
  const sellerAction =
    action === "seller-delivery" || action === "seller-refusal";

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">
            {seller ? "Order Details" : "Order"}
          </h2>
        </div>
        <OrderStatusBadge
          status={String(order.status)}
          label={statusNames[order.status]}
        />
      </div>
      <div className="space-y-3">
        {[
          ["Order ID", order.seed ?? order.orderId],
          [seller ? "Buyer" : "Seller", seller ? order.buyer : order.seller],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <CopyableField value={value} length={24} mdLength={32} />
          </div>
        ))}
      </div>
      <p className="font-semibold">
        Total: <TokenAmount token={order.priceToken} amount={order.priceAmount} />
      </p>
      {success && (
        <p
          role="status"
          className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800"
        >
          {success}
        </p>
      )}
      {!action && <CommerceError error={error} />}
      <div className="space-y-3 border-t pt-4">
        {wallet.walletLocked && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Unlock your account to view private details and approve order
              actions.
            </p>
            <AccountUnlockButton />
          </div>
        )}
        {!order.deleted && account === order.buyer && (
          <>
            {order.status === 3 && (
              <>
                <Button
                  className="w-full"
                  disabled={!usable || busy}
                  onClick={() => {
                    open("confirmOrder");
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Receipt
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!usable || busy}
                  onClick={() => {
                    open("requireRefund");
                  }}
                >
                  Request Refund
                </Button>
              </>
            )}
            {[1, 2].includes(order.status) && (
              <Button
                className="w-full"
                variant="outline"
                disabled={!usable || busy}
                onClick={() => open("cancelOrder")}
              >
                Cancel Order
              </Button>
            )}
          </>
        )}
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          disabled={
            busy ||
            wallet.walletLocked ||
            !wallet.walletAdapter ||
            ![order.buyer, order.seller].includes(account ?? "")
          }
          onClick={() => void run(decrypt)}
        >
          {visible ? (
            <Eye className="mr-2 h-4 w-4" />
          ) : (
            <Unlock className="mr-2 h-4 w-4" />
          )}
          {busy && !action
            ? "Opening details..."
            : visible
              ? "Hide order details"
              : "View order details"}
        </Button>
        {visible && (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.binding.messageType} className="space-y-4">
                {seller && (
                  <TempoOrderExports
                    orderId={order.seed ?? order.orderId}
                    message={m}
                  />
                )}
                <TempoPrivateMessage message={m} />
              </div>
            ))}
            {!messages.length && <p>No private message is available yet.</p>}
          </div>
        )}
        {seller &&
          !order.deleted &&
          order.status === 2 &&
          account === order.seller && (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!usable || busy}
                className="bg-green-700 text-white hover:bg-green-800"
                onClick={() => open("seller-delivery")}
              >
                <Truck className="mr-2 h-4 w-4" />
                Mark as dispatched
              </Button>
              <Button
                variant="destructive"
                disabled={!usable || busy}
                onClick={() => open("seller-refusal")}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel and refund
              </Button>
            </div>
          )}
        {seller && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTechnical((v) => !v)}
            >
              {technical ? "Hide" : "Show"} Technical Details
            </Button>
            {technical && (
              <div className="text-xs space-y-2 break-all">
                <p>Contract order ID: {order.orderId}</p>
                <p>Payer: {order.payer}</p>
                {!!order.deadline && (
                  <p>
                    Stage deadline:{" "}
                    {new Date(order.deadline * 1000).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {!sellerAction && action && (
        <div className="space-y-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-muted-foreground">{consequence}</p>
          <Button
            variant="destructive"
            className="w-full"
            disabled={!usable || busy}
            onClick={() => void run(() => submit())}
          >
            {submitted ? "Check action status" : "Review fee and confirm"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => setAction(null)}
          >
            Back
          </Button>
          <CommerceError error={error} />
        </div>
      )}
      {sellerAction && !review.awaitingApproval && (
        <TempoActionDialog
          title={title}
          busy={busy}
          onClose={() => setAction(null)}
        >
          <p className="text-sm text-muted-foreground">{consequence}</p>
          <>
            {!call ? (
              <div className="space-y-4">
                {action === "seller-delivery" && (
                  <label className="block">
                    Tracking number
                    <input
                      disabled={busy}
                      className="block w-full border rounded p-2 bg-background"
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                    />
                  </label>
                )}
                <label className="block">
                  {action === "seller-delivery"
                    ? "Delivery notes"
                    : "Reason for cancellation"}
                  <textarea
                    disabled={busy}
                    className="block w-full border rounded p-2 bg-background"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <Button
                  disabled={!usable || busy}
                  onClick={() => void run(prepare)}
                >
                  {busy
                    ? "Preparing details..."
                    : error
                      ? "Resume delivery preparation"
                      : "Review delivery details"}
                </Button>
              </div>
            ) : (
              <>
                <TempoPrivateMessage message={preview!} />
                <p className="text-sm">
                  Check these delivery details. Preparing them does not dispatch
                  the order or move funds. Your next step shows the fee and asks
                  for final approval.
                </p>
                <Button
                  variant={
                    action === "seller-refusal" ? "destructive" : "default"
                  }
                  disabled={!usable || busy}
                  onClick={() => void run(() => submit())}
                >
                  {busy
                    ? "Checking action..."
                    : submitted
                      ? "Check action status"
                      : "Review fee and confirm"}
                </Button>
              </>
            )}
          </>
          <CommerceError error={error} />
        </TempoActionDialog>
      )}
      {review.dialog}
    </section>
  );
}
