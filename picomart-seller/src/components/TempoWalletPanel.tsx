import { useEffect, useState } from "react";
import { useSellerWalletPopup } from "@/context/SellerWalletPopup";
import { useWallet } from "@/context/WalletContext";
import { Button } from "./ui/button";
import AccountUnlockButton from "./wallet/AccountUnlockButton";

export default function TempoWalletPanel() {
  const openAccount = useSellerWalletPopup(),
    wallet = useWallet();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = wallet.refreshInternalWallets;
  useEffect(() => {
    void refresh().catch(() =>
      setError("Could not load accounts on this device."),
    );
  }, [refresh]);
  async function select(id: string) {
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      await wallet.connectInternalWallet(id);
    } catch {
      setError("Could not select this account. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border p-4 space-y-3">
      <h2 className="font-semibold">Your Picomart account</h2>
      {!!wallet.internalWallets.length && (
        <label className="block text-sm">
          Account
          <select
            className="mt-1 w-full rounded border p-2 bg-background"
            aria-label="Account"
            value={wallet.activeInternalWalletId ?? ""}
            disabled={busy || wallet.walletActionPending}
            onChange={(event) => void select(event.target.value)}
          >
            <option value="" disabled>
              Select an account
            </option>
            {wallet.internalWallets.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <AccountUnlockButton />
      <Button variant="outline" className="w-full" onClick={openAccount}>
        {wallet.walletAddress ? "Manage account" : "Create or restore account"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
