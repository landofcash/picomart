import React, {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

interface InternalWalletCreateModalProps {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (input: { label?: string; passphrase: string }) => Promise<void> | void;
}

const InternalWalletCreateModal: React.FC<InternalWalletCreateModalProps> = ({
  open,
  busy = false,
  error,
  onClose,
  onCreate,
}) => {
  const [label, setLabel] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");

  useEffect(() => {
    if (!open) {
      setLabel("");
      setPassphrase("");
      setConfirmPassphrase("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const passphrasesMatch = passphrase.length > 0 && passphrase === confirmPassphrase;

  const modal = (
    <div role="dialog" aria-modal="true" aria-label="Create built-in wallet" className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-background p-6 shadow-xl space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Create built-in wallet</h2>
          <p className="text-sm text-muted-foreground">
            Your Tempo private key will be generated locally in this browser and encrypted before storage.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-label">
              Wallet label
            </label>
            <Input
              id="wallet-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Optional label"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-passphrase">
              Passphrase
            </label>
            <Input
              id="wallet-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Create a passphrase"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-passphrase-confirm">
              Confirm passphrase
            </label>
            <Input
              id="wallet-passphrase-confirm"
              type="password"
              value={confirmPassphrase}
              onChange={(event) => setConfirmPassphrase(event.target.value)}
              placeholder="Repeat passphrase"
              disabled={busy}
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Store this passphrase safely. The app cannot recover it for you.
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
            onClick={() => onCreate({label: label.trim() || undefined, passphrase})}
            disabled={busy || !passphrasesMatch}
          >
            {busy ? "Creating..." : "Create wallet"}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletCreateModal;
