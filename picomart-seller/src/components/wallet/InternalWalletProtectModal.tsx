import React, {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

interface InternalWalletProtectModalProps {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: { currentPassphrase?: string; nextPassphrase: string }) => Promise<void> | void;
}

const InternalWalletProtectModal: React.FC<InternalWalletProtectModalProps> = ({
  open,
  busy = false,
  error,
  onClose,
  onSubmit,
}) => {
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [nextPassphrase, setNextPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");

  useEffect(() => {
    if (!open) {
      setCurrentPassphrase("");
      setNextPassphrase("");
      setConfirmPassphrase("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const modal = (
    <div role="dialog" aria-modal="true" aria-label="Change passphrase" className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-background p-6 shadow-xl space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Change passphrase</h2>
          <p className="text-sm text-muted-foreground">
            Update the passphrase used to decrypt this wallet locally.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-current-passphrase">
              Current passphrase
            </label>
            <Input
              id="wallet-current-passphrase"
              type="password"
              value={currentPassphrase}
              onChange={(event) => setCurrentPassphrase(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-next-passphrase">
              New passphrase
            </label>
            <Input
              id="wallet-next-passphrase"
              type="password"
              value={nextPassphrase}
              onChange={(event) => setNextPassphrase(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-confirm-next-passphrase">
              Confirm new passphrase
            </label>
            <Input
              id="wallet-confirm-next-passphrase"
              type="password"
              value={confirmPassphrase}
              onChange={(event) => setConfirmPassphrase(event.target.value)}
              disabled={busy}
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({
              currentPassphrase,
              nextPassphrase,
            })}
            disabled={busy || nextPassphrase.length === 0 || nextPassphrase !== confirmPassphrase}
          >
            {busy ? "Saving..." : "Update passphrase"}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletProtectModal;
