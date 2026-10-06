import React, {useEffect, useState} from "react";
import AccountDialog from "./AccountDialog";
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
  const [passphrase, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setLabel("");
      setPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const passphrasesMatch = passphrase.length >= 8 && passphrase === confirmPassword;

  const modal = (
    <AccountDialog open={open} title="Create account" onClose={onClose} busy={busy} className="max-w-lg">
      <form className="space-y-5" onSubmit={event => {event.preventDefault(); if (!busy && passphrasesMatch) void onCreate({label: label.trim() || undefined, passphrase});}}>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Your account is saved securely in this browser. Save your recovery words to restore access on another device.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-label">
              Account name
            </label>
            <Input
              id="wallet-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. My shop"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-passphrase">
              Password
            </label>
            <Input
              id="wallet-passphrase"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={passphrase}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-passphrase-confirm">
              Confirm password
            </label>
            <Input
              id="wallet-passphrase-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              disabled={busy}
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Keep your password safe. Picomart cannot reset it. Recovery words let you restore access and choose a new password.
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || !passphrasesMatch}
          >
            {busy ? "Creating..." : "Create account"}
          </Button>
        </div>
      </form>
    </AccountDialog>
  );

  return modal;
};

export default InternalWalletCreateModal;
