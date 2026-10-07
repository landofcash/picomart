import { useState } from "react";
import { ShoppingCart, ChevronDown, ChevronUp, Package } from "lucide-react";
import { formatUnits } from "ethers";
import { getCurrency } from "@picomart/config";
import { Button } from "./ui/button";
import TokenIcon from "./TokenIcon";

import type { MarketCatalog, MarketProduct } from "@/lib/tempoMarket";

export default function TempoProductDetails({
  catalog,
  product,
  onAdd,
}: {
  catalog: MarketCatalog;
  product: MarketProduct;
  onAdd: () => void;
}) {
  const [technical, setTechnical] = useState(false),
    [imageFailed, setImageFailed] = useState(false);
  const currency = getCurrency(product.PriceToken);
  return (
    <div className="space-y-4">
      <div className="aspect-square overflow-hidden rounded-lg bg-muted flex items-center justify-center">
        {product.Image && !imageFailed ? (
          <img
            src={product.Image}
            alt={product.Name}
            className="w-full h-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Package
            className="h-20 w-20 text-muted-foreground"
            aria-label="Product image unavailable"
          />
        )}
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{product.Name}</h2>
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
          {product.Description}
        </p>
        <div className="flex items-center gap-2 pt-2">
          <TokenIcon assetId={product.PriceToken} size={20} />
          <span className="text-2xl font-bold text-primary">
            {formatUnits(product.Price, currency.decimals)} {currency.symbol}
          </span>
        </div>
      </div>
      <Button className="w-full" size="lg" onClick={onAdd}>
        <ShoppingCart className="mr-2 h-5 w-5" />
        Add to cart
      </Button>
      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        aria-expanded={technical}
        onClick={() => setTechnical((value) => !value)}
      >
        {technical ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        {technical ? "Hide" : "Show"} shop and payment details
      </Button>
      {technical && (
        <div className="space-y-3 py-4 border-t text-sm">
          <p>
            Shop reference:{" "}
            <span className="block font-mono break-all">{catalog.seed}</span>
          </p>
          <p>
            Item ID:{" "}
            <span className="block font-mono break-all">
              {product.ProductId}
            </span>
          </p>
          <p>
            Shop payment address:{" "}
            <span className="block font-mono break-all">{catalog.seller}</span>
          </p>
          <p>
            Product source:{" "}
            <span className="block font-mono break-all">
              {catalog.catalogUrl}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
