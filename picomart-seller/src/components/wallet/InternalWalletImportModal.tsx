import React, {useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
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
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");

  useEffect(() => {
    if (!open) {
      setMode("mnemonic");
      setLabel("");
      setMaterial("");
      setPassphrase("");
      setConfirmPassphrase("");
    }
  }, [open]);

  const canSubmit = useMemo(() => {
    if (passphrase.length === 0 || passphrase !== confirmPassphrase) {
      return false;
    }

    if (mode === "mnemonic") {
      return normalizeMnemonic(material).split(" ").filter(Boolean).length >= 12;
    }

    return material.trim().length >= 64;
  }, [confirmPassphrase, material, mode, passphrase]);

  if (!open) {
    return null;
  }

  const modal = (
    <div role="dialog" aria-modal="true" aria-label="Import built-in wallet" className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-background p-6 shadow-xl space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Import built-in wallet</h2>
          <p className="text-sm text-muted-foreground">
            Import a Tempo wallet from a recovery phrase or raw ECDSA private key. The imported key is encrypted locally before storage.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "mnemonic" ? "default" : "outline"}
            onClick={() => setMode("mnemonic")}
            disabled={busy}
          >
            Recovery phrase
          </Button>
          <Button
            type="button"
            variant={mode === "privateKey" ? "default" : "outline"}
            onClick={() => setMode("privateKey")}
            disabled={busy}
          >
            Private key
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-import-label">
              Wallet label
            </label>
            <Input
              id="wallet-import-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Optional label"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="wallet-import-material">
              {mode === "mnemonic" ? "Recovery phrase" : "Private key"}
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
                Passphrase
              </label>
              <Input
                id="wallet-import-passphrase"
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="Create a passphrase"
                disabled={busy}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="wallet-import-confirm">
                Confirm passphrase
              </label>
              <Input
                id="wallet-import-confirm"
                type="password"
                value={confirmPassphrase}
                onChange={(event) => setConfirmPassphrase(event.target.value)}
                placeholder="Repeat passphrase"
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
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onImport({
              label: label.trim() || undefined,
              passphrase,
              mnemonic: mode === "mnemonic" ? normalizeMnemonic(material) : undefined,
              privateKey: mode === "privateKey" ? material.trim() : undefined,
            })}
            disabled={busy || !canSubmit}
          >
            {busy ? "Importing..." : "Import wallet"}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletImportModal;
