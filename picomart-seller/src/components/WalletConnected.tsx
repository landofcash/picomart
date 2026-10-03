import React, {useEffect, useMemo, useRef, useState} from "react";
import {
  CircleAlert,
  ExternalLink,
  HandCoins,
  LockKeyhole,
  LogOut,
  RefreshCcw,
  Shield,
  Trash2,
} from "lucide-react";
import {toast} from "sonner";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Button} from "@/components/ui/button";
import {useWallet} from "@/context/WalletContext";
import {explorerAccountUrl, getAvailableNetworkIds, getConfig} from "@/config";
import walletSvg from "@/assets/wallet.svg";
import CopyableField from "@/components/CopyableField";
import TokenIcon from "@/components/TokenIcon";
import ConfirmModal from "@/components/wallet/ConfirmModal";
import InternalWalletBackupModal from "@/components/wallet/InternalWalletBackupModal";
import InternalWalletProtectModal from "@/components/wallet/InternalWalletProtectModal";
import InternalWalletBootstrapModal from "@/components/wallet/InternalWalletBootstrapModal";
import type {InternalWalletBackupItem} from "@/lib/internalWallet/types.ts";
import {truncateString} from "@/lib/cryptoFormat.ts";

const WalletConnected: React.FC = () => {
  const {
    walletAddress,
    walletKind,
    walletIdentity,
    walletLifecycleState,
    walletLocked,
    walletCanTransact,
    walletBootstrapTitle,
    walletBootstrapMessage,
    walletBalances,
    network,
    internalWallets,
    activeInternalWalletId,
    refreshActiveInternalWallet,
    changeInternalWalletPassphrase,
    disconnect,
    lockInternalWallet,
    revealInternalWalletBackup,
    removeInternalWallet,
    associateInternalToken,
    switchNetwork,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupItems, setBackupItems] = useState<InternalWalletBackupItem[] | null>(null);
  const [protectOpen, setProtectOpen] = useState(false);
  const [protectBusy, setProtectBusy] = useState(false);
  const [protectError, setProtectError] = useState<string | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [associatingTokenId, setAssociatingTokenId] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const lastAutoBootstrapKeyRef = useRef<string | null>(null);

  const activeInternalWallet = useMemo(() => {
    return internalWallets.find(wallet => wallet.id === activeInternalWalletId) ?? null;
  }, [activeInternalWalletId, internalWallets]);

  useEffect(() => {
    if (open && !wasOpenRef.current && walletKind === "internal") {
      void refreshActiveInternalWallet();
    }
    wasOpenRef.current = open;
  }, [open, refreshActiveInternalWallet, walletKind]);

  useEffect(() => {
    if (!backupOpen) {
      setBackupItems(null);
      setBackupError(null);
    }
  }, [backupOpen]);

  useEffect(() => {
    if (walletKind !== "internal" || !activeInternalWalletId || !walletBootstrapMessage || walletCanTransact) {
      lastAutoBootstrapKeyRef.current = null;
      return;
    }

    const bootstrapKey = `${network}:${activeInternalWalletId}:${walletLifecycleState ?? "unknown"}`;
    if (lastAutoBootstrapKeyRef.current === bootstrapKey) {
      return;
    }

    lastAutoBootstrapKeyRef.current = bootstrapKey;
    setBootstrapOpen(true);
  }, [
    activeInternalWalletId,
    network,
    walletBootstrapMessage,
    walletCanTransact,
    walletKind,
    walletLifecycleState,
  ]);

  if (!walletAddress) {
    return null;
  }

  const hbarBalance = walletBalances[0];
  const networkConfig = getConfig(network);
  const walletButtonLabel = /^\d+\.\d+\.\d+$/.test(walletAddress.trim())
    ? walletAddress
    : truncateString(walletAddress, 18);
  const walletStatusLabel = walletLifecycleState === "funded_or_alias_created"
    ? "Needs HBAR"
    : walletLifecycleState === "ready"
      ? "Ready"
      : null;

  const handleRevealBackup = async () => {
    try {
      setBackupBusy(true);
      setBackupError(null);
      const items = (await revealInternalWalletBackup()).filter(item => item.kind === "mnemonic");
      setBackupItems(items);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Failed to reveal wallet backup.");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleProtectWallet = async (input: { currentPassphrase?: string; nextPassphrase: string }) => {
    try {
      setProtectBusy(true);
      setProtectError(null);
      await changeInternalWalletPassphrase(input);
      setProtectOpen(false);
    } catch (error) {
      setProtectError(error instanceof Error ? error.message : "Failed to update wallet passphrase.");
    } finally {
      setProtectBusy(false);
    }
  };

  const handleRemoveWallet = async () => {
    if (!activeInternalWalletId) {
      return;
    }

    await removeInternalWallet(activeInternalWalletId);
    setConfirmRemoveOpen(false);
  };

  const handleAssociateToken = async (tokenId: string) => {
    try {
      setAssociatingTokenId(tokenId);
      await associateInternalToken(tokenId);
      await refreshActiveInternalWallet();
      toast.success(`Token ${tokenId} associated.`);
    } catch (error) {
      console.error("Failed to associate token:", error);
      toast.error(error instanceof Error ? error.message : "Failed to associate token.");
    } finally {
      setAssociatingTokenId(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Wallet menu"
            className="flex items-center gap-2 rounded-full border border-primary/30 bg-background px-2 py-1 text-sm hover:bg-accent/40"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
              <img src={walletSvg} alt="Wallet" className="h-4 w-4"/>
            </span>
            <span className="hidden sm:block font-mono">
              {walletButtonLabel}
            </span>
            {walletKind === "internal" && hbarBalance ? (
              <span className="hidden md:block text-xs text-muted-foreground">
                {hbarBalance.formatted} {hbarBalance.symbol}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          collisionPadding={8}
          className="w-[min(44rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain space-y-4 p-4 sm:w-176 sm:max-w-[calc(100vw-1.5rem)] sm:space-y-5 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {walletKind === "internal" ? "Internal wallet" : "Connected wallet"}
              </div>
              <div className="text-lg font-semibold">
                {activeInternalWallet?.label ?? (walletKind === "internal" ? "Internal wallet" : "External wallet")}
              </div>
            </div>
            <div className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground uppercase">
              {network}
            </div>
          </div>

          <div className={walletKind === "internal" ? "grid gap-5 lg:grid-cols-2" : "space-y-5"}>
            <div className="space-y-5">
              <div className="rounded-xl border p-4 space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Current address</div>
                  <CopyableField value={walletAddress} length={32} mdLength={32}/>
                </div>

                {walletKind === "internal" ? (
                  <>
                    {walletIdentity?.accountId ? (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Account ID</div>
                        <CopyableField value={walletIdentity.accountId} length={32} mdLength={32}/>
                      </div>
                    ) : null}

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Alias / EVM address</div>
                      <CopyableField value={walletIdentity?.evmAddress ?? ""} length={32} mdLength={32}/>
                    </div>

                    {walletStatusLabel ? (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Status</div>
                        <div className="text-sm font-medium">{walletStatusLabel}</div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <a
                  href={explorerAccountUrl(walletIdentity?.accountId ?? walletIdentity?.evmAddress ?? walletAddress, network)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs text-blue-600 hover:underline"
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5"/>
                  View on explorer
                </a>
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Network</div>
                <div className="flex flex-wrap gap-2">
                  {getAvailableNetworkIds().map((availableNetwork) => (
                    <Button
                      key={availableNetwork}
                      size="sm"
                      variant={availableNetwork === network ? "default" : "outline"}
                      onClick={() => void switchNetwork(availableNetwork)}
                    >
                      {availableNetwork.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              {walletKind === "internal" && walletBootstrapMessage ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <div className="font-medium text-blue-900">{walletBootstrapTitle}</div>
                  <div className="text-sm text-blue-800">{walletBootstrapMessage}</div>
                  <Button variant="outline" onClick={() => setBootstrapOpen(true)}>
                    <HandCoins className="mr-2 h-4 w-4"/>
                    Funding instructions
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Balances</div>
                  {walletKind === "internal" ? (
                    <Button variant="ghost" size="sm" onClick={() => void refreshActiveInternalWallet()}>
                      <RefreshCcw className="h-4 w-4"/>
                    </Button>
                  ) : null}
                </div>

                {walletKind === "internal" ? (
                  <div className="space-y-2">
                    {walletBalances.map((balance) => (
                      <div key={balance.tokenId} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <TokenIcon assetId={balance.tokenId} className="h-4 w-4" alt={balance.symbol}/>
                          <div>
                            <div className="text-sm font-medium">{balance.symbol}</div>
                            {!balance.associated ? (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <CircleAlert className="h-3 w-3"/>
                                Token not associated
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!balance.associated && balance.tokenId !== "0.0.0" && walletIdentity?.accountId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleAssociateToken(balance.tokenId)}
                              disabled={associatingTokenId === balance.tokenId || !walletCanTransact}
                            >
                              {associatingTokenId === balance.tokenId ? "Associating..." : "Associate"}
                            </Button>
                          ) : null}
                          <div className="text-sm font-semibold">{balance.formatted}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                    Balance details are managed by the connected external wallet.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {walletKind === "internal" ? (
                  <>
                    <Button variant="outline" className="w-full justify-start" onClick={() => setBackupOpen(true)}>
                      <Shield className="mr-2 h-4 w-4"/>
                      Back up wallet
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => setProtectOpen(true)}>
                      <LockKeyhole className="mr-2 h-4 w-4"/>
                      Change passphrase
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => void lockInternalWallet()} disabled={walletLocked}>
                      <LockKeyhole className="mr-2 h-4 w-4"/>
                      Lock wallet
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => setConfirmRemoveOpen(true)}>
                      <Trash2 className="mr-2 h-4 w-4"/>
                      Remove local wallet
                    </Button>
                  </>
                ) : null}

                <Button className="w-full justify-start bg-red-500 hover:bg-red-600 text-white" onClick={() => void disconnect()}>
                  <LogOut className="mr-2 h-4 w-4"/>
                  Disconnect
                </Button>
              </div>

              {walletKind === "internal" && !walletCanTransact ? (
                <div className="text-xs text-muted-foreground">
                  Marketplace signing stays disabled until this wallet is activated on-chain and funded with 1-5 HBAR to pay Hedera network fees for catalog creation and other transactions.
                </div>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <InternalWalletBackupModal
        open={backupOpen}
        busy={backupBusy}
        error={backupError}
        items={backupItems}
        onClose={() => setBackupOpen(false)}
        onReveal={handleRevealBackup}
      />
      <InternalWalletProtectModal
        open={protectOpen}
        busy={protectBusy}
        error={protectError}
        onClose={() => setProtectOpen(false)}
        onSubmit={handleProtectWallet}
      />
      <InternalWalletBootstrapModal
        open={bootstrapOpen}
        network={network}
        faucetUrl={networkConfig.hedera.faucetUrl}
        title={walletBootstrapTitle}
        message={walletBootstrapMessage}
        identity={walletIdentity}
        onClose={() => setBootstrapOpen(false)}
      />
      <ConfirmModal
        open={confirmRemoveOpen}
        title="Remove local wallet"
        message={(
          <div className="space-y-3">
            <p>
              This removes local browser access only. It does not delete the Hedera account or affect funds recoverable from your backup.
            </p>
            <div className="rounded-lg border px-3 py-2 font-mono text-xs break-all">
              {walletIdentity?.accountId ?? walletIdentity?.evmAddress ?? walletAddress}
            </div>
          </div>
        )}
        confirmLabel="Remove wallet"
        confirmVariant="destructive"
        onConfirm={handleRemoveWallet}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </>
  );
};

export default WalletConnected;

