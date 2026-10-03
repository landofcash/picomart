import {useState} from "react";
import {Check, Copy, ExternalLink, QrCode} from "lucide-react";
import {QRCodeSVG} from "qrcode.react";
import {Card, CardContent} from "@/components/ui/card";
import TokenIcon from "@/components/TokenIcon.tsx";
import type {NetworkId} from "@/context/wallet/types.ts";
import type {Product} from "@/lib/productSchemas.ts";
import {getBuyerProductUrl} from '@/lib/buyer/links';
import {ProductPrice} from '@/components/commerce/ProductPrice';

interface Props {
  catalogueSeed: string;
  product: Product;
  isApprovedWallet: boolean;
  network: NetworkId;
}

export default function ProductPageMobile({
  catalogueSeed,
  product,
  isApprovedWallet,
  network,
}: Props) {
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const qrValue = getBuyerProductUrl(catalogueSeed, product.ProductId, network);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy product link:", error);
    }
  };

  return (
    <Card className="h-full flex flex-col px-4 py-4 bg-gradient-to-br from-white to-neutral-200 text-slate-900 border-neutral-100 overflow-hidden">
      <CardContent className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {product.Image && (
            <div className="w-full flex justify-center mb-4 flex-shrink-0">
              <img src={product.Image} alt={product.Name} className="max-h-48 object-contain rounded-lg shadow-lg"/>
            </div>
          )}

          <div className="mt-4 flex-1 flex flex-col min-h-0">
            <h2 className="text-xl font-bold leading-tight text-slate-900 mb-2 flex-shrink-0">
              {product.Name}
            </h2>

            <div className="flex-1 overflow-y-auto mb-4 min-h-0 pr-1 custom-scrollbar">
              <p className="text-xs text-slate-700 leading-snug break-words whitespace-pre-wrap">
                {product.Description}
              </p>
            </div>

            <div className="flex flex-col gap-3 p-3 bg-white/60 rounded-2xl border border-white/20 shadow-sm mt-auto">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Price</span>
                  <div className="flex items-center gap-1.5">
                    <TokenIcon assetId={product.PriceToken} size={14} network={network}/>
                    <span className="font-bold text-base text-emerald-700 tracking-tight leading-none">
                      <ProductPrice product={product} network={network}/>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Show QR code"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                  onClick={() => setIsQrModalOpen(true)}
                >
                  <QrCode className="h-4 w-4"/>
                </button>
              </div>

              <a
                href={qrValue}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold tracking-wide text-white shadow-md transition-all hover:bg-emerald-800 active:scale-[0.98]"
              >
                <ExternalLink className="h-4 w-4"/>
                OPEN IN APP
              </a>

              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-mono uppercase tracking-[0.2em] text-slate-500">
                  {network === "mainnet" ? "Live" : network}
                </span>
                {!isApprovedWallet && (
                  <span className="text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                    Unverified
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      {isQrModalOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4"
          onClick={() => setIsQrModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-[320px] overflow-hidden shadow-2xl animate-fade-in-up"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-6 text-center">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Scan to Open</h3>
              <p className="text-xs text-slate-500 mb-6">Open this product in the Picomart app</p>

              <div className="flex justify-center mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <QRCodeSVG value={qrValue} level="H" size={200}/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-600"/>
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4"/>
                      Copy Link
                    </>
                  )}
                </button>
                <a
                  href={qrValue}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  <ExternalLink className="h-4 w-4"/>
                  Open
                </a>
              </div>
            </div>

            <button
              type="button"
              className="w-full py-4 text-sm font-medium text-slate-500 border-t border-slate-100 hover:bg-slate-50 transition-colors"
              onClick={() => setIsQrModalOpen(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
