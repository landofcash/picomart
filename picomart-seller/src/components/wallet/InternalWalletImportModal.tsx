import React, {useEffect, useMemo, useState} from "react";
import AccountDialog from "./AccountDialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

type ImportMode = "mnemonic" | "privateKey";

interface InternalWalletImportModalProps {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onImport: (input: { label?: string; passphrase: string; mnemonic?: string; privateKey?: string }) => Promise<void> | void;
}

const normalizeMnemonic = (value: string) => value.trim().replace(/\s+/g, " ");

const InternalWalletImportModal: React.FC<InternalWalletImportModalProps> = ({
  open,
  busy = false,
  error,
  onClose,
  onImport,
}) => {
  const [mode, setMode] = useState<ImportMode>("mnemonic");
  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState("");
  const [passphrase, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setMode("mnemonic");
      setLabel("");
      setMaterial("");
      setPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  const canSubmit = useMemo(() => {
    if (passphrase.length < 8 || passphrase !== confirmPassword) {
      return false;
    }

    if (mode === "mnemonic") {
      return normalizeMnemonic(material).split(" ").filter(Boolean).length >= 12;
    }

    return material.trim().length >= 64;
  }, [confirmPassword, material, mode, passphrase]);

  if (!open) {
    return null;
  }

  const modal = (
    <AccountDialog open={open} title="Restore account" onClose={onClose} busy={busy} className="max-w-2xl">
      <form className="space-y-5" onSubmit={event => {event.preventDefault(); if (!busy && canSubmit) void onImport({label: label.trim() || undefined, passphrase, mnemonic: mode === "mnemonic" ? normalizeMnemonic(material) : undefined, privateKey: mode === "privateKey" ? material.trim() : undefined});}}>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Restore your account using your recovery words, then choose a password for this browser.
          </p>
        </div>

        <div className="flex gap-2">
          <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Advanced restore options</summary>
          <Button className="mt-2"
            type="button"
            variant={mode === "privateKey" ? "default" : "outline"}
            onClick={() => setMode("privateKey")}
            disabled={busy}
          >
            Use a private key
          </Button>
          </details>
          {mode === 'privateKey' && <Button
            type="button"
            variant="outline"
            onClick={() => setMode("mnemonic")}
            disabled={busy}
          >
            Use recovery words
          </Button>}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-import-label">
              Account name
            </label>
            <Input
              id="wallet-import-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. My shop"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-import-material">
              {mode === "mnemonic" ? "Recovery words" : "Private key"}
            </label>
            <textarea
              id="wallet-import-material"
              value={material}
              onChange={(event) => setMaterial(event.target.value)}
              rows={mode === "mnemonic" ? 4 : 3}
              spellCheck={false}
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder={mode === "mnemonic" ? "Enter 12 or 24 words" : "Enter 64-character hex private key"}
              disabled={busy}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="wallet-import-passphrase">
                Password
              </label>
              <Input
                id="wallet-import-passphrase"
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
              <label className="text-sm font-medium" htmlFor="wallet-import-confirm">
                Confirm password
              </label>
              <Input
                id="wallet-import-confirm"
                type="password"
              autoComplete="new-password"
              minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
                disabled={busy}
              />
            </div>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Never paste recovery material on a device you do not trust.
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
            disabled={busy || !canSubmit}
          >
            {busy ? "Restoring..." : "Restore account"}
          </Button>
        </div>
      </form>
    </AccountDialog>
  );

  return modal;
};

export default InternalWalletImportModal;
