import { getCurrency } from "@picomart/config";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { Link } from "react-router-dom";
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
  expanded = false,
}: {
  order: MarketOrder;
  seller?: boolean;
  onUpdated: () => void;
  expanded?: boolean;
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
    [preview, setPreview] = useState<TempoMessagePayload | null>(null);
  const running = useRef(false),
    controller = useRef<AbortController | null>(null);
  const usable =
    TEMPO_MARKET_ENABLED && wallet.walletAdapter && !wallet.walletLocked;
  useEffect(() => {
    setMessages([]);
    setVisible(false);
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
      throw new Error("Sign the delivery message first.");
    const prepared = sellerAction
      ? call!
      : { method: next, args: [order.orderId] };
    const tx = await marketTransactions.sendContract(prepared, {
      operationId: order.orderId + ":" + prepared.method,
      expectedAccount: account,
      signal: controller.current?.signal,
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
        "Transaction " + tx.state + ". Try Again checks the same operation.",
      );
    setAction(null);
    setCall(null);
    setPreview(null);
    setSuccess("Order updated successfully.");
    onUpdated();
  }
  const sellerAction =
    action === "seller-delivery" || action === "seller-refusal";
  const title =
    action === "seller-delivery"
      ? "Confirm Delivery"
      : action === "seller-refusal"
        ? "Refuse Delivery"
        : action === "cancelOrder"
          ? "Cancel Order"
          : action === "requireRefund"
            ? "Request Refund"
            : "Confirm Receipt";
  const Container = seller ? "section" : "details";
  const Header = seller ? "div" : "summary";
  const guidance = [
    "",
    "Your order is awaiting payment.",
    "Your payment is confirmed. Waiting for the shop's delivery update.",
    "Check the delivery update. Confirm receipt only after receiving your order.",
    "Your order is complete.",
    "Your refund request is awaiting a response.",
    "Funds were returned to the wallet that paid.",
    "Payment has been released to the shop.",
    "This order was canceled.",
  ][order.status];
  return (
    <Container
      open={seller ? undefined : expanded || undefined}
      className={
        seller
          ? "space-y-4 rounded-lg border bg-card p-4"
          : "group border-b py-5"
      }
    >
      <Header className="list-none cursor-pointer space-y-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">
              {seller
                ? "Order Details"
                : `Order #${order.orderId.slice(-8).toUpperCase()}`}
            </h2>
          </div>
          <OrderStatusBadge
            status={String(order.status)}
            label={
              seller
                ? statusNames[order.status]
                : [
                    "",
                    "Awaiting payment",
                    "Paid",
                    "Delivery in progress",
                    "Completed",
                    "Refund requested",
                    "Refunded",
                    "Payment released",
                    "Canceled",
                  ][order.status]
            }
          />
        </div>
        <p className="font-semibold">
          Total:{" "}
          {formatUnits(
            order.priceAmount,
            getCurrency(order.priceToken).decimals,
          )}{" "}
          {getCurrency(order.priceToken).symbol}
        </p>
        {!seller && <p className="text-sm text-muted-foreground">{guidance}</p>}
        {!seller && (
          <p className="text-xs text-muted-foreground group-open:hidden">
            Tap to view order and available actions
          </p>
        )}
      </Header>
      <div className="space-y-4 pt-4">
        <details className="text-sm">
          <summary className="cursor-pointer py-2 text-muted-foreground">
            Payment reference
          </summary>
          <div className="space-y-3 pt-2">
            {[
              ["Full order reference", order.seed ?? order.orderId],
              [
                seller ? "Buyer payment address" : "Shop payment address",
                seller ? order.buyer : order.seller,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <CopyableField value={value} length={24} mdLength={32} />
              </div>
            ))}
          </div>
        </details>
        {success && (
          <p
            role="status"
            className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          >
            {success}
          </p>
        )}
        {!action && error && (
          <p
            role="alert"
            className="rounded border border-destructive bg-destructive/10 p-3 text-sm"
          >
            {error}
          </p>
        )}
        <div className="space-y-3 border-t pt-4">
          {!order.deleted && account === order.buyer && (
            <>
              {order.status === 3 && (
                <>
                  <Button
                    className="w-full"
                    disabled={!usable || busy}
                    onClick={() => open("confirmOrder")}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm Receipt
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={!usable || busy}
                    onClick={() => open("requireRefund")}
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
              ? "Decrypting..."
              : seller
                ? visible
                  ? "Hide Payload"
                  : "Decrypt Payload"
                : visible
                  ? "Hide Order Details"
                  : "View Order Details"}
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
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => open("seller-delivery")}
                >
                  <Truck className="mr-2 h-4 w-4" />
                  Confirm Delivery
                </Button>
                <Button
                  variant="destructive"
                  disabled={!usable || busy}
                  onClick={() => open("seller-refusal")}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Refuse Delivery
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
        {!seller && wallet.walletLocked && (
          <p className="text-sm text-muted-foreground">
            Unlock your wallet to view private details or update this order.{" "}
            <Link className="underline" to="/wallet?returnTo=%2Forders">
              Unlock wallet
            </Link>
          </p>
        )}
        {action && !sellerAction && (
          <div className="space-y-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm text-muted-foreground">
              {action === "confirmOrder"
                ? "Confirm that you received your order. This releases payment to the shop."
                : action === "requireRefund"
                  ? "Request a refund for this order? A request does not mean the refund has been approved."
                  : "Cancel this order and return eligible funds to the wallet that paid?"}
            </p>
            <Button
              variant={action === "cancelOrder" ? "destructive" : "default"}
              className="w-full"
              disabled={!usable || busy}
              onClick={() => void run(() => submit())}
            >
              {busy ? "Updating order..." : title}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Back
            </Button>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
        {sellerAction && (
          <TempoActionDialog
            title={title}
            busy={busy}
            onClose={() => setAction(null)}
          >
            <>
              {!call ? (
                <div className="space-y-4">
                  {action === "seller-delivery" && (
                    <label className="block">
                      Tracking Number
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
                      ? "Delivery Comments"
                      : "Reason for Refusal"}
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
                      ? "Signing..."
                      : error
                        ? "Try Again"
                        : "Sign Delivery Payload"}
                  </Button>
                </div>
              ) : (
                <>
                  <TempoPrivateMessage message={preview!} />
                  <p className="text-sm">
                    Review the signed message before confirming this action.
                  </p>
                  <Button
                    variant={
                      action === "seller-refusal" ? "destructive" : "default"
                    }
                    disabled={!usable || busy}
                    onClick={() => void run(() => submit())}
                  >
                    {busy ? "Processing..." : error ? "Try Again" : title}
                  </Button>
                </>
              )}
            </>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </TempoActionDialog>
        )}
      </div>
    </Container>
  );
}
