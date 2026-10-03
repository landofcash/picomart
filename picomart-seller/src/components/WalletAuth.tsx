import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import { PopoverTrigger } from "@/components/ui/popover";
export default function WalletAuth() {
  const { walletAddress } = useWallet();
  return (
    <PopoverTrigger asChild>
      {walletAddress ? (
        <Button
          variant="outline"
          aria-label="Open Wallet"
          className="flex items-center gap-2 rounded-full border border-primary/30 bg-background px-2 py-1 text-sm hover:bg-accent/40"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Wallet className="h-4 w-4" />
          </span>
          <span className="hidden sm:block font-mono">
            {walletAddress.slice(0, 10) + "\u2026" + walletAddress.slice(-8)}
          </span>
        </Button>
      ) : (
        <Button
          aria-label="Open Wallet"
          className="cursor-pointer border-0 bg-[linear-gradient(135deg,#8259EF_0%,#0031FF_100%)] px-3 py-1 text-sm text-white shadow-[0_18px_34px_-18px_rgba(0,49,255,0.55)] hover:brightness-110"
        >
          <Wallet className="w-4 h-4" />
          <span className="hidden sm:inline">Get started</span>
        </Button>
      )}
    </PopoverTrigger>
  );
}
