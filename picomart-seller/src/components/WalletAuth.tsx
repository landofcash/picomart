import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import { PopoverTrigger } from "@/components/ui/popover";
export default function WalletAuth() {
  const { walletAddress, walletKind, activeInternalWalletId, internalWallets } =
    useWallet();
  const label =
    walletKind === "internal"
      ? (internalWallets.find(
          (account) => account.id === activeInternalWalletId,
        )?.label ?? "My account")
      : "Connected account";
  return (
    <PopoverTrigger asChild>
      {walletAddress ? (
        <Button
          variant="outline"
          aria-label="Open account"
          className="flex h-11 items-center gap-2 rounded-full border border-primary/20 bg-card px-2 text-sm hover:bg-accent/40 sm:px-3"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{label}</span>
        </Button>
      ) : (
        <Button aria-label="Get started" className="h-11 px-3 text-sm">
          <UserRound className="w-4 h-4" />
          <span className="hidden sm:inline">Get started</span>
        </Button>
      )}
    </PopoverTrigger>
  );
}
