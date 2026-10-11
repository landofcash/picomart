import {Card, CardContent} from "@/components/ui/card";

interface CoverPageProps {
  isApprovedWallet: boolean;
}

export default function CoverPage({isApprovedWallet}: CoverPageProps) {
  return (
    <Card className="relative h-full flex items-center justify-center bg-gradient-to-br from-white to-neutral-200 text-neutral-900 shadow-2xl border-neutral-100">
      <CardContent className="w-full h-full flex flex-col items-center justify-center text-center px-4 sm:px-12 space-y-4 sm:space-y-6">
        <img src="/logo.svg" alt="Picomart logo" className="w-20 h-20 mb-2"/>
        <h1 className="text-5xl font-bold tracking-tight drop-shadow-sm mb-3 text-slate-900">Picomart</h1>
        <p className="text-base sm:text-2xl max-w-md text-fuchsia-700 font-medium">
          Scan. Shop. Pay in a flash.
        </p>
        <p className="text-sm text-slate-700 max-w-md hidden sm:block">
          This catalogue demonstrates the current Picomart flow. Scan any item to open the live app at app.picomart.zkbytes.com and continue checkout there.
        </p>
        <p className="text-sm text-slate-700 max-w-md block sm:hidden">
          Swipe through the catalogue, open any product in the Picomart app, or pop open the item QR to share it with another device.
        </p>
        <div className="mt-10 text-sm text-slate-600">
          <span className="hidden sm:inline">Flip to explore the catalogue.</span>
          <span className="inline sm:hidden">Swipe to explore the catalogue.</span>
        </div>

        {isApprovedWallet ? (
          <div className="mt-10 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 max-w-md">
            Verified shop: this catalogue is published by a Picomart-controlled wallet for demos and testing.
          </div>
        ) : (
          <div className="text-left mt-10 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 max-w-md">
            <strong>Warning:</strong> This is an unverified catalogue. Delivery, refunds, and customer support are handled by the shop, not Picomart. This shop uses Tempo Moderato testnet; purchases use test tokens.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
