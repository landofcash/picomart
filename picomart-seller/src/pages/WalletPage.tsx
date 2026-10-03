import { useEffect, useMemo, useRef, useState } from "react";
import {
  Wallet,
  PlusCircle,
  FileUp,
  Trash2,
  ExternalLink,
  RefreshCcw,
  Shield,
  LockKeyhole,
  LogOut,
  HandCoins,
} from "lucide-react";
import { createPortal } from "react-dom";
import { PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import CopyableField from "@/components/CopyableField";
import TokenIcon from "@/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";
import { getConfig } from "@/config";
import type {
  InternalWalletBackupItem,
  InternalWalletStatus,
} from "@/lib/internalWallet/types";
import InternalWalletCreateModal from "@/components/wallet/InternalWalletCreateModal";
import InternalWalletImportModal from "@/components/wallet/InternalWalletImportModal";
import InternalWalletSuccessModal from "@/components/wallet/InternalWalletSuccessModal";
import InternalWalletBackupModal from "@/components/wallet/InternalWalletBackupModal";
import InternalWalletProtectModal from "@/components/wallet/InternalWalletProtectModal";
import InternalWalletBootstrapModal from "@/components/wallet/InternalWalletBootstrapModal";

type Action =
  | "create"
  | "import"
  | "backup"
  | "protect"
  | "remove"
  | "funding"
  | null;
export default function WalletPage({
  open,
  onClose,
  onBusyChange,
}: {
  open: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const wallet = useWallet();
  const {
    walletAddress,
    walletKind,
    walletBalances,
    internalWallets,
    activeInternalWalletId,
    network,
  } = wallet;
  const [action, setAction] = useState<Action>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<InternalWalletBackupItem[] | null>(null),
    [created, setCreated] = useState<InternalWalletStatus | null>(null),
    [removeId, setRemoveId] = useState<string | null>(null);
  const active = useMemo(
    () => internalWallets.find((w) => w.id === activeInternalWalletId),
    [internalWallets, activeInternalWalletId]
  );
  const deleting = internalWallets.find((w) => w.id === removeId);
  const pathUsd = walletBalances.find((b) => b.symbol === "PathUSD");
  const wasOpen = useRef(false),
    fundingShown = useRef<string | null>(null);
  const refresh = wallet.refreshActiveInternalWallet,
    refreshList = wallet.refreshInternalWallets;
  useEffect(() => {
    if (open && !wasOpen.current) {
      setError(null);
      void (
        walletAddress && walletKind === "internal" ? refresh() : refreshList()
      ).catch((e) =>
        setError(e instanceof Error ? e.message : "Cannot refresh wallet.")
      );
    }
    wasOpen.current = open;
  }, [open, walletAddress, walletKind, refresh, refreshList]);
  useEffect(() => {
    onBusyChange(busy || wallet.walletActionPending);
    return () => onBusyChange(false);
  }, [busy, wallet.walletActionPending, onBusyChange]);
  useEffect(() => {
    const key = network + ":" + activeInternalWalletId;
    if (
      walletAddress &&
      walletKind === "internal" &&
      pathUsd?.raw === 0n &&
      fundingShown.current !== key &&
      !action &&
      !created
    ) {
      fundingShown.current = key;
      setAction("funding");
    }
  }, [
    walletAddress,
    walletKind,
    pathUsd,
    network,
    activeInternalWalletId,
    action,
    created,
  ]);
  function show(next: Action, id?: string) {
    setError(null);
    setBackup(null);
    setRemoveId(id ?? null);
    setAction(next);
  }
  function closeAction() {
    if (!busy && !wallet.walletActionPending) {
      setAction(null);
      setBackup(null);
      setError(null);
      setRemoveId(null);
    }
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet action failed.");
    } finally {
      setBusy(false);
    }
  }
  const modalOpen = Boolean(action || created);
  const customDialog = (title: string, body: React.ReactNode) =>
    createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      >
        <div className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-background p-6 shadow-xl space-y-5">
          <h2 className="text-xl font-semibold">{title}</h2>
          {body}
        </div>
      </div>,
      document.body
    );
  return (
    <>
      <PopoverContent
        aria-label="Wallet"
        align="end"
        collisionPadding={8}
        onInteractOutside={(e) => {
          if (modalOpen || busy || wallet.walletActionPending)
            e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (modalOpen || busy || wallet.walletActionPending)
            e.preventDefault();
        }}
        className={
          walletAddress
            ? "w-[min(44rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain space-y-4 p-4 sm:max-w-[calc(100vw-1.5rem)] sm:space-y-5 sm:p-5"
            : "w-[min(26rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain p-4 text-sm shadow-lg space-y-4 sm:space-y-5"
        }
      >
        {walletAddress ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {walletKind === "internal"
                    ? "Internal wallet"
                    : "Connected wallet"}
                </div>
                <div className="text-lg font-semibold">
                  {active?.label ??
                    (walletKind === "internal"
                      ? "Internal wallet"
                      : "External wallet")}
                </div>
              </div>
            </div>
            <div
              data-wallet-columns
              className={
                walletKind === "internal"
                  ? "grid gap-5 lg:grid-cols-2"
                  : "space-y-5"
              }
            >
              <div className="min-w-0 space-y-5">
                <div className="rounded-xl border p-4 space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Wallet address
                    </div>
                    <CopyableField
                      value={walletAddress}
                      length={32}
                      mdLength={32}
                    />
                  </div>
                  {walletKind === "internal" && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Status
                      </div>
                      <div className="text-sm font-medium">
                        {wallet.walletLocked
                          ? "Locked"
                          : pathUsd?.raw === 0n
                          ? "Needs PathUSD"
                          : "Ready"}
                      </div>
                    </div>
                  )}
                  <a
                    href={
                      getConfig(network).explorerBaseUrl +
                      "/address/" +
                      walletAddress
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs text-blue-600 hover:underline"
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    View on explorer
                  </a>
                </div>
                {walletKind === "internal" && pathUsd?.raw === 0n && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <div className="font-medium text-blue-900">
                      Fund your wallet
                    </div>
                    <div className="text-sm text-blue-800">
                      PathUSD covers payments and Tempo network fees.
                    </div>
                    <Button variant="outline" onClick={() => show("funding")}>
                      <HandCoins className="mr-2 h-4 w-4" />
                      Funding instructions
                    </Button>
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Balances
                    </div>
                    {walletKind === "internal" && (
                      <Button
                        aria-label="Refresh balances"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(refresh)}
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {walletKind === "internal" ? (
                    <div className="space-y-2">
                      {walletBalances.map((b) => (
                        <div
                          key={b.tokenId}
                          className="flex items-center justify-between rounded-lg border px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <TokenIcon assetId={b.tokenId} size={16} />
                            <div className="text-sm font-medium">
                              {b.symbol}
                            </div>
                          </div>
                          <div className="text-sm font-semibold">
                            {b.formatted}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                      Balance details are managed by the connected external
                      wallet.
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {walletKind === "internal" && (
                    <>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        disabled={busy}
                        onClick={() => show("backup")}
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        Back up wallet
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        disabled={busy}
                        onClick={() => show("protect")}
                      >
                        <LockKeyhole className="mr-2 h-4 w-4" />
                        Change passphrase
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        disabled={busy || wallet.walletLocked}
                        onClick={() => void run(wallet.lockInternalWallet)}
                      >
                        <LockKeyhole className="mr-2 h-4 w-4" />
                        Lock wallet
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-destructive"
                        disabled={busy}
                        onClick={() =>
                          show("remove", activeInternalWalletId ?? undefined)
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove local wallet
                      </Button>
                    </>
                  )}
                  <Button
                    className="w-full justify-start bg-red-500 hover:bg-red-600 text-white"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await wallet.disconnect();
                        onClose();
                      })
                    }
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
                {walletKind === "internal" && !wallet.walletCanTransact && (
                  <div className="text-xs text-muted-foreground">
                    Marketplace signing requires an unlocked wallet and enough
                    PathUSD for payments and network fees.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <div className="text-sm font-semibold">Start with a wallet</div>
              <div className="text-sm text-muted-foreground">
                Create a built-in wallet in this browser to try Picomart, or
                connect an external wallet you already use.
              </div>
            </div>
            {wallet.availableExternalProviders?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  External wallets
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {wallet.availableExternalProviders.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await wallet.connect({
                            kind: "external",
                            chain: "tempo",
                            providerId: p.id,
                          });
                          onClose();
                        })
                      }
                    >
                      <Wallet className="mr-2 h-4 w-4" />
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Built-in wallet
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Create, import, use, or remove encrypted wallets stored only
                    in this browser.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => show("create")}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => show("import")}
                  >
                    <FileUp className="mr-2 h-4 w-4" />
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
                  {internalWallets.map((w) => (
                    <div key={w.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{w.label}</div>
                          <div className="font-mono text-xs text-muted-foreground break-all">
                            {w.identity.evmAddress.slice(0, 10) +
                              "\u2026" +
                              w.identity.evmAddress.slice(-8)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {w.lifecycleState === "ready" && (
                            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                              Ready
                            </span>
                          )}
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await wallet.connectInternalWallet(w.id);
                                onClose();
                              })
                            }
                          >
                            Use
                          </Button>
                          <Button
                            aria-label={"Remove " + w.label}
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => show("remove", w.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {error && !action && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
      </PopoverContent>
      <InternalWalletCreateModal
        open={action === "create"}
        busy={busy}
        error={error}
        onClose={closeAction}
        onCreate={(input) =>
          run(async () => {
            const result = await wallet.createInternalWallet(input);
            setAction(null);
            onClose();
            setCreated(result);
          })
        }
      />
      <InternalWalletImportModal
        open={action === "import"}
        busy={busy}
        error={error}
        onClose={closeAction}
        onImport={(input) =>
          run(async () => {
            await wallet.importInternalWallet(input);
            setAction(null);
            onClose();
          })
        }
      />
      <InternalWalletSuccessModal
        open={created !== null}
        wallet={created}
        onClose={() => setCreated(null)}
      />
      <InternalWalletBackupModal
        key={backup ? "revealed" : "empty"}
        open={action === "backup"}
        busy={busy || wallet.walletActionPending}
        error={error}
        items={backup}
        onClose={closeAction}
        onReveal={() =>
          run(async () => {
            setBackup(
              (await wallet.revealInternalWalletBackup()).filter(
                (item) => item.kind === "mnemonic"
              )
            );
          })
        }
      />
      <InternalWalletProtectModal
        open={action === "protect"}
        busy={busy}
        error={error}
        onClose={closeAction}
        onSubmit={(input) =>
          run(async () => {
            await wallet.changeInternalWalletPassphrase(input);
            setAction(null);
          })
        }
      />
      {action === "remove" &&
        customDialog(
          "Remove local wallet",
          <>
            <p className="text-sm">
              This removes local browser access only. It does not affect funds
              recoverable from your backup.
            </p>
            <div className="rounded-lg border px-3 py-2 font-mono text-xs break-all">
              {deleting?.label}
              <br />
              {deleting?.identity.evmAddress ?? walletAddress}
            </div>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={closeAction}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy || !removeId}
                onClick={() =>
                  void run(async () => {
                    await wallet.removeInternalWallet(removeId!);
                    if (removeId === activeInternalWalletId) onClose();
                    setAction(null);
                    setRemoveId(null);
                  })
                }
              >
                {busy ? "Removing..." : "Remove wallet"}
              </Button>
            </div>
          </>
        )}
      <InternalWalletBootstrapModal
        open={action === "funding"}
        network={network}
        faucetUrl=""
        title="Fund your wallet"
        message="PathUSD covers payments and Tempo network fees."
        identity={wallet.walletIdentity}
        onClose={closeAction}
      />
    </>
  );
}
