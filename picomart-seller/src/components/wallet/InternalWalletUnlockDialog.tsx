import React, {useEffect, useState} from "react";
import AccountDialog from "./AccountDialog";
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
  const [passphrase, setPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setPassword("");
    }
  }, [open]);

  if (!open || !request) {
    return null;
  }

  const modal = (
    <AccountDialog open={open} title="Unlock account" onClose={onCancel} busy={busy} className="max-w-md">
      <form className="space-y-5" onSubmit={event => {event.preventDefault(); if (!busy && passphrase) void onConfirm(passphrase);}}>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5"/>
            Unlock account
          </div>
          <h2 className="text-xl font-semibold">{request.walletLabel}</h2>
          <p className="text-sm text-muted-foreground">
            Enter your password to continue with this account.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="internal-wallet-passphrase">
            Password
          </label>
          <Input
            id="internal-wallet-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
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
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || passphrase.length === 0}>
            {busy ? "Unlocking..." : "Unlock"}
          </Button>
        </div>
      </form>
    </AccountDialog>
  );

  return modal;
};

export default InternalWalletUnlockDialog;
