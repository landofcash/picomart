import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import { requestInternalWalletPassphrase } from "@/lib/internalWallet/unlockGate";

export default function AccountUnlockButton({
  onStart,
  variant = "outline",
  label = "Unlock account",
  className = "",
}: {
  onStart?: () => void;
  variant?: "default" | "outline";
  label?: string;
  className?: string;
}) {
  const wallet = useWallet(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (
    wallet.walletKind !== "internal" ||
    !wallet.walletLocked ||
    !wallet.activeInternalWalletId
  )
    return null;
  async function unlock() {
    if (busy || !wallet.activeInternalWalletId) return;
    setBusy(true);
    setError("");
    onStart?.();
    try {
      await requestInternalWalletPassphrase({
        walletId: wallet.activeInternalWalletId,
        walletLabel:
          wallet.internalWallets.find(
            (account) => account.id === wallet.activeInternalWalletId,
          )?.label ?? "My account",
        network: wallet.network,
        reason: "sign-message",
        reasonLabel: "unlock your account",
      });
    } catch (failure) {
      if (
        !(
          failure instanceof Error &&
          failure.message === "Wallet unlock was cancelled."
        )
      ) {
        setError("Account remains locked. You can try unlocking it again.");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        className={`w-full ${className}`}
        disabled={busy || wallet.walletActionPending}
        onClick={() => void unlock()}
      >
        <LockKeyhole className="h-4 w-4" />
        {busy ? "Unlocking…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
