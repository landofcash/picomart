import {useMemo, useState} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  LogOut,
  PlusCircle,
  RefreshCcw,
  Shield,
  Trash2,
  Wallet as WalletIcon,
} from "lucide-react";
import {Link, useSearchParams} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import AppShellCard from "@/components/AppShellCard";
import CopyableField from "@/components/CopyableField";
import TokenIcon from "@/components/TokenIcon";
import {getConfig} from "@/config";
import {useWallet} from "@/context/WalletContext";
import {truncateString} from "@/lib/cryptoFormat";

type FormMode = "none" | "create" | "import" | "protect";
type ImportMode = "mnemonic" | "privateKey";

function getLifecycleBadgeLabel(lifecycleState: "local_only" | "funded_or_alias_created" | "ready" | null): string | null {
  if (lifecycleState === "funded_or_alias_created") {
    return "Needs PathUSD";
  }
  if (lifecycleState === "ready") {
    return "Ready";
  }
  return null;
}

function formatWalletAddressLabel(address: string) {
  return truncateString(address, 20);
}

function WalletPage() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const safeReturnTo = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  const {
    walletAddress,
    walletIdentity,
    walletKind,
    walletLifecycleState,
    walletLocked,
    walletCanTransact,
    walletBootstrapTitle,
    walletBootstrapMessage,
    walletBalances,
    walletActionPending,
    walletActionLabel,
    network,
    internalWallets,
    activeInternalWalletId,
    refreshInternalWallets,
    refreshActiveInternalWallet,
    connectInternalWallet,
    createInternalWallet,
    importInternalWallet,
    removeInternalWallet,
    lockInternalWallet,
    unlockInternalWallet,
    changeInternalWalletPassphrase,
    revealInternalWalletBackup,
    disconnect,
  } = useWallet();

  const [formMode, setFormMode] = useState<FormMode>("none");
  const [importMode, setImportMode] = useState<ImportMode>("mnemonic");
  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupItems, setBackupItems] = useState<Array<{kind: string; label: string; value: string}> | null>(null);
  const [backupRevealed, setBackupRevealed] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<string | null>(null);

  const activeWallet = useMemo(() => {
    return internalWallets.find(wallet => wallet.id === activeInternalWalletId) ?? null;
  }, [activeInternalWalletId, internalWallets]);

  const networkConfig = useMemo(() => getConfig(network), [network]);
  const lifecycleBadge = getLifecycleBadgeLabel(walletLifecycleState);

  const resetForm = () => {
    setLabel("");
    setMaterial("");
    setPassphrase("");
    setConfirmPassphrase("");
    setCurrentPassphrase("");
  };

  const withBusy = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
      setPageError(null);
      setPageNotice(null);
      try {
        await action();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Wallet action failed.");
      } finally {
        setBusyAction(null);
      }
  };

  const handleCreate = async () => {
    if (!passphrase || passphrase !== confirmPassphrase) {
      setPageError("Passphrase confirmation does not match.");
      return;
    }

    await withBusy("create", async () => {
      const created = await createInternalWallet({
        label: label.trim() || undefined,
        passphrase,
      });
      setPageNotice(`${created.label} is ready in this browser.`);
      setFormMode("none");
      resetForm();
    });
  };

  const handleImport = async () => {
    if (!passphrase || passphrase !== confirmPassphrase) {
      setPageError("Passphrase confirmation does not match.");
      return;
    }

    await withBusy("import", async () => {
      const payload = {
        label: label.trim() || undefined,
        passphrase,
        mnemonic: importMode === "mnemonic" ? material.trim().replace(/\s+/g, " ") : undefined,
        privateKey: importMode === "privateKey" ? material.trim() : undefined,
      };
      await importInternalWallet(payload);
      setPageNotice("Wallet imported successfully.");
      setFormMode("none");
      resetForm();
    });
  };

  const handleUnlock = async () => {
    await withBusy("unlock", async () => {
      await unlockInternalWallet(unlockPassphrase);
      setUnlockPassphrase("");
      setPageNotice("Wallet unlocked for this session.");
    });
  };

  const handleChangePassphrase = async () => {
    if (!passphrase || passphrase !== confirmPassphrase) {
      setPageError("New passphrase confirmation does not match.");
      return;
    }

    await withBusy("protect", async () => {
      await changeInternalWalletPassphrase({
        currentPassphrase,
        nextPassphrase: passphrase,
      });
      setCurrentPassphrase("");
      setPassphrase("");
      setConfirmPassphrase("");
      setFormMode("none");
      setPageNotice("Wallet passphrase updated.");
    });
  };

  const handleRevealBackup = async () => {
    await withBusy("backup", async () => {
      const items = await revealInternalWalletBackup(walletLocked ? backupPassphrase : undefined);
      setBackupItems(items);
      setBackupRevealed(false);
      if (walletLocked && backupPassphrase) {
        await refreshActiveInternalWallet();
        setBackupPassphrase("");
      }
    });
  };

  const handleDeleteWallet = async (walletId: string) => {
    await withBusy(`delete:${walletId}`, async () => {
      await removeInternalWallet(walletId);
      setConfirmDeleteWalletId(null);
      setBackupItems(null);
    });
  };


  const showSavedWallets = internalWallets.length > 0;

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-row items-center gap-4">
            <Link to={safeReturnTo}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5"/>
              </Button>
            </Link>
            <CardTitle className="text-2xl font-bold">Wallet</CardTitle>
          </div>
          <CardDescription>
            Create, unlock, and use your Tempo wallet from one secure place.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {walletActionPending && walletActionLabel ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {walletActionLabel}
            </div>
          ) : null}

          {pageError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {pageError}
            </div>
          ) : null}

          {pageNotice ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {pageNotice}
            </div>
          ) : null}

          {walletAddress && walletKind === "internal" ? (
            <>
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Connected wallet</div>
                    <div className="text-lg font-semibold">{activeWallet?.label ?? "Internal wallet"}</div>
                  </div>
                  {lifecycleBadge ? (
                    <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                      {lifecycleBadge}
                    </span>
                  ) : null}
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Current address</div>
                  <CopyableField value={walletAddress} length={28} mdLength={32}/>
                </div>


                <div>
                  <div className="text-xs text-muted-foreground mb-1">EVM address</div>
                  <CopyableField value={walletIdentity?.evmAddress ?? ""} length={28} mdLength={32}/>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={networkConfig.explorerBaseUrl + '/address/' + (walletIdentity?.evmAddress ?? walletAddress ?? '')}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-4 w-4"/>
                      Explorer
                    </a>
                  </Button>
                  {safeReturnTo !== "/" ? (
                    <Button asChild size="sm">
                      <Link to={safeReturnTo}>Continue</Link>
                    </Button>
                  ) : null}
                </div>
              </div>

              {walletLocked ? (
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <LockKeyhole className="h-4 w-4"/>
                    Unlock wallet
                  </div>
                  <Input
                    type="password"
                    placeholder="Enter wallet passphrase"
                    value={unlockPassphrase}
                    onChange={(event) => setUnlockPassphrase(event.target.value)}
                  />
                  <Button onClick={() => void handleUnlock()} disabled={!unlockPassphrase || busyAction === "unlock"}>
                    {busyAction === "unlock" ? "Unlocking..." : "Unlock"}
                  </Button>
                </div>
              ) : null}

              {walletBootstrapMessage ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <div className="font-medium text-blue-900">{walletBootstrapTitle}</div>
                  <div className="text-sm text-blue-800">{walletBootstrapMessage}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void withBusy("refresh-bootstrap", refreshActiveInternalWallet)}
                    >
                      <RefreshCcw className="h-4 w-4"/>
                      Refresh status
                    </Button>
                  </div>
                </div>
              ) : null}

	              <div className="rounded-xl border p-4 space-y-3">
	                <div className="flex items-center justify-between gap-3">
	                  <div>
	                    <div className="text-sm font-medium">Balances</div>
	                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
	                      Tempo
	                    </div>
	                  </div>
	                  <Button
	                    variant="outline"
	                    size="sm"
	                    onClick={() => void withBusy("refresh", async () => {
	                      await refreshInternalWallets();
	                      await refreshActiveInternalWallet();
	                    })}
	                  >
	                    <RefreshCcw className="h-4 w-4"/>
	                    Refresh
	                  </Button>
	                </div>
	                <div className="space-y-2">
	                  {walletBalances.map(balance => (
                    <div key={balance.tokenId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <TokenIcon assetId={balance.tokenId} size={20}/>
                        <div>
                          <div className="font-medium">{balance.symbol}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        
                        <div className="text-sm font-semibold">{balance.formatted}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {!walletCanTransact ? (
                  <div className="text-xs text-muted-foreground">
                    Transactions require an unlocked wallet and PathUSD for payments and network fees.
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                    <Shield className="h-4 w-4"/>
                    Back up wallet
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBackupOpen(value => !value)}
                  >
                    {backupOpen ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                    {backupOpen ? "Hide" : "Open"}
                  </Button>
                </div>
                {backupOpen ? (
                  <>
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
                        <div>
                          Anyone with this recovery phrase can control your wallet and funds. Reveal it only on a trusted device and store it offline.
                        </div>
                      </div>
                    </div>
                    {backupItems ? (
                      <div className="space-y-2">
                        {backupItems.length > 0 ? backupItems.map(item => (
                          <div key={item.kind} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs uppercase tracking-[0.2em] text-red-700">{item.label}</div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setBackupRevealed(value => !value)}
                              >
                                {backupRevealed ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                {backupRevealed ? "Hide" : "Reveal"}
                              </Button>
                            </div>
                            <div className={`rounded-md bg-red-50 px-3 py-2 font-mono text-sm break-all transition ${backupRevealed ? "" : "select-none blur-sm"}`}>
                              {item.value}
                            </div>
                          </div>
                        )) : (
                          <div className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                            This wallet does not have a mnemonic recovery phrase available.
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-muted-foreground">
                          Reveal the recovery phrase only on a device you trust.
                        </div>
                        {walletLocked ? (
                          <Input
                            type="password"
                            placeholder="Passphrase to reveal recovery phrase"
                            value={backupPassphrase}
                            onChange={(event) => setBackupPassphrase(event.target.value)}
                          />
                        ) : null}
                        <Button
                          variant="outline"
                          onClick={() => void handleRevealBackup()}
                          disabled={(walletLocked && !backupPassphrase) || busyAction === "backup"}
                        >
                          {busyAction === "backup" ? "Revealing..." : "Reveal recovery phrase"}
                        </Button>
                      </>
                    )}
                  </>
                ) : null}
              </div>

              <div className="rounded-xl border p-4 space-y-3">
                <div className="text-sm font-medium">Security</div>
                {formMode === "protect" ? (
                  <div className="space-y-3">
                    <Input
                      type="password"
                      placeholder="Current passphrase"
                      value={currentPassphrase}
                      onChange={(event) => setCurrentPassphrase(event.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="New passphrase"
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="Confirm new passphrase"
                      value={confirmPassphrase}
                      onChange={(event) => setConfirmPassphrase(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void handleChangePassphrase()} disabled={busyAction === "protect"}>
                        {busyAction === "protect" ? "Saving..." : "Update passphrase"}
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setFormMode("none");
                        setCurrentPassphrase("");
                        setPassphrase("");
                        setConfirmPassphrase("");
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      setFormMode("protect");
                      setPageError(null);
                    }}>
                      <KeyRound className="h-4 w-4"/>
                      Change passphrase
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void lockInternalWallet()} disabled={walletLocked}>
                      <LockKeyhole className="h-4 w-4"/>
                      Lock
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void disconnect()}>
                      <LogOut className="h-4 w-4"/>
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <WalletIcon className="h-4 w-4"/>
                No wallet connected
              </div>
              <div className="text-sm text-muted-foreground">
                Create or import an encrypted local wallet, or reconnect one already saved on this device.
              </div>
              <div className="flex gap-2">
                <Button variant={formMode === "create" ? "default" : "outline"} onClick={() => {
                  setFormMode(formMode === "create" ? "none" : "create");
                  setPageError(null);
                  resetForm();
                }}>
                  <PlusCircle className="h-4 w-4"/>
                  Create
                </Button>
                <Button variant={formMode === "import" ? "default" : "outline"} onClick={() => {
                  setFormMode(formMode === "import" ? "none" : "import");
                  setPageError(null);
                  resetForm();
                }}>
                  Import
                </Button>
              </div>
            </div>
          )}

          {formMode === "create" ? (
            <div className="rounded-xl border p-4 space-y-3">
              <div className="text-sm font-medium">Create internal wallet</div>
              <Input
                placeholder="Wallet label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
              <Input
                type="password"
                placeholder="Passphrase"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm passphrase"
                value={confirmPassphrase}
                onChange={(event) => setConfirmPassphrase(event.target.value)}
              />
              <div className="text-xs text-muted-foreground">
                This passphrase protects the wallet locally. The app cannot recover it for you.
              </div>
              <Button onClick={() => void handleCreate()} disabled={busyAction === "create"}>
                {busyAction === "create" ? "Creating..." : "Create wallet"}
              </Button>
            </div>
          ) : null}

          {formMode === "import" ? (
            <div className="rounded-xl border p-4 space-y-3">
              <div className="text-sm font-medium">Import internal wallet</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={importMode === "mnemonic" ? "default" : "outline"}
                  onClick={() => setImportMode("mnemonic")}
                >
                  Recovery phrase
                </Button>
                <Button
                  size="sm"
                  variant={importMode === "privateKey" ? "default" : "outline"}
                  onClick={() => setImportMode("privateKey")}
                >
                  Private key
                </Button>
              </div>
              <Input
                placeholder="Wallet label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
              <textarea
                value={material}
                onChange={(event) => setMaterial(event.target.value)}
                rows={importMode === "mnemonic" ? 4 : 3}
                spellCheck={false}
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder={importMode === "mnemonic" ? "Enter 12 or 24 words" : "Enter 64-character hex private key"}
              />
              <Input
                type="password"
                placeholder="Passphrase"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm passphrase"
                value={confirmPassphrase}
                onChange={(event) => setConfirmPassphrase(event.target.value)}
              />
              <Button onClick={() => void handleImport()} disabled={busyAction === "import"}>
                {busyAction === "import" ? "Importing..." : "Import wallet"}
              </Button>
            </div>
          ) : null}

          {showSavedWallets ? (
            <div className="rounded-xl border p-4 space-y-3">
              <div className="text-sm font-medium">Saved wallets</div>
              <div className="space-y-2">
                {internalWallets.map(wallet => {
                  const isActive = wallet.id === activeInternalWalletId;
                  const badge = getLifecycleBadgeLabel(wallet.lifecycleState);
                  const addressLabel = wallet.identity.accountId ?? wallet.identity.evmAddress;
                  return (
                    <div key={wallet.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{wallet.label}</div>
                          <div className="font-mono text-xs text-muted-foreground break-all">
                            {formatWalletAddressLabel(addressLabel)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isActive ? (
                            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Connected</span>
                          ) : null}
                          {badge ? (
                            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!isActive ? (
                          <Button
                            size="sm"
                            onClick={() => void withBusy(`connect:${wallet.id}`, async () => {
                              await connectInternalWallet(wallet.id);
                              setBackupItems(null);
                            })}
                          >
                            Connect
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDeleteWalletId(confirmDeleteWalletId === wallet.id ? null : wallet.id)}
                        >
                          <Trash2 className="h-4 w-4"/>
                          Delete
                        </Button>
                      </div>
                      {confirmDeleteWalletId === wallet.id ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                          <div className="text-sm text-muted-foreground">
                            This removes local browser access only. Recoverable funds stay recoverable with the mnemonic.
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => void handleDeleteWallet(wallet.id)}
                              disabled={busyAction === `delete:${wallet.id}`}
                            >
                              {busyAction === `delete:${wallet.id}` ? "Removing..." : "Remove wallet"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteWalletId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </AppShellCard>
    </div>
  );
}

export default WalletPage;
