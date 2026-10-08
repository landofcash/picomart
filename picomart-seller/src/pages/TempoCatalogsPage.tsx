import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { hexlify, keccak256, toUtf8Bytes } from "ethers";
import { get, set } from "idb-keyval";
import {
  tempoIdToSeed,
  canonicalJson,
} from "@picomart/order-protocol/tempo-protocol";
import {
  PackageSearch,
  RefreshCw,
  CloudUpload,
  QrCode,
  Trash2,
  Store,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CopyableField from "@/components/CopyableField";
import TokenAmount, { TokenLabel } from "@/components/TokenAmount";
import TempoMarketShell from "@/components/TempoMarketShell";
import TempoActionDialog from "@/components/TempoActionDialog";
import { useTransactionReview } from "@/components/TransactionReview";
import CommerceError from "@/components/CommerceError";
import AccountUnlockButton from "@/components/wallet/AccountUnlockButton";
import CatalogSummary from "@/components/CatalogSummary";
import {
  TEMPO_MARKET_ENABLED,
  marketTransactions,
  catalogs,
  fetchCatalogProducts,
  receivingContext,
  commerceService,
  verifyMarketDeployment,
  type MarketCatalog,
  type MarketProduct,
} from "@/lib/tempoMarket";
import {
  tempoWalletRevision,
  assertTempoWalletRevision,
} from "@/lib/internalWallet/providers/tempoInternalWalletProvider";
import {
  tempoTransactionError,
  type TempoContractCall,
  type TempoTransactionRecord,
} from "@/lib/internalWallet/tempoTransactions";

export default function TempoCatalogsPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const wallet = useWallet(),
    location = useLocation(),
    account = wallet.walletAddress?.toLowerCase();
  const [list, setList] = useState<MarketCatalog[]>([]),
    [url, setUrl] = useState(
      (location.state as { url?: string } | null)?.url ?? "",
    ),
    [products, setProducts] = useState<MarketProduct[] | null>(null);
  const [call, setCall] = useState<TempoContractCall | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [counter, setCounter] = useState(0),
    [receipt, setReceipt] = useState<TempoTransactionRecord | null>(null),
    [progress, setProgress] = useState("");
  const review = useTransactionReview({
    title: embedded ? "Remove catalog" : "Publish catalog",
    approveLabel: embedded ? "Remove catalog" : "Publish catalog",
    description: embedded
      ? "Remove this catalog from Picomart. Its printed QR codes will no longer support new orders. This cannot be undone."
      : "Publish this catalog so customers can order through your storefront or printed QR codes.",
    children: !embedded && (
      <p className="text-sm">
        {products?.length} {products?.length === 1 ? "product" : "products"} ·
        {products?.[0] && <TokenLabel token={products[0].PriceToken} />}
      </p>
    ),
  });
  const running = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setList([]);
    setLoading(Boolean(account));
    setError("");
    if (embedded && account)
      void catalogs(account, c.signal)
        .then((value) => {
          if (!c.signal.aborted) setList(value);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(tempoTransactionError(e));
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    else setLoading(false);
    return () => c.abort();
  }, [account, counter, embedded]);
  useEffect(() => {
    setCall(null);
    setProducts(null);
    setReceipt(null);
    controller.current?.abort();
  }, [url, account, wallet.network]);
  useEffect(() => {
    if (wallet.walletLocked) {
      setCall(null);
      setProducts(null);
      setReceipt(null);
      controller.current?.abort();
    }
  }, [wallet.walletLocked]);
  // The editor passes a verified upload into this same review journey.
  useEffect(() => {
    if (embedded || !(location.state as { url?: string } | null)?.url) return;
    const c = new AbortController(),
      revision = tempoWalletRevision();
    setLoading(true);
    void fetchCatalogProducts(url, c.signal)
      .then((loaded) => {
        assertTempoWalletRevision(revision);
        if (!c.signal.aborted) setProducts(loaded);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(tempoTransactionError(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [
    embedded,
    location.state,
    url,
    account,
    wallet.network,
    wallet.walletLocked,
  ]);
  useEffect(() => () => controller.current?.abort(), []);
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
      running.current = false;
      setBusy(false);
    }
  }
  const canSign = TEMPO_MARKET_ENABLED && account && wallet.walletAdapter;
  const usable = canSign && !wallet.walletLocked;
  async function checkReviewedProducts() {
    const loaded = await fetchCatalogProducts(url, controller.current?.signal);
    if (!products || canonicalJson(loaded) !== canonicalJson(products))
      throw new Error(
        "Catalog products changed. Load and review the catalog again.",
      );
  }
  async function prepare() {
    const revision = tempoWalletRevision();
    await verifyMarketDeployment();
    await checkReviewedProducts();
    const key =
      "picomart_tempo_catalog_intent_" +
      account +
      "_" +
      keccak256(toUtf8Bytes(url));
    if (!navigator.locks)
      throw new Error("Web Locks are required for catalog recovery.");
    const id = await navigator.locks.request(key, async () => {
      let saved = await get<string>(key);
      if (!saved) {
        saved = hexlify(crypto.getRandomValues(new Uint8Array(16)));
        await set(key, saved);
      }
      return saved;
    });
    const identity = await commerceService().receivingIdentity(
      wallet.walletAdapter!,
      receivingContext("seller", account!, tempoIdToSeed(id)),
    );
    assertTempoWalletRevision(revision);
    controller.current?.signal.throwIfAborted();
    const prepared = {
      method: "createCatalog",
      args: [
        id,
        hexlify(
          Uint8Array.from(atob(identity.publicKey), (c) => c.charCodeAt(0)),
        ),
        url,
      ],
    };
    setCall(prepared);
    return prepared;
  }
  async function publish() {
    const revision = tempoWalletRevision();
    setProgress("Preparing catalog...");
    const prepared = call ?? (await prepare());
    if (String(prepared.args[2]) !== url)
      throw new Error("Catalog changed. Fetch and review it again.");
    setProgress("Checking publication and transaction fee...");
    const tx = await marketTransactions.sendContract(prepared, {
      operationId:
        "catalog:" +
        prepared.args[0] +
        ":" +
        prepared.method +
        ":" +
        keccak256(toUtf8Bytes(url)).slice(2, 14),
      expectedAccount: account!,
      signal: controller.current?.signal,
      onSaved: setReceipt,
      reviewFee: async (fee, signal) => {
        await review.reviewFee(fee, signal);
        setProgress("Confirming publication...");
      },
      beforeSign: checkReviewedProducts,
    });
    assertTempoWalletRevision(revision);
    if (controller.current?.signal.aborted) return;
    setReceipt(tx);
    if (tx.state !== "confirmed")
      throw new Error(
        "Catalog publication " +
          tx.state +
          ". Check publication status to recover the same submission.",
      );
    setProgress("Publication confirmed.");
  }
  if (embedded)
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5" />
            Your catalogs{list.length ? " (" + list.length + ")" : ""}
          </CardTitle>
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh catalogs"
            disabled={busy || loading}
            onClick={() => setCounter((n) => n + 1)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p role="status">Loading catalogs...</p>}
          <CommerceError error={error} />
          {!loading && !error && !list.length && (
            <div className="rounded-xl border border-dashed bg-muted/40 px-4 py-10 text-center">
              <PackageSearch className="h-10 w-10 mx-auto mb-4 text-primary/60" />
              <h2 className="font-semibold">
                Start with a catalog.
              </h2>
              <p className="mx-auto mt-2 mb-5 max-w-md text-sm leading-6 text-muted-foreground">
                Add products, publish your storefront, and generate QR codes.
              </p>
              <Button asChild>
                <Link to="/edit-product-catalogue">
                  Create your first catalog
                </Link>
              </Button>
            </div>
          )}
          {list.map((c, index) => (
            <article
              key={c.catalogId}
              className="rounded-xl border p-4 space-y-4 sm:p-5"
            >
              <CatalogSummary url={c.catalogUrl} loadPreview={index < 12} />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Catalog details</summary>
                <div className="mt-2 space-y-3">
                  <p>Catalog reference</p>
                  <CopyableField value={c.seed} length={22} mdLength={22} />
                  <a
                    className="block text-sm underline break-all"
                    href={c.catalogUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.catalogUrl}
                  </a>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={"/print-qr-codes?catalog=" + c.seed}>
                    <QrCode className="h-4 w-4" />
                    Print QR codes
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link
                    to={"/storefronts?catalog=" + c.seed}
                    aria-label="Create storefront from this catalog"
                  >
                    <Store className="h-4 w-4" />
                    Create storefront
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Delete catalog"
                  disabled={!usable || busy}
                  onClick={() => {
                    void run(async () => {
                      const tx = await marketTransactions.sendContract(
                        { method: "deleteCatalog", args: [c.catalogId] },
                        {
                          operationId: "catalog:" + c.catalogId + ":delete",
                          expectedAccount: account!,
                          signal: controller.current?.signal,
                          reviewFee: review.reviewFee,
                        },
                      );
                      if (tx.state !== "confirmed")
                        throw new Error(
                          "Deletion " +
                            tx.state +
                            ". Try again checks the same transaction.",
                        );
                      setCounter((n) => n + 1);
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ))}
          {review.dialog}
        </CardContent>
      </Card>
    );
  return (
    <TempoMarketShell title="Review catalog" seller>
      <nav
        aria-label="Publishing progress"
        className="flex flex-wrap gap-3 text-sm"
      >
        <Link className="underline" to="/edit-product-catalogue">
          1. Add products
        </Link>
        <span aria-current="step" className="font-semibold">
          2. Review catalog
        </span>
        <span className="text-muted-foreground">3. Publish</span>
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>Review your products</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your uploaded catalog is not published yet. Review the products
            below, then approve publication and its transaction fee.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <details open={!url || (!products && !loading)}>
            <summary className="text-sm cursor-pointer">
              Advanced: hosted catalog URL
            </summary>
            <form
              className="space-y-4 mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const revision = tempoWalletRevision();
                  const loaded = await fetchCatalogProducts(
                    url,
                    controller.current?.signal,
                  );
                  assertTempoWalletRevision(revision);
                  controller.current?.signal.throwIfAborted();
                  setProducts(loaded);
                });
              }}
            >
              <label className="block text-sm font-medium">
                Catalog URL
                <input
                  type="url"
                  required
                  disabled={busy || loading}
                  className="block w-full rounded border p-2 bg-background mt-2"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://cdn.picomart.zkbytes.com/..."
                />
              </label>
              <Button disabled={busy || loading}>
                {busy || loading ? "Loading products..." : "Load catalog"}
              </Button>
            </form>
          </details>
          {loading && <p role="status">Loading products...</p>}
          {products && (
            <div className="space-y-4">
              <h3 className="font-semibold">{products.length} products</h3>
              <p className="text-sm text-muted-foreground">
                Currency: {products[0] && <TokenLabel token={products[0].PriceToken} />}
              </p>
              {products.map((p) => (
                <div
                  key={p.ProductId}
                  className="p-4 border rounded-lg flex items-start gap-4"
                >
                  <img
                    src={p.Image}
                    alt={p.Name}
                    className="w-16 h-16 object-cover rounded-md"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium">{p.Name}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {p.Description}
                    </p>
                    <p className="mt-2 flex items-center gap-2">
                      <TokenAmount token={p.PriceToken} amount={p.Price} />
                    </p>
                  </div>
                </div>
              ))}
              <div className="space-y-3 border-t pt-6">
                <AccountUnlockButton />
                <p className="text-sm text-muted-foreground">
                  Next, we prepare your catalog and show its maximum transaction
                  fee. Your catalog is published only after you approve and
                  publication is confirmed.
                </p>
                <Button
                  disabled={!usable || busy || receipt?.state === "confirmed"}
                  onClick={() => void run(publish)}
                >
                  <CloudUpload className="mr-2 h-4 w-4" />
                  {busy
                    ? "Checking publication..."
                    : receipt
                      ? "Check publication status"
                      : "Review publication"}
                </Button>
                {busy && !review.awaitingApproval && (
                  <p role="status" className="text-sm">
                    {progress}
                  </p>
                )}
                {call && (
                  <details className="text-xs text-muted-foreground break-all">
                    <summary className="cursor-pointer">
                      Advanced details
                    </summary>
                    <p>
                      Catalog reference: {tempoIdToSeed(String(call.args[0]))}
                    </p>
                    <p>{url}</p>
                  </details>
                )}
              </div>
            </div>
          )}
          <CommerceError error={error} />
        </CardContent>
      </Card>
      {review.dialog}
      {receipt?.state === "confirmed" && call && (
        <TempoActionDialog
          title="Catalog published"
          busy={false}
          onClose={() => setReceipt(null)}
        >
          <p>
            Your products are ready for orders. Sell offline with printed QR
            codes or online with a storefront.
          </p>
          <Button asChild>
            <Link
              to={
                "/print-qr-codes?catalog=" + tempoIdToSeed(String(call.args[0]))
              }
            >
              Print QR codes
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              to={"/storefronts?catalog=" + tempoIdToSeed(String(call.args[0]))}
            >
              Create storefront
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Return to dashboard</Link>
          </Button>
        </TempoActionDialog>
      )}
    </TempoMarketShell>
  );
}
