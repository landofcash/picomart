import React, {useEffect, useState} from "react";
import AccountDialog from "./AccountDialog";
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
    <AccountDialog open={open} title={items?.some(item => item.kind === 'privateKey') ? 'Save recovery key' : 'Save recovery words'} onClose={onClose} busy={busy} className="max-w-2xl">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Anyone with these recovery details can access your account and funds. Keep them private and never share them.
          </div>
        </div>

        {items ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Recovery words</span>
              <Button variant="outline" size="sm" onClick={() => setRevealed(value => !value)}>
                {revealed ? <EyeOff className="mr-2 h-4 w-4"/> : <Eye className="mr-2 h-4 w-4"/>}
                {revealed ? "Hide" : "Reveal"}
              </Button>
            </div>

            {items.length > 0 ? (
              items.map((item) => (
                <div key={item.kind} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{item.kind === 'mnemonic' ? 'Recovery words' : 'Private key (advanced)'}</div>
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
                This account was restored using a private key and has no recovery words. Keep your original private key safe.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Save these words somewhere private. They let you restore access on another device. Picomart cannot recover them for you.
            </p>
            <Button onClick={onReveal} disabled={busy}>
              {busy ? "Opening..." : "Show recovery words"}
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
    </AccountDialog>
  );

  return modal;
};

export default InternalWalletBackupModal;
