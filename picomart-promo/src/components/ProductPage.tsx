import {Card, CardContent} from "@/components/ui/card";
import TokenIcon from "@/components/TokenIcon.tsx";
import {priceToDisplayString} from "@/lib/tokenUtils.ts";
import {QRCodeSVG} from "qrcode.react";

import type {Product} from "@/lib/productSchemas.ts";
import {getBuyerProductUrl} from "@/lib/buyer/links";
import type {NetworkId} from "@/context/wallet/types.ts";

interface Props {
  catalogueSeed: string;
  product: Product;
  pageNumber: number;
  isApprovedWallet: boolean;
  network: NetworkId;
}

const generateQRData = (catalogueSeed: string, product: Product, network: NetworkId): string => {
  return getBuyerProductUrl(catalogueSeed, product.ProductId, network)
}

export default function ProductPage({catalogueSeed, product, pageNumber, isApprovedWallet, network}: Props) {
  const qrValue = generateQRData(catalogueSeed, product, network);

  return (
    <Card className="h-full flex flex-col justify-between px-10 py-8 bg-gradient-to-br from-white to-neutral-200 text-slate-900 border-neutral-100">
      <CardContent className="flex-1 flex flex-col justify-between gap-6">
        <div>
          {product.Image && (
            <div className="w-full flex justify-center mb-4">
              <img src={product.Image} alt={product.Name}
                   className="max-h-48 object-contain rounded-lg shadow-lg"/>
            </div>
          )}
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-start gap-6">
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-3 leading-tight text-slate-900">{product.Name}</h2>
              <p className="text-sm text-slate-700 leading-snug break-words whitespace-pre-wrap">
                {product.Description}
              </p>
            </div>
            <div className="flex flex-col items-center sm:items-start justify-start gap-1">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TokenIcon assetId={product.PriceToken} size={18}/>
                <span className="font-bold text-sm print:text-[10px] text-emerald-700 tracking-wide">
                  {priceToDisplayString(product.PriceToken, product.Price)}
                </span>
              </div>
              <div className="flex justify-center mb-1">
                <div className="flex justify-center mb-1">
                  <a
                    href={qrValue}
                    className="block sm:hidden bg-white p-1 rounded border print:p-0 print:border-none shadow-sm"
                  >
                    <QRCodeSVG
                      value={qrValue}
                      level="L"
                      includeMargin={false}
                      className="w-20 h-20"
                    />
                  </a>

                  <div className="hidden sm:block bg-white p-1 rounded border print:p-0 print:border-none shadow-sm">
                    <QRCodeSVG
                      value={qrValue}
                      level="L"
                      includeMargin={false}
                      className="w-20 h-20"
                    />
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-slate-600 text-center font-mono space-y-0.5">
                <div>Scan with PICOMART</div>
                <div>Order Anytime</div>
                {network !== "mainnet" && (
                  <div>[{network.toUpperCase()}]</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto flex justify-between items-end">
          <footer className="text-sm text-slate-600 flex items-center gap-2">
            <span>Page {pageNumber + 1}</span>
            {!isApprovedWallet && (
              <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                Unverified catalogue
              </span>
            )}
          </footer>
        </div>
      </CardContent>
    </Card>
  );
}
