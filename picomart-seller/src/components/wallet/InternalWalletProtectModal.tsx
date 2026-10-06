import React, {useEffect, useState} from "react";
import AccountDialog from "./AccountDialog";
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const modal = (
    <AccountDialog open={open} title="Change password" onClose={onClose} busy={busy} className="max-w-lg">
      <form className="space-y-5" onSubmit={event => {event.preventDefault(); if (!busy && nextPassword.length >= 8 && nextPassword === confirmPassword) void onSubmit({currentPassphrase: currentPassword, nextPassphrase: nextPassword});}}>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Change the password that protects your account in this browser. Your receiving address and balance stay the same.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-current-passphrase">
              Current password
            </label>
            <Input
              id="wallet-current-passphrase"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-next-passphrase">
              New password
            </label>
            <Input
              id="wallet-next-passphrase"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="At least 8 characters"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-confirm-next-passphrase">
              Confirm new password
            </label>
            <Input
              id="wallet-confirm-next-passphrase"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || nextPassword.length < 8 || nextPassword !== confirmPassword}
          >
            {busy ? "Saving..." : "Update password"}
          </Button>
        </div>
      </form>
    </AccountDialog>
  );

  return modal;
};

export default InternalWalletProtectModal;
