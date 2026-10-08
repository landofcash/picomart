import { getCurrency, PICOMART_TEMPO_CONFIG } from "@picomart/config";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { formatUnits } from "ethers";
import { Wallet, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useTempoCheckoutDetails } from "@/context/TempoCheckoutDetails";
import { Button } from "@/components/ui/button";

import TempoMarketShell from "@/components/TempoMarketShell";
import TempoPrivateMessage from "@/components/TempoPrivateMessage";
import type { TempoMessagePayload } from "@picomart/order-protocol/tempo-protocol";

import CatalogIdentity from "@/components/CatalogIdentity";
import CopyableField from "@/components/CopyableField";
import TempoPaymentCosts, { paymentQuoteInsufficient } from "@/components/TempoPaymentCosts";
import {
  DeliveryInfoForm,
  type DeliveryInfo,
} from "@/components/DeliveryInfoForm";
import { tempoSelectionKey, removePaidSelection } from "@/lib/tempoCart";
import {
  TEMPO_MARKET_ENABLED,
  validateCheckoutDraft,
  validateSelection,
  selectionHash,
  checkoutIntent,
  loadCheckout,
  commerceService,
  prepareCheckout,
  previewPreparedMessage,
  checkoutCall,
  submitCheckout,
  submitBuiltinCheckout,
  marketTransactions,
  type CheckoutSelection,
  type CheckoutDraft,
} from "@/lib/tempoMarket";
import {
  tempoWalletRevision,
  assertTempoWalletRevision,
} from "@/lib/internalWallet/providers/tempoInternalWalletProvider";
import {
  tempoTransactionError,
  type TempoTransactionRecord,
} from "@/lib/internalWallet/tempoTransactions";

const blank: DeliveryInfo = {
  fullName: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
  phone: "",
  email: "",
  deliveryComments: "",
  noPhysicalDelivery: false,
};
export default function TempoCheckoutPage({
  stage = "review",
}: {
  stage?: "review" | "payment";
}) {
  const navigate = useNavigate(),
    wallet = useWallet(),
    { details, saveDetails } = useTempoCheckoutDetails();
  const [selection] = useState<CheckoutSelection | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(tempoSelectionKey) ?? "null");
    } catch {
      return null;
    }
  });
  let amount = 0n,
    invalid = "",
    key = "";
  try {
    if (selection) {
      amount = validateSelection(selection).amount;
      key = selectionHash(selection);
    }
  } catch (e) {
    invalid = tempoTransactionError(e);
  }
  const currency = getCurrency(
    !invalid && selection
      ? selection.products[0].PriceToken
      : PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId,
  );
  const delivery = details?.key === key ? details.delivery : blank;
  const [id, setId] = useState(""),
    [draft, setDraft] = useState<CheckoutDraft | null>(null),
    [preview, setPreview] = useState<TempoMessagePayload | null>(null),
    [ready, setReady] = useState(false),
    [approvalRequired, setApprovalRequired] = useState(true);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [receipt, setReceipt] = useState<TempoTransactionRecord | null>(null);
  const [cost, setCost] = useState<Awaited<
    ReturnType<typeof marketTransactions.estimatePayment>
  > | null>(null);
  const running = useRef(false),
    controller = useRef<AbortController | null>(null);
  function accept(tx: TempoTransactionRecord | null) {
    setReceipt(tx);
    if (
      tx?.state === "confirmed" &&
      tx.method === "createOrderPaid" &&
      selection
    ) {
      removePaidSelection(selection, tx.hash);
      setProgress("Payment successful!");
    } else if (tx?.state === "uncertain")
      throw new Error(
        "Your transaction is still being confirmed. Check payment status to check the same transaction.",
      );
    else if (tx?.state === "reverted")
      throw new Error(
        "The transaction was not successful. No new payment has been submitted.",
      );
  }
  useEffect(() => {
    let live = true;
    setCost(null);
    setId("");
    setDraft(null);
    setReady(false);
    setPreview(null);
    setReceipt(null);
    setError("");
    setProgress("");
    setLoading(Boolean(selection && wallet.walletAddress && !invalid));
    if (selection && wallet.walletAddress && !invalid)
      void (async () => {
        const next = await checkoutIntent(selection, wallet.walletAddress!);
        const saved = await loadCheckout(wallet.walletAddress!, next);
        if (saved) {
          validateCheckoutDraft(saved, selection);
          if (saved.method !== "createOrderPaid")
            throw new Error(
              "This saved order uses a different payment flow. Inspect it in contract diagnostics.",
            );
        }
        const tx = saved
          ? await marketTransactions.recoverOperation(
              wallet.walletAddress!,
              saved.operationId,
            )
          : null;
        if (live) {
          setId(next);
          setDraft(saved ?? null);
          accept(tx);
        }
      })()
        .catch((e) => {
          if (live) setError(tempoTransactionError(e));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    return () => {
      live = false;
      controller.current?.abort();
    };
    // The selected wallet and immutable cart snapshot define the payment operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wallet.walletAddress, wallet.walletLocked]);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      await action();
    } catch (e) {
      setError(tempoTransactionError(e));
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  async function prepare() {
    const revision = tempoWalletRevision();
    const hasMessage =
      draft &&
      (await commerceService().hasPreparedOperation(draft.order, {
        messageType: "buyer-order",
        sequence: 1,
      }));
    if (draft && !hasMessage && !valid)
      throw new Error(
        "Complete delivery information before signing this order.",
      );
    const d = hasMessage
      ? draft!
      : await prepareCheckout(
          wallet.walletAdapter!,
          selection!,
          delivery as unknown as Record<string, unknown>,
          id,
          "createOrderPaid",
        );
    assertTempoWalletRevision(revision);
    setDraft(d);
    const decoded = await previewPreparedMessage(
      wallet.walletAdapter!,
      d.order,
      "buyer-order",
      controller.current?.signal,
    );
    const requirements = await marketTransactions.estimatePayment(
      await checkoutCall(wallet.walletAdapter!, d, controller.current?.signal),
    );
    assertTempoWalletRevision(revision);
    setCost(requirements);
    setApprovalRequired(requirements.approvalRequired);
    setPreview(decoded);
    setReady(true);
    setProgress(
      wallet.walletKind === "internal"
        ? "Your order is ready. Review the amount and fee limit before paying."
        : requirements.approvalRequired
        ? "Your order is prepared. Review the amount before authorizing payment."
        : "Your order is ready. Review the amount before completing payment.",
    );
  }
  async function pay() {
    const revision = tempoWalletRevision();
    const tx = await marketTransactions.recoverOperation(
      wallet.walletAddress!,
      draft!.operationId,
    );
    assertTempoWalletRevision(revision);
    if (tx && tx.state !== "not-submitted") {
      accept(tx);
      return;
    }
    const requirements = await marketTransactions.paymentRequirements(
      await checkoutCall(wallet.walletAdapter!, draft!, controller.current?.signal),
    );
    assertTempoWalletRevision(revision);
    if (wallet.walletKind === "internal") {
      if (!cost) throw new Error("Prepare and review payment costs first.");
      setProgress("Processing payment...");
      try {
        const payment = await submitBuiltinCheckout(wallet.walletAdapter!, draft!, selection!, cost, controller.current?.signal, undefined, (tx) => { if (!controller.current?.signal.aborted) setReceipt(tx); });
        assertTempoWalletRevision(revision);
        accept(payment);
      } catch (error) {
        if (!controller.current?.signal.aborted) {
          try { await prepare(); } catch { setReady(false); }
        }
        throw error;
      }
      return;
    }
    if (requirements.approvalRequired !== approvalRequired) {
      const refreshed = await marketTransactions.estimatePayment(
        await checkoutCall(wallet.walletAdapter!, draft!, controller.current?.signal),
      );
      assertTempoWalletRevision(revision);
      setCost(refreshed);
      setApprovalRequired(refreshed.approvalRequired);
      setProgress("Payment authorization changed. Review the updated next step.");
      return;
    }
    if (requirements.approvalRequired) {
      const approval = await submitCheckout(
        wallet.walletAdapter!,
        draft!,
        selection!,
        true,
        controller.current?.signal,
        undefined,
        cost?.approvalMaximumFee,
      );
      assertTempoWalletRevision(revision);
      accept(approval);
      const nextCost = await marketTransactions.estimatePayment(
        await checkoutCall(wallet.walletAdapter!, draft!, controller.current?.signal),
      );
      assertTempoWalletRevision(revision);
      setCost(nextCost);
      setApprovalRequired(nextCost.approvalRequired);
      setProgress(
        "Payment authorized. Your order will be placed when you complete payment.",
      );
    } else {
      const payment = await submitCheckout(
        wallet.walletAdapter!,
        draft!,
        selection!,
        false,
        controller.current?.signal,
        undefined,
        cost?.paymentMaximumFee,
      );
      assertTempoWalletRevision(revision);
      accept(payment);
    }
  }
  const valid =
    delivery.noPhysicalDelivery ||
    ((
      [
        "fullName",
        "address",
        "city",
        "postalCode",
        "country",
        "phone",
        "email",
      ] as const
    ).every((field) => delivery[field].trim()) &&
      /\S+@\S+\.\S+/.test(delivery.email));
  const usable =
    TEMPO_MARKET_ENABLED &&
    wallet.walletAdapter &&
    !wallet.walletLocked &&
    id &&
    !loading;
  const success =
    receipt?.state === "confirmed" && receipt.method === "createOrderPaid";
  if (!selection) return <Navigate to="/cart" replace />;
  if (invalid)
    return (
      <TempoMarketShell title="Order">
        <p role="alert">{invalid}</p>
        <Link to="/cart">Back to Cart</Link>
      </TempoMarketShell>
    );
  const totalLabel = `${formatUnits(amount, currency.decimals)} ${currency.symbol}`;
  const pending = receipt?.state === "uncertain";
  const insufficient =
    cost !== null && paymentQuoteInsufficient(cost);
  async function checkStatus() {
    if (!draft) return;
    const revision = tempoWalletRevision();
    const payment = await marketTransactions.recoverOperation(
      wallet.walletAddress!,
      draft.operationId,
    );
    assertTempoWalletRevision(revision);
    if (payment && payment.state !== "not-submitted") {
      accept(payment);
      return;
    }
    const approval = await marketTransactions.recoverOperation(
      wallet.walletAddress!,
      draft.operationId + ":approval",
    );
    assertTempoWalletRevision(revision);
    if (approval && approval.state !== "not-submitted") accept(approval);
    await prepare();
  }
  return (
    <TempoMarketShell title={stage === "review" ? "Checkout" : "Payment"}>
      <section className="space-y-4" aria-label="Order summary">
        <h2 className="text-lg font-semibold">Order summary</h2>
        {selection.products.map((p) => (
          <div
            className="flex justify-between items-start text-sm gap-4"
            key={p.ProductId}
          >
            <span className="font-medium">
              {p.Name}
              <span className="text-muted-foreground ml-2">
                &times; {p.quantity}
              </span>
            </span>
            <span className="shrink-0">
              {formatUnits(
                BigInt(p.Price) * BigInt(p.quantity),
                getCurrency(p.PriceToken).decimals,
              )}{" "}
              {getCurrency(p.PriceToken).symbol}
            </span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-4 text-lg font-bold">
          <span>Order total</span>
          <span>{totalLabel}</span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer py-2 text-muted-foreground">
            Payment details
          </summary>
          <div className="space-y-3 pt-2">
            <p>Shop reference</p>
            <CatalogIdentity seed={selection.catalog.seed} />
            <p>Shop payment address</p>
            <CopyableField
              value={selection.catalog.seller}
              length={20}
              mdLength={24}
            />
          </div>
        </details>
      </section>
      {stage === "review" ? (
        <>
          <div className="border-t pt-6">
            <DeliveryInfoForm
              deliveryInfo={delivery}
              onDeliveryInfoChange={(value) =>
                saveDetails({ key, delivery: value })
              }
            />
          </div>
          <section className="border-t pt-6 space-y-3">
            <h2 className="text-lg font-semibold">Payment</h2>
            <p className="text-sm text-muted-foreground">
              Pay from your Picomart wallet using PathUSD, a digital payment
              currency. A small network fee also applies.
            </p>
            <Button
              className="w-full"
              size="lg"
              disabled={!valid}
              onClick={() => navigate("/pay-crypto")}
            >
              Continue to payment
            </Button>
            {!valid && (
              <p className="text-sm text-muted-foreground">
                Complete the required delivery fields to continue.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          {!success && (
            <ol className="flex gap-2 text-xs" aria-label="Payment progress">
              {(wallet.walletKind === "internal" ? ["Preparing order", "Processing payment", "Order placed"] : ["Prepare", "Authorize", "Pay"]).map((step, index) => (
                <li
                  key={step}
                  aria-current={
                    index === (!ready ? 0 : wallet.walletKind === "internal" ? 1 : approvalRequired ? 1 : 2)
                      ? "step"
                      : undefined
                  }
                  className={`flex-1 rounded-lg px-2 py-3 text-center ${index === (!ready ? 0 : wallet.walletKind === "internal" ? 1 : approvalRequired ? 1 : 2) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          )}
          {preview && !success && (
            <details className="border-t pt-4">
              <summary className="cursor-pointer py-2 text-sm">
                Review delivery details
              </summary>
              <div className="pt-3">
                <TempoPrivateMessage message={preview} />
              </div>
            </details>
          )}
          {cost && !success && <TempoPaymentCosts quote={cost} />}
          {insufficient && !success && <Link className="underline text-sm" to="/wallet?returnTo=%2Fpay-crypto">Receive funds</Link>}
          {loading && (
            <p role="status" className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Checking payment status...
            </p>
          )}
          {success ? (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <h2 className="text-xl font-semibold">Your order is placed</h2>
              <p className="text-sm text-muted-foreground">
                Payment confirmed. Follow your order in My Orders.
              </p>
              <Button
                className="w-full"
                size="lg"
                onClick={() =>
                  navigate(
                    draft ? "/orders?order=" + draft.input.orderId : "/orders",
                  )
                }
              >
                View my order
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {!wallet.walletAddress || wallet.walletLocked ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {wallet.walletLocked
                      ? "Unlock your wallet to continue with payment."
                      : "Set up a payment wallet to place your order. Your delivery details stay here while you do."}
                  </p>
                  <Button className="w-full" size="lg" asChild>
                    <Link to="/wallet?returnTo=%2Fpay-crypto">
                      <Wallet className="h-5 w-5" />
                      {wallet.walletAddress
                        ? "Unlock wallet"
                        : "Set up payment wallet"}
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  {pending ? (
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={!usable || busy}
                      onClick={() => void run(checkStatus)}
                    >
                      {busy ? "Checking..." : "Check payment status"}
                    </Button>
                  ) : !ready ? (
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={!usable || busy || (!draft && !valid)}
                      onClick={() => void run(prepare)}
                    >
                      {busy ? "Preparing your order..." : "Prepare your order"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={!usable || busy || insufficient}
                      onClick={() => void run(pay)}
                    >
                      {busy
                        ? wallet.walletKind === "internal"
                          ? "Processing payment..."
                          : approvalRequired
                          ? "Authorizing payment..."
                          : "Confirming payment..."
                        : wallet.walletKind === "internal"
                          ? `Pay ${totalLabel}`
                          : approvalRequired
                          ? "Authorize payment"
                          : `Pay ${totalLabel}`}
                    </Button>
                  )}
                  {!ready && !draft && !valid && (
                    <Link className="block underline text-sm" to="/order">
                      Complete delivery information
                    </Link>
                  )}
                  {ready && approvalRequired && wallet.walletKind !== "internal" && (
                    <p className="text-sm text-muted-foreground">
                      Authorize the exact order amount first. This step does not
                      place your order or pay the shop.
                    </p>
                  )}
                  {!TEMPO_MARKET_ENABLED && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Payments are currently unavailable.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {!success && progress && (
            <p role="status" className="text-sm">
              {progress}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {!success && (
            <Link to="/order" className="block">
              <Button variant="ghost" className="w-full" disabled={busy}>
                <ArrowLeft className="h-4 w-4" />
                Back to checkout
              </Button>
            </Link>
          )}
        </>
      )}
    </TempoMarketShell>
  );
}
