import React from "react";
import AppVersion from "./AppVersion";
import Header from "./Header";
import { Toaster } from "./ui/sonner";
import { useWallet } from "@/context/WalletContext";
import { Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { walletActionPending, walletActionLabel, walletKind } = useWallet();
  const workspace = /^\/storefronts\/[^/]+\/?$/.test(useLocation().pathname);

  return (
    <div className="seller-app-shell min-h-screen bg-background flex flex-col">
      <a
        href="#seller-main-content"
        className="sr-only z-[60] rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 print:hidden"
      >
        Skip to content
      </a>
      {!workspace && <Header />}
      <main
        id="seller-main-content"
        tabIndex={-1}
        className="flex-1 outline-none"
      >
        {children}
      </main>
      <footer className="px-4 py-2 print:hidden"><AppVersion/></footer>
      <Toaster richColors position="top-center" className="print:hidden" />

      {walletActionPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm print:hidden"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mx-4 w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <div className="text-sm font-medium">
                {walletActionLabel ?? "Processing your request…"}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {walletKind === "internal"
                ? "Keep this page open while your request is processed."
                : "Confirm or cancel the request in your connected app."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
