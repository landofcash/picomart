import {Card, CardContent, CardFooter} from "@/components/ui/card.tsx";
import {ExternalLink, ShoppingCart, Smartphone, Store} from "lucide-react";
import {BASE_APP_URL, BASE_URL} from "@/config.ts";

export default function AboutPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-neutral-800 space-y-10">
      <Card className="h-full flex items-center justify-center bg-gradient-to-br from-neutral-50 to-white text-neutral-900 shadow-2xl">
        <CardContent className="w-full h-full flex flex-col px-12 space-y-6">
          <div className="flex flex-col items-center justify-center text-center">
            <img src="/logo.svg" alt="Picomart logo" className="w-20 h-20 mb-2"/>
            <h1 className="text-5xl font-bold tracking-tight drop-shadow-sm mb-3">Picomart</h1>
            <p className="text-base sm:text-2xl max-w-md text-fuchsia-700">
              Scan. Shop. Pay in a flash.
            </p>
          </div>
          <blockquote className="text-center text-lg text-neutral-600 italic">
            A point-of-sale experience without traditional hardware, apps, or merchant accounts.
          </blockquote>

          <section>
            <h2 className="text-2xl font-semibold mb-2">What Picomart Is</h2>
            <blockquote className="border-l-4 border-neutral-400 pl-4 text-neutral-600 font-medium italic mb-2">
              QR-native commerce: scan, review, pay, and move on.
            </blockquote>
            <p>
              Picomart turns a product card, flyer, shelf label, or printed booklet into a working checkout entrypoint. The promo catalogue shows that flow end to end.
            </p>
          </section>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
            <a href={BASE_URL} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <Store className="w-4 h-4"/>
              Visit Picomart
            </a>
            <a href={BASE_APP_URL} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <Smartphone className="w-4 h-4"/>
              Open App
            </a>
            <a href="/"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <ShoppingCart className="w-4 h-4"/>
              Demo Catalogue
            </a>
            <a href={BASE_URL} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded shadow transition-colors">
              <Store className="w-4 h-4"/>
              Explore Seller Portal
            </a>
          </div>

          <section>
            <h2 className="text-2xl font-semibold mb-2">Core Concept</h2>
            <p className="mb-4">
              A POS-like experience without terminals, merchant accounts, cashier hardware, or a custom storefront. A QR code is enough to launch checkout.
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Combines QR scanning with Tempo Moderato checkout and encrypted order payloads.</li>
              <li>Uses a public product catalogue and links scoped to the Tempo chain, contract and product.</li>
              <li>Keeps the mobile flow separate from promo materials, so printed and digital catalogues stay simple.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">Security And Privacy</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Delivery details and order data are encrypted client-side before sellers can retrieve them.</li>
              <li>Catalogue metadata is resolved through the Picomart sync layer, which reflects the current on-chain catalog contract layout.</li>
              <li>The promo app only renders catalogue content and QR entrypoints. The live checkout happens in the main Picomart app.</li>
              <li>Shop labels use an explicit seller address allowlist. A label does not guarantee delivery or refunds.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">Use Cases</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Printed promo books and flyers that can be scanned into a real product flow.</li>
              <li>Pop-up stores, events, and in-person demos where products need instant mobile checkout.</li>
              <li>Restaurants, shelves, and product displays where each item can expose its own QR entrypoint.</li>
              <li>Sales teams and merchants who want a visual catalogue without rebuilding the main checkout app.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">How This Promo App Fits</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>It resolves catalogues by seed through the same sync API the main app uses.</li>
              <li>It generates QR codes that open the current Picomart app domain at app.picomart.zkbytes.com.</li>
              <li>It mirrors the latest token and network conventions used elsewhere in the system.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-2">Are You A Seller?</h2>
            <p className="mb-2">
              Start offering instant checkout with catalogue seeds, QR codes, and the current Picomart seller flow:
            </p>
            <a href={BASE_URL} className="text-blue-900 hover:text-blue-600 underline inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer">
              Visit Seller Portal
              <ExternalLink className="h-3 w-3"/>
            </a>
          </section>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground py-1">
          (c) {new Date().getFullYear()} PICOMART.COM.
        </CardFooter>
      </Card>
    </main>
  );
}
