import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  QrCode,
  Trash2,
  Minus,
  Plus,
  Package,
  Store,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import TempoMarketShell from "@/components/TempoMarketShell";
import CatalogIdentity from "@/components/CatalogIdentity";
import CopyableField from "@/components/CopyableField";
import TokenPrice from "@/components/TokenPrice";
import { useWallet } from "@/context/WalletContext";
import {
  readTempoCart,
  saveTempoCart,
  tempoSelectionKey,
} from "@/lib/tempoCart";
import {
  TEMPO_MARKET_ENABLED,
  checkoutIntent,
  catalogLink,
  validateSelection,
  type CheckoutSelection,
} from "@/lib/tempoMarket";

export default function TempoCartPage() {
  const wallet = useWallet();
  const [checking, setChecking] = useState(false);
  async function checkout(selection: CheckoutSelection) {
    if (checking) return;
    setChecking(true);
    try {
      if (TEMPO_MARKET_ENABLED && wallet.walletAddress)
        await checkoutIntent(selection, wallet.walletAddress, true);
      sessionStorage.setItem(tempoSelectionKey, JSON.stringify(selection));
      navigate("/order");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Checkout could not be opened.",
      );
    } finally {
      setChecking(false);
    }
  }
  const [cart, setCart] = useState<CheckoutSelection[]>(() => {
      try {
        return readTempoCart();
      } catch {
        return [];
      }
    }),
    [error, setError] = useState(""),
    navigate = useNavigate();
  function update(next: CheckoutSelection[]) {
    try {
      saveTempoCart(next);
      setCart(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cart could not be saved.");
    }
  }
  function quantity(groupIndex: number, id: string, value: number) {
    update(
      cart.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              products: group.products.map((item) =>
                item.ProductId === id ? { ...item, quantity: value } : item,
              ),
            }
          : group,
      ),
    );
  }
  function remove(groupIndex: number, id: string) {
    update(
      cart.flatMap((group, index) => {
        if (index !== groupIndex) return [group];
        const products = group.products.filter((item) => item.ProductId !== id);
        return products.length ? [{ ...group, products }] : [];
      }),
    );
  }
  return (
    <TempoMarketShell title="Your Cart" surface="muted">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!cart.length && (
        <div className="text-center text-muted-foreground py-8">
          <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">Your cart is empty</p>
          <p className="text-sm">
            Scan products to collect them here and order when you are ready.
          </p>
        </div>
      )}
      {cart.map((selection, index) => (
        <section key={selection.catalog.catalogId} className="space-y-3">
          <details className="group text-sm">
            <summary
              aria-label="Shop payment details"
              className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden"
            >
              <span className="flex items-center gap-2 font-medium">
                <Store className="h-5 w-5" />
                {cart.length > 1 ? `Shop ${index + 1}` : "Shop"}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Details
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="space-y-2 pb-3 pt-2">
              <div
                className="flex min-w-0 items-start gap-2 font-semibold"
                aria-label="Shop payment address"
              >
                <MapPin
                  className="h-5 w-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <CopyableField
                    value={selection.catalog.seller}
                    small
                    className="break-all"
                  />
                </div>
              </div>
              <CatalogIdentity seed={selection.catalog.seed} full small />
            </div>
          </details>
          <div className="space-y-4">
            {selection.products.map((item) => (
              <article key={item.ProductId} className="flex gap-3">
                <Link
                  to={
                    "/" +
                    new URL(catalogLink(selection.catalog.seed, item.ProductId))
                      .hash
                  }
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center"
                  aria-label={`View ${item.Name}`}
                >
                  {item.Image ? (
                    <img
                      src={item.Image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground" />
                  )}
                </Link>
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    className="block text-sm font-medium leading-snug hover:underline"
                    to={
                      "/" +
                      new URL(
                        catalogLink(selection.catalog.seed, item.ProductId),
                      ).hash
                    }
                  >
                    {item.Name}
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <TokenPrice
                      amount={item.Price}
                      token={item.PriceToken}
                      iconSize={16}
                      className="text-xs text-muted-foreground"
                    />
                    <div className="flex shrink-0 items-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 text-destructive"
                        aria-label={`Remove ${item.Name}`}
                        onClick={() => remove(index, item.ProductId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11 bg-white dark:bg-background"
                        aria-label={`Decrease ${item.Name} quantity`}
                        disabled={item.quantity <= 1}
                        onClick={() =>
                          quantity(index, item.ProductId, item.quantity - 1)
                        }
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <input
                        type="number"
                        min="1"
                        max="1000000"
                        aria-label={`${item.Name} quantity`}
                        className="no-spinner min-w-7 h-11 bg-transparent text-center text-base"
                        style={{
                          width: `${String(item.quantity).length + 1}ch`,
                        }}
                        value={item.quantity}
                        onChange={(e) =>
                          quantity(
                            index,
                            item.ProductId,
                            Number(e.target.value),
                          )
                        }
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11 bg-white dark:bg-background"
                        aria-label={`Increase ${item.Name} quantity`}
                        onClick={() =>
                          quantity(index, item.ProductId, item.quantity + 1)
                        }
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Shop subtotal</span>
              <TokenPrice
                amount={validateSelection(selection).amount}
                token={selection.products[0].PriceToken}
              />
            </div>
            <Button
              className="w-full bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-600/30"
              size="lg"
              disabled={checking}
              onClick={() => void checkout(selection)}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              Checkout
            </Button>
          </div>
        </section>
      ))}
      {cart.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Orders from different shops are paid separately. Prices are checked
          again before payment.
        </p>
      )}
      <div
        className={
          cart.length ? "grid grid-cols-[auto_minmax(0,1fr)] gap-3" : "grid"
        }
      >
        {!!cart.length && (
          <Button
            variant="outline"
            className="min-h-16 flex-col gap-1 bg-white px-4 text-muted-foreground dark:bg-background"
            onClick={() => update([])}
          >
            <Trash2 className="h-4 w-4" />
            <span className="text-xs">Clear cart</span>
          </Button>
        )}
        <Button
          asChild
          className="min-h-16 min-w-0 whitespace-normal px-3 text-center"
        >
          <Link to="/scan">
            <QrCode className="h-5 w-5 shrink-0" />
            <span>Scan another product</span>
          </Link>
        </Button>
      </div>
    </TempoMarketShell>
  );
}
