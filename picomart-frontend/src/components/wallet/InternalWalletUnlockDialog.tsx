import React, {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {LockKeyhole} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import type {InternalWalletUnlockRequest} from "@/lib/internalWallet/types.ts";

interface InternalWalletUnlockDialogProps {
  open: boolean;
  request: InternalWalletUnlockRequest | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (passphrase: string) => void | Promise<void>;
}

const InternalWalletUnlockDialog: React.FC<InternalWalletUnlockDialogProps> = ({
  open,
  request,
  busy = false,
  error,
  onCancel,
  onConfirm,
}) => {
  const [passphrase, setPassphrase] = useState("");

  useEffect(() => {
    if (!open) {
      setPassphrase("");
    }
  }, [open]);

  if (!open || !request) {
    return null;
  }

  const modal = (
    <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl space-y-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5"/>
            Unlock wallet
          </div>
          <h2 className="text-xl font-semibold">{request.walletLabel}</h2>
          <p className="text-sm text-muted-foreground">
            Enter your passphrase to {request.reasonLabel.toLowerCase()}.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="internal-wallet-passphrase">
            Passphrase
          </label>
          <Input
            id="internal-wallet-passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="Enter wallet passphrase"
            autoFocus
            disabled={busy}
          />
          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(passphrase)} disabled={busy || passphrase.length === 0}>
            {busy ? "Unlocking..." : "Unlock"}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletUnlockDialog;
