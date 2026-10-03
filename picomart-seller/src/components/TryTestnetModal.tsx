import React, {useEffect, useMemo, useState} from "react";
import {X, HandCoins, Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useWallet} from "@/context/WalletContext";
import genericWalletLogo from "@/assets/wallet.svg";
import ConfirmModal from "@/components/wallet/ConfirmModal";
import InternalWalletCreateModal from "@/components/wallet/InternalWalletCreateModal";
import InternalWalletImportModal from "@/components/wallet/InternalWalletImportModal";
import InternalWalletSuccessModal from "@/components/wallet/InternalWalletSuccessModal";
import type {InternalWalletStatus} from "@/lib/internalWallet/types.ts";
import {faucetAccountUrl, getConfig} from "@/config";

interface TryTestnetModalProps {
  open: boolean;
  onClose: () => void;
}

const TryTestnetModal: React.FC<TryTestnetModalProps> = ({open, onClose}) => {
  const {
    network,
    switchNetwork,
    availableExternalProviders,
    setExternalProviderId,
    connect,
    internalWallets,
    activeInternalWalletId,
    refreshInternalWallets,
    connectInternalWallet,
    createInternalWallet,
    importInternalWallet,
    removeInternalWallet,
  } = useWallet();

  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdWallet, setCreatedWallet] = useState<InternalWalletStatus | null>(null);

  useEffect(() => {
    if (open) {
      void refreshInternalWallets();
    }
  }, [open, refreshInternalWallets]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const activeInternalWallet = useMemo(() => {
    return internalWallets.find(wallet => wallet.id === activeInternalWalletId) ?? null;
  }, [activeInternalWalletId, internalWallets]);

  if (!open) {
    return null;
  }

  const deletingWallet = confirmDeleteWalletId
    ? internalWallets.find(wallet => wallet.id === confirmDeleteWalletId) ?? null
    : null;

  const handleCreate = async (input: { label?: string; passphrase: string }) => {
    try {
      setBusy(true);
      setFormError(null);
      if (network !== "testnet") {
        await switchNetwork("testnet");
      }
      const created = await createInternalWallet(input);
      setCreateOpen(false);
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
      if (network !== "testnet") {
        await switchNetwork("testnet");
      }
      await importInternalWallet(input);
      setImportOpen(false);
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to import wallet.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveWallet = async () => {
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

  const faucetUrl = getConfig("testnet").hedera.faucetUrl;
  const faucetTargetUrl = faucetUrl
    ? faucetAccountUrl(
      faucetUrl,
      createdWallet?.identity.evmAddress
        ?? activeInternalWallet?.identity.evmAddress
        ?? (internalWallets.length === 1 ? internalWallets[0]?.identity.evmAddress : null),
    )
    : null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#041724]/55 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-[#8bb9d5]/30 bg-[linear-gradient(180deg,#fcfeff_0%,#f2f8fc_100%)] shadow-[0_32px_90px_-40px_rgba(3,23,36,0.45)]"
          onClick={(event) => event.stopPropagation()}
        >
            <div className="relative h-28 bg-gradient-to-r from-[#0a2940] via-[#0c4d73] to-[#0596d6] px-6 py-5 text-white">
            <button onClick={onClose} className="absolute right-4 top-4 text-white/90 hover:text-white" aria-label="Close">
              <X className="h-6 w-6"/>
            </button>
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold">Try Picomart on Hedera Testnet</h3>
              <p className="max-w-2xl text-sm text-sky-50/90">
                Create or import an encrypted built-in wallet in this browser, fund it on Hedera testnet, then start testing marketplace transactions.
              </p>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="flex items-center justify-between rounded-xl border border-[#a8c8dc]/45 bg-white/80 p-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Network</div>
                <div className="text-sm font-medium">{network.toUpperCase()}</div>
              </div>
              {network !== "testnet" ? (
                <Button onClick={() => void switchNetwork("testnet")}>Switch to testnet</Button>
              ) : (
                <Button asChild variant="outline">
                  <a href={faucetTargetUrl ?? faucetUrl} target="_blank" rel="noreferrer">
                    <HandCoins className="mr-2 h-4 w-4"/>
                    Open faucet
                  </a>
                </Button>
              )}
            </div>

            {availableExternalProviders.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-[#a8c8dc]/45 bg-white/80 p-4">
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
                        onClose();
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

              <div className="space-y-3 rounded-xl border border-[#a8c8dc]/45 bg-white/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Built-in wallet</div>
                  <div className="text-sm text-muted-foreground">
                    Saved wallets stay local to this browser and are encrypted with your passphrase.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setFormError(null);
                    setCreateOpen(true);
                  }}>
                    Create
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setFormError(null);
                    setImportOpen(true);
                  }}>
                    Import
                  </Button>
                </div>
              </div>

              {internalWallets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#a8c8dc]/60 bg-[#f7fbfe] p-4 text-sm text-muted-foreground">
                  No built-in wallets saved locally yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {internalWallets.map((wallet) => (
                    <div key={wallet.id} className="rounded-xl border border-[#a8c8dc]/45 bg-[#f8fbfe] p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{wallet.label}</div>
                          <div className="font-mono text-xs text-muted-foreground break-all">
                            {wallet.identity.accountId ?? wallet.identity.evmAddress}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {wallet.lifecycleState === "ready" ? "Ready" : wallet.lifecycleState === "funded_or_alias_created" ? "Needs HBAR" : "Local only"}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" onClick={async () => {
                          await connectInternalWallet(wallet.id);
                          onClose();
                        }}>
                          Use
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteWalletId(wallet.id)}>
                          <Trash2 className="h-4 w-4"/>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
        onClose={() => {
          setCreatedWallet(null);
          onClose();
        }}
      />
      <ConfirmModal
        open={confirmDeleteWalletId != null}
        title="Remove local wallet"
        message={(
          <div className="space-y-3">
            <p>This removes only local browser access. It does not delete the Hedera account or any funds.</p>
            {deletingWallet ? (
              <div className="rounded-lg border px-3 py-2 font-mono text-xs break-all">
                {deletingWallet.label}
                <br/>
                {deletingWallet.identity.accountId ?? deletingWallet.identity.evmAddress}
              </div>
            ) : null}
          </div>
        )}
        confirmLabel={busy ? "Removing..." : "Remove wallet"}
        confirmVariant="destructive"
        onConfirm={handleRemoveWallet}
        onCancel={() => setConfirmDeleteWalletId(null)}
      />
    </>
  );
};

export default TryTestnetModal;
