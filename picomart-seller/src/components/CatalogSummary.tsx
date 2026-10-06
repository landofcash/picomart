import { useEffect, useState } from "react";
import { PackageSearch } from "lucide-react";
import { fetchCatalogProducts, type MarketProduct } from "@/lib/tempoMarket";

/** Public product previews only; no catalog name or metadata is persisted. */
export default function CatalogSummary({
  url,
  loadPreview,
}: {
  url: string;
  loadPreview: boolean;
}) {
  const [products, setProducts] = useState<MarketProduct[] | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setProducts(null);
    setFailed(false);
    if (!loadPreview) return;
    const controller = new AbortController();
    void fetchCatalogProducts(url, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setProducts(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [url, loadPreview]);
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted text-primary">
        {products?.[0] ? (
          <img
            src={products[0].Image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <PackageSearch className="h-6 w-6" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-base font-semibold leading-6">
          {products
            ? products[0].Name +
              (products.length > 1
                ? " + " + (products.length - 1) + " more"
                : "")
            : "Product catalog"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {products
            ? products.length +
              " " +
              (products.length === 1 ? "product" : "products") +
              " · PathUSD"
            : failed
              ? "Product preview unavailable. Catalog actions remain available."
              : loadPreview
                ? "Loading product preview..."
                : "Published catalog"}
        </p>
        {products && products.length > 1 && (
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {products
              .slice(1, 4)
              .map((p) => p.Name)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
