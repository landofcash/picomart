import React, {useEffect, useState} from "react";
import {Wallet as WalletIcon, PlusCircle, FileUp, Trash2} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Button} from "@/components/ui/button";
import {useWallet} from "@/context/WalletContext";
import genericWalletLogo from "@/assets/wallet.svg";
import ConfirmModal from "@/components/wallet/ConfirmModal";
import InternalWalletCreateModal from "@/components/wallet/InternalWalletCreateModal";
import InternalWalletImportModal from "@/components/wallet/InternalWalletImportModal";
import InternalWalletSuccessModal from "@/components/wallet/InternalWalletSuccessModal";
import type {InternalWalletStatus, InternalWalletSummary} from "@/lib/internalWallet/types.ts";
import {truncateString} from "@/lib/cryptoFormat.ts";

function getLifecycleBadgeLabel(lifecycleState: InternalWalletSummary["lifecycleState"]): string | null {
  if (lifecycleState === "funded_or_alias_created") {
    return "Needs HBAR";
  }

  if (lifecycleState === "ready") {
    return "Ready";
  }

  return null;
}

function formatWalletAddressLabel(address: string): string {
  return /^\d+\.\d+\.\d+$/.test(address.trim()) ? address : truncateString(address, 18);
}

const WalletDisconnected: React.FC = () => {
  const {
    availableExternalProviders,
    connect,
    createInternalWallet,
    importInternalWallet,
    connectInternalWallet,
    internalWallets,
    refreshInternalWallets,
    removeInternalWallet,
    setExternalProviderId,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdWallet, setCreatedWallet] = useState<InternalWalletStatus | null>(null);

  useEffect(() => {
    if (open) {
      void refreshInternalWallets();
    }
  }, [open, refreshInternalWallets]);

  const deletingWallet = confirmDeleteWalletId
    ? internalWallets.find(wallet => wallet.id === confirmDeleteWalletId) ?? null
    : null;

  const handleCreate = async (input: { label?: string; passphrase: string }) => {
    try {
      setBusy(true);
      setFormError(null);
      const created = await createInternalWallet(input);
      setCreateOpen(false);
      setOpen(false);
      setCreatedWallet(created);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create wallet.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (input: { label?: string; passphrase: string; mnemonic?: string; privateKey?: string }) => {
    try {
      setBusy(true);
      setFormError(null);
      await importInternalWallet(input);
      setImportOpen(false);
      setOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to import wallet.");
    } finally {
      setBusy(false);
    }
  };

  const handleConnectInternal = async (walletId: string) => {
    try {
      setBusy(true);
      await connectInternalWallet(walletId);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteInternal = async () => {
    if (!confirmDeleteWalletId) {
      return;
    }

    try {
      setBusy(true);
      await removeInternalWallet(confirmDeleteWalletId);
    } finally {
      setBusy(false);
      setConfirmDeleteWalletId(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label="Open wallet setup"
            className="cursor-pointer border-0 bg-[linear-gradient(135deg,#8259EF_0%,#0031FF_100%)] px-3 py-1 text-sm text-white shadow-[0_18px_34px_-18px_rgba(0,49,255,0.55)] hover:brightness-110"
          >
            <WalletIcon className="w-4 h-4"/>
            <span className="hidden sm:inline">Get started</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          collisionPadding={8}
          className="w-[min(26rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain p-4 text-sm shadow-lg space-y-4 sm:w-104 sm:space-y-5"
        >
          <div className="space-y-1">
            <div className="text-sm font-semibold">Start with a wallet</div>
            <div className="text-sm text-muted-foreground">
              Create a built-in wallet in this browser to try Picomart, or connect an external wallet you already use.
            </div>
          </div>

          {availableExternalProviders.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">External wallets</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableExternalProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="outline"
                    className="justify-start"
                    onClick={async () => {
                      setExternalProviderId(provider.id);
                      await connect({kind: "external", chain: "hedera", providerId: provider.id});
                      setOpen(false);
                    }}
                  >
                    <img
                      src={genericWalletLogo}
                      alt=""
                      className="mr-2 h-4 w-4"
                      aria-hidden="true"
                    />
                    {provider.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Built-in wallet</div>
                <div className="text-sm text-muted-foreground">
                  Create, import, use, or remove encrypted wallets stored only in this browser.
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  setFormError(null);
                  setCreateOpen(true);
                }}>
                  <PlusCircle className="mr-2 h-4 w-4"/>
                  Create
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  setFormError(null);
                  setImportOpen(true);
                }}>
                  <FileUp className="mr-2 h-4 w-4"/>
                  Import
                </Button>
              </div>
            </div>

            {internalWallets.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No built-in wallets saved in this browser yet.
              </div>
            ) : (
              <div className="space-y-2">
                {internalWallets.map((wallet) => (
                  <div key={wallet.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{wallet.label}</div>
                        <div className="font-mono text-xs text-muted-foreground break-all">
                          {formatWalletAddressLabel(wallet.identity.accountId ?? wallet.identity.evmAddress)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {getLifecycleBadgeLabel(wallet.lifecycleState) ? (
                          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {getLifecycleBadgeLabel(wallet.lifecycleState)}
                          </span>
                        ) : null}
                        <Button size="sm" onClick={() => void handleConnectInternal(wallet.id)} disabled={busy}>
                          Use
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteWalletId(wallet.id)} disabled={busy}>
                          <Trash2 className="h-4 w-4"/>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <InternalWalletCreateModal
        open={createOpen}
        busy={busy}
        error={formError}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <InternalWalletImportModal
        open={importOpen}
        busy={busy}
        error={formError}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
      <InternalWalletSuccessModal
        open={createdWallet != null}
        wallet={createdWallet}
        onClose={() => setCreatedWallet(null)}
      />
      <ConfirmModal
        open={confirmDeleteWalletId != null}
        title="Remove local wallet"
        message={(
          <div className="space-y-3">
            <p>
              This only removes the wallet from this browser. It does not delete the Hedera account or make funds unrecoverable if you still have the backup.
            </p>
            {deletingWallet ? (
                <div className="rounded-lg border px-3 py-2 font-mono text-xs break-all">
                {deletingWallet.label}
                <br/>
                {formatWalletAddressLabel(deletingWallet.identity.accountId ?? deletingWallet.identity.evmAddress)}
              </div>
            ) : null}
          </div>
        )}
        confirmLabel={busy ? "Removing..." : "Remove wallet"}
        confirmVariant="destructive"
        onConfirm={handleDeleteInternal}
        onCancel={() => setConfirmDeleteWalletId(null)}
      />
    </>
  );
};

export default WalletDisconnected;
