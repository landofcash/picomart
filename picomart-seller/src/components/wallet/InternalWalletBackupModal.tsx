import React, {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {Eye, EyeOff, Copy} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {InternalWalletBackupItem} from "@/lib/internalWallet/types.ts";

interface InternalWalletBackupModalProps {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  items: InternalWalletBackupItem[] | null;
  onClose: () => void;
  onReveal: () => Promise<void> | void;
}

const InternalWalletBackupModal: React.FC<InternalWalletBackupModalProps> = ({
  open,
  busy = false,
  error,
  items,
  onClose,
  onReveal,
}) => {
  const [revealed, setRevealed] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => { if (!open) { setRevealed(false); setCopiedKey(null); } }, [open]);

  if (!open) {
    return null;
  }

  const handleCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1200);
  };

  const modal = (
    <div role="dialog" aria-modal="true" aria-label="Back up wallet" className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-background p-6 shadow-xl space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Back up wallet</h2>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Anyone with this recovery phrase can control your wallet. Reveal it only if you understand the risk.
          </div>
        </div>

        {items ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Recovery phrase</span>
              <Button variant="outline" size="sm" onClick={() => setRevealed(value => !value)}>
                {revealed ? <EyeOff className="mr-2 h-4 w-4"/> : <Eye className="mr-2 h-4 w-4"/>}
                {revealed ? "Hide" : "Reveal"}
              </Button>
            </div>

            {items.length > 0 ? (
              items.map((item) => (
                <div key={item.kind} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{item.label}</div>
                    <Button variant="outline" size="sm" onClick={() => handleCopy(item.kind, item.value)}>
                      <Copy className="mr-2 h-4 w-4"/>
                      {copiedKey === item.kind ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <div className={`rounded-md bg-muted px-3 py-2 font-mono text-sm break-all ${revealed ? "" : "select-none blur-sm"}`}>
                    {item.value}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                This wallet does not have a mnemonic recovery phrase available.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Reveal the mnemonic recovery phrase after completing the unlock step.
            </p>
            <Button onClick={onReveal} disabled={busy}>
              {busy ? "Revealing..." : "Reveal recovery phrase"}
            </Button>
          </div>
        )}

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletBackupModal;
