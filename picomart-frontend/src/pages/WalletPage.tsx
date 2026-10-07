import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCcw,
  Shield,
  LockKeyhole,
  Wallet,
  UserRound,
  Coins,
  UnlockKeyhole,
  ArrowRight,
  HardDriveDownload,
  KeyRound,
  Save,
  X,
  LogOut,
  Plus,
  RotateCcw,
  Check,
  Trash2,
  LoaderCircle,
  ArrowDownToLine,
  Send,
  MoreHorizontal,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import WalletActionDialog from "@/components/wallet/WalletActionDialog";
import WalletSendDialog from "@/components/wallet/WalletSendDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PICOMART_TEMPO_CONFIG } from "@picomart/config";
import AppShellCard from "@/components/AppShellCard";
import CopyableField from "@/components/CopyableField";
import TokenIcon from "@/components/TokenIcon";
import { getConfig } from "@/config";
import { useWallet } from "@/context/WalletContext";
import { truncateString } from "@/lib/cryptoFormat";

const secondaryButtonClass =
  "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100";
const outlinedButtonClass =
  "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:bg-background dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100";
const recoveryButtonClass =
  "border-amber-400 bg-white text-amber-900 hover:bg-amber-50 hover:text-amber-950 dark:border-amber-700 dark:bg-background dark:text-amber-200 dark:hover:bg-amber-950 dark:hover:text-amber-100";
const quietButtonClass =
  "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100";
const removeButtonClass =
  "text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300";

type FormMode = "none" | "create" | "import" | "protect" | "unlock" | "send";
type ImportMode = "mnemonic" | "privateKey";

function formatWalletAddressLabel(address: string) {
  return truncateString(address, 20);
}

function formatBalance(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const cents =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0").slice(0, 2)) +
    (Number(fraction[2] ?? "0") >= 5 ? 1n : 0n);
  if (cents === 0n && /[1-9]/.test(value)) return "<0.01";
  return `${new Intl.NumberFormat("en-US").format(cents / 100n)}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function WalletPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = searchParams.get("returnTo");
  const safeReturnTo =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/";

  const {
    walletAddress,
    walletIdentity,
    walletKind,
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

  const receiveHref =
    "/wallet/receive" +
    (safeReturnTo !== "/"
      ? "?" + new URLSearchParams({ returnTo: safeReturnTo }).toString()
      : "");
  const [formMode, setFormMode] = useState<FormMode>("none");
  const [sendToken, setSendToken] = useState<string | undefined>();
  const [balanceMenu, setBalanceMenu] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("mnemonic");
  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupItems, setBackupItems] = useState<Array<{
    kind: string;
    label: string;
    value: string;
  }> | null>(null);
  const [backupRevealed, setBackupRevealed] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const busyRef = useRef(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<
    string | null
  >(null);
  const [deleteBackupConfirmed, setDeleteBackupConfirmed] = useState(false);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const [balanceStatus, setBalanceStatus] = useState<{
    key: string;
    loading: boolean;
    failed: boolean;
  } | null>(null);
  const balanceKey = `${network}:${walletKind}:${activeInternalWalletId ?? ""}`;
  const balancesLoading =
    balanceStatus?.key !== balanceKey || balanceStatus.loading;
  const balancesFailed =
    balanceStatus?.key === balanceKey && balanceStatus.failed;
  const refreshBalancesRef = useRef(refreshActiveInternalWallet);
  useEffect(() => {
    refreshBalancesRef.current = refreshActiveInternalWallet;
  }, [refreshActiveInternalWallet]);
  useEffect(() => {
    if (walletKind !== "internal" || !activeInternalWalletId) return;
    let current = true;
    setBalanceStatus({ key: balanceKey, loading: true, failed: false });
    void refreshBalancesRef.current().then(
      () => {
        if (current)
          setBalanceStatus({ key: balanceKey, loading: false, failed: false });
      },
      () => {
        if (current)
          setBalanceStatus({ key: balanceKey, loading: false, failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, [activeInternalWalletId, walletKind, balanceKey, balanceRefresh]);

  useEffect(() => {
    setBackupItems(null);
    setBackupRevealed(false);
    setBackupPassphrase("");
    setConfirmDeleteWalletId(null);
    setDeleteBackupConfirmed(false);
  }, [walletAddress]);
  useEffect(() => {
    if (walletLocked) {
      setBackupItems(null);
      setBackupRevealed(false);
    }
  }, [walletLocked]);

  const activeWallet = useMemo(() => {
    return (
      internalWallets.find((wallet) => wallet.id === activeInternalWalletId) ??
      null
    );
  }, [activeInternalWalletId, internalWallets]);

  const networkConfig = useMemo(() => getConfig(network), [network]);

  const resetForm = () => {
    setLabel("");
    setMaterial("");
    setPassphrase("");
    setConfirmPassphrase("");
    setCurrentPassphrase("");
    setUnlockPassphrase("");
  };

  const dialogOpen =
    formMode !== "none" || backupOpen || confirmDeleteWalletId !== null;
  const walletToRemove = internalWallets.find(
    (wallet) => wallet.id === confirmDeleteWalletId,
  );
  const closeDialogs = () => {
    if (busyRef.current || walletActionPending) return;
    setFormMode("none");
    setBackupOpen(false);
    setBackupItems(null);
    setBackupRevealed(false);
    setBackupPassphrase("");
    setConfirmDeleteWalletId(null);
    setDeleteBackupConfirmed(false);
    setPageError(null);
    resetForm();
  };

  const withBusy = async (key: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyAction(key);
    setPageError(null);
    setPageNotice(null);
    try {
      await action();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Wallet action failed.",
      );
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  };

  const handleCreate = async () => {
    if (!passphrase || passphrase !== confirmPassphrase) {
      setPageError("Password confirmation does not match.");
      return;
    }

    await withBusy("create", async () => {
      const created = await createInternalWallet({
        label: label.trim() || undefined,
        passphrase,
      });
      setPageNotice(
        `${created.label} is saved on this device. Back it up before adding funds.`,
      );
      setBackupOpen(true);
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
        mnemonic:
          importMode === "mnemonic"
            ? material.trim().replace(/\s+/g, " ")
            : undefined,
        privateKey: importMode === "privateKey" ? material.trim() : undefined,
      };
      await importInternalWallet(payload);
      setPageNotice("Wallet imported successfully.");
      setFormMode("none");
      resetForm();
    });
  };

  const handleUnlock = async () => {
    if (!unlockPassphrase || busyRef.current) return;
    await withBusy("unlock", async () => {
      await unlockInternalWallet(unlockPassphrase);
      setUnlockPassphrase("");
      setFormMode("none");
      setPageNotice("Wallet unlocked for this session.");
    });
  };

  const handleChangePassphrase = async () => {
    if (!passphrase || passphrase !== confirmPassphrase) {
      setPageError("New password confirmation does not match.");
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
      setPageNotice("Wallet password updated.");
    });
  };

  const handleRevealBackup = async () => {
    await withBusy("backup", async () => {
      const items = await revealInternalWalletBackup(
        walletLocked ? backupPassphrase : undefined,
      );
      setBackupItems(items);
      setBackupRevealed(false);
      if (walletLocked && backupPassphrase) {
        await refreshActiveInternalWallet();
        setBackupPassphrase("");
      }
    });
  };

  const handleDeleteWallet = async (walletId: string) => {
    if (!deleteBackupConfirmed || confirmDeleteWalletId !== walletId) return;
    await withBusy(`delete:${walletId}`, async () => {
      await removeInternalWallet(walletId);
      setConfirmDeleteWalletId(null);
      setDeleteBackupConfirmed(false);
      setBackupItems(null);
    });
  };

  return (
    <div className="w-full flex items-start justify-center pb-2 sm:px-4 sm:pb-10">
      <AppShellCard className="w-full max-w-lg">
        <CardHeader className="grid-rows-1 gap-0 px-5 pb-0 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to={safeReturnTo}>
              <Button
                className={quietButtonClass}
                variant="ghost"
                size="icon"
                aria-label="Back"
              >
                <ArrowLeft />
              </Button>
            </Link>
            <CardTitle className="text-2xl font-bold tracking-tight">
              <h1>Account</h1>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="-mt-2 space-y-5 px-5 sm:px-6">
          {!dialogOpen && walletActionPending && walletActionLabel && (
            <p
              role="status"
              className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900"
            >
              {walletActionLabel}
            </p>
          )}
          {!dialogOpen && pageError && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {pageError}
            </p>
          )}
          {pageNotice && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              {pageNotice}
            </p>
          )}
          {walletAddress && walletKind === "internal" ? (
            <>
              <section
                className="space-y-3"
                aria-labelledby="last-active-account-title"
              >
                <div className="-mx-5 flex items-center justify-between gap-3 bg-muted/70 px-5 py-3 sm:-mx-6 sm:px-6">
                  <h2
                    id="last-active-account-title"
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <UserRound
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    Current Account
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${walletLocked ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}`}
                  >
                    {walletLocked ? "Locked" : "Unlocked"}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-base font-semibold break-words">
                    <Wallet
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {activeWallet?.label ?? "My wallet"}
                  </p>
                </div>
                <CopyableField
                  value={walletIdentity?.evmAddress ?? walletAddress}
                  showCopyIcon
                  small
                  className={`break-all ${quietButtonClass} [&>svg]:text-current`}
                />
                {walletLocked && (
                  <Button
                    className="w-full"
                    disabled={busyAction !== null || walletActionPending}
                    onClick={() => {
                      resetForm();
                      setPageError(null);
                      setFormMode("unlock");
                    }}
                  >
                    <UnlockKeyhole aria-hidden="true" /> Unlock Account
                  </Button>
                )}
                {!walletLocked && safeReturnTo !== "/" && (
                  <Button className="w-full" size="lg" asChild>
                    <Link to={safeReturnTo}>
                      <ArrowRight aria-hidden="true" />
                      Continue to payment
                    </Link>
                  </Button>
                )}
                {!walletCanTransact && !walletLocked && (
                  <p className="text-sm text-muted-foreground">
                    Payments are currently unavailable. You can still manage
                    your wallet.
                  </p>
                )}
              </section>
              {walletBootstrapTitle && walletBootstrapMessage && (
                <p role="status" className="text-sm text-muted-foreground">
                  {walletBootstrapMessage}
                </p>
              )}
              <section
                className="space-y-3"
                aria-labelledby="wallet-balances-title"
              >
                <div className="-mx-5 sm:-mx-6">
                  <div className="flex min-h-11 items-center justify-between bg-muted/70 px-5 sm:px-6">
                    <h2
                      id="wallet-balances-title"
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <Coins
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      Balances
                    </h2>
                    <div className="flex items-center gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className={quietButtonClass}
                      >
                        <a
                          href={
                            networkConfig.explorerBaseUrl +
                            "/address/" +
                            walletAddress
                          }
                          target="_blank"
                          rel="noreferrer"
                          aria-label="View history"
                          title="View history"
                        >
                          <ExternalLink aria-hidden="true" />
                          View history
                        </a>
                      </Button>
                      <Button
                        className={quietButtonClass}
                        variant="ghost"
                        size="icon"
                        aria-label="Refresh balances"
                        disabled={busyAction !== null || balancesLoading}
                        onClick={() => setBalanceRefresh((value) => value + 1)}
                      >
                        <RefreshCcw
                          className={balancesLoading ? "animate-spin" : ""}
                        />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-muted/35" aria-busy={balancesLoading}>
                    {walletBalances.map((balance) => (
                      <div
                        key={balance.tokenId}
                        className="flex min-h-14 min-w-0 items-center justify-between gap-2 px-5 py-1 text-sm sm:px-6"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <TokenIcon assetId={balance.tokenId} size={28} />
                          <span className="min-w-0">
                            <span
                              className="block font-medium break-all"
                              title={
                                PICOMART_TEMPO_CONFIG.tokens.find(
                                  (t) =>
                                    t.tokenId.toLowerCase() ===
                                    balance.tokenId.toLowerCase(),
                                )?.name
                              }
                            >
                              {balance.symbol}
                            </span>
                          </span>
                        </span>
                        <span
                          className="ml-auto text-right text-base font-semibold tabular-nums break-all"
                          title={balance.formatted}
                        >
                          {formatBalance(balance.formatted)}
                        </span>
                        <Popover
                          open={balanceMenu === balance.tokenId}
                          onOpenChange={(open) =>
                            setBalanceMenu(open ? balance.tokenId : null)
                          }
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 shrink-0"
                              aria-label={`${balance.symbol} actions`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-48 p-2">
                            <p className="px-2 py-1 text-xs text-muted-foreground">
                              {PICOMART_TEMPO_CONFIG.tokens.find(
                                (t) =>
                                  t.tokenId.toLowerCase() ===
                                  balance.tokenId.toLowerCase(),
                              )?.name ?? balance.symbol}
                            </p>
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => {
                                setBalanceMenu(null);
                                setSendToken(balance.tokenId);
                                setFormMode("send");
                              }}
                            >
                              <Send /> Send
                            </Button>
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => {
                                setBalanceMenu(null);
                                navigate(receiveHref);
                              }}
                            >
                              <ArrowDownToLine /> Receive
                            </Button>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ))}
                    {balancesFailed && (
                      <div
                        role="alert"
                        className="flex items-center justify-between gap-2 px-5 py-3 sm:px-6"
                      >
                        <p className="text-sm text-muted-foreground">
                          Couldn’t update balances. Please try again.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setBalanceRefresh((value) => value + 1)
                          }
                        >
                          <RefreshCcw /> Retry
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => {
                      setSendToken(undefined);
                      setFormMode("send");
                    }}
                  >
                    <Send /> Send
                  </Button>
                  <Button
                    variant="outline"
                    className={`w-full ${outlinedButtonClass}`}
                    onClick={() => {
                      resetForm();
                      setPageError(null);
                      navigate(receiveHref);
                    }}
                  >
                    <ArrowDownToLine aria-hidden="true" /> Receive
                  </Button>
                </div>
              </section>
              <section
                className="space-y-3"
                aria-labelledby="wallet-security-title"
              >
                <h2
                  id="wallet-security-title"
                  className="-mx-5 flex items-center gap-2 bg-muted/70 px-5 py-3 text-sm font-semibold sm:-mx-6 sm:px-6"
                >
                  <Shield
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Security & recovery
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Keep a private recovery backup to restore access on another
                  device.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className={`h-12 gap-1.5 px-2 text-xs ${secondaryButtonClass}`}
                    aria-expanded={backupOpen}
                    onClick={() => {
                      setPageError(null);
                      setBackupOpen(true);
                      setBackupItems(null);
                      setBackupRevealed(false);
                      setBackupPassphrase("");
                    }}
                  >
                    <HardDriveDownload aria-hidden="true" />
                    Back up
                  </Button>
                  <Button
                    variant="outline"
                    className={`h-12 gap-1.5 px-2 text-xs ${secondaryButtonClass}`}
                    onClick={() => {
                      resetForm();
                      setPageError(null);
                      setFormMode("protect");
                    }}
                  >
                    <KeyRound aria-hidden="true" />
                    Change password
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className={`h-12 gap-1.5 px-2 text-xs ${secondaryButtonClass}`}
                      disabled={walletLocked || busyAction !== null}
                      onClick={() =>
                        void withBusy("lock", async () => {
                          await lockInternalWallet();
                          setBackupItems(null);
                          setBackupRevealed(false);
                        })
                      }
                    >
                      <LockKeyhole /> Lock
                    </Button>
                    <Button
                      variant="outline"
                      className={`h-12 gap-1.5 px-2 text-xs ${secondaryButtonClass}`}
                      disabled={busyAction !== null}
                      onClick={() =>
                        void withBusy("disconnect", async () => {
                          await disconnect();
                          setBackupItems(null);
                        })
                      }
                    >
                      <LogOut aria-hidden="true" />
                      Close
                    </Button>
                  </div>
                </div>
              </section>
            </>
          ) : !internalWallets.length ? (
            <section
              className="space-y-3"
              aria-labelledby="account-setup-title"
            >
              <h2
                id="account-setup-title"
                className="-mx-5 flex items-center gap-2 bg-muted/70 px-5 py-3 text-sm font-semibold sm:-mx-6 sm:px-6"
              >
                <UserRound
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Set up your account
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Create a wallet to pay for orders, or restore one with your
                recovery phrase.
              </p>
              {!internalWallets.length && (
                <>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setPageError(null);
                      setFormMode("create");
                      resetForm();
                    }}
                  >
                    <Plus aria-hidden="true" /> Create account
                  </Button>
                  <Button
                    variant="outline"
                    className={`w-full ${outlinedButtonClass}`}
                    onClick={() => {
                      setPageError(null);
                      setFormMode("import");
                      setImportMode("mnemonic");
                      resetForm();
                    }}
                  >
                    <RotateCcw aria-hidden="true" /> Restore account
                  </Button>
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Shield
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    Your wallet is encrypted on this device. Keep your recovery
                    phrase to restore access.
                  </p>
                </>
              )}
            </section>
          ) : null}
          {internalWallets.length > 0 && (
            <section
              className="space-y-3"
              aria-labelledby="saved-wallets-title"
            >
              <h2
                id="saved-wallets-title"
                className="-mx-5 flex items-center gap-2 bg-muted/70 px-5 py-3 text-sm font-semibold sm:-mx-6 sm:px-6"
              >
                <Wallet
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Saved Accounts
              </h2>
              <div className="divide-y">
                {internalWallets.map((w) => (
                  <div
                    key={w.id}
                    className={`py-3 space-y-1 ${w.id === activeInternalWalletId ? "text-muted-foreground" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="min-w-0 flex-1 truncate text-sm font-medium"
                        title={w.label}
                      >
                        {w.label}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={removeButtonClass}
                          aria-label={`Remove ${w.label} from device`}
                          title="Remove from device"
                          disabled={busyAction !== null}
                          onClick={() => {
                            setDeleteBackupConfirmed(false);
                            setPageError(null);
                            setConfirmDeleteWalletId(w.id);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                        {w.id !== activeInternalWalletId ? (
                          <Button
                            className="gap-1.5 px-3 text-xs"
                            disabled={busyAction !== null}
                            onClick={() =>
                              void withBusy("connect:" + w.id, async () => {
                                await connectInternalWallet(w.id);
                                setBackupItems(null);
                              })
                            }
                          >
                            <Check aria-hidden="true" /> Open
                          </Button>
                        ) : (
                          <span className="flex min-h-11 items-center gap-1.5 px-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            <Check className="h-4 w-4" aria-hidden="true" />{" "}
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatWalletAddressLabel(
                        w.identity.accountId ?? w.identity.evmAddress,
                      )}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className={`px-2 text-xs ${outlinedButtonClass}`}
                  onClick={() => {
                    setPageError(null);
                    setFormMode("create");
                    resetForm();
                  }}
                >
                  <Plus aria-hidden="true" />
                  Create account
                </Button>
                <Button
                  variant="outline"
                  className={`px-2 text-xs ${outlinedButtonClass}`}
                  onClick={() => {
                    setPageError(null);
                    setFormMode("import");
                    setImportMode("mnemonic");
                    resetForm();
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  Restore account
                </Button>
              </div>
            </section>
          )}
        </CardContent>
        {formMode === "send" && (
          <WalletSendDialog initialToken={sendToken} onClose={closeDialogs} />
        )}
        {formMode === "unlock" && (
          <WalletActionDialog
            title="Unlock Account"
            description={`Enter the password for ${activeWallet?.label ?? "this account"}.`}
            busy={busyAction !== null || walletActionPending}
            error={pageError}
            status={walletActionPending ? walletActionLabel : null}
            onClose={closeDialogs}
          >
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleUnlock();
              }}
            >
              <label className="block space-y-2">
                <span className="text-sm">Password</span>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={unlockPassphrase}
                  onChange={(event) => setUnlockPassphrase(event.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="submit"
                  className="min-w-0 gap-1.5 px-2 text-xs"
                  disabled={!unlockPassphrase || busyAction !== null}
                >
                  {busyAction === "unlock" ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <UnlockKeyhole aria-hidden="true" />
                  )}
                  {busyAction === "unlock" ? "Unlocking..." : "Unlock Account"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`min-w-0 gap-1.5 px-2 text-xs ${outlinedButtonClass}`}
                  disabled={busyAction !== null}
                  onClick={closeDialogs}
                >
                  <X aria-hidden="true" /> Cancel
                </Button>
              </div>
            </form>
          </WalletActionDialog>
        )}
        {(formMode === "create" || formMode === "import") && (
          <WalletActionDialog
            title={formMode === "create" ? "Create account" : "Restore account"}
            description={
              formMode === "create"
                ? "Create an account saved on this device."
                : "Restore your account using its recovery phrase or private key."
            }
            busy={busyAction !== null || walletActionPending}
            error={pageError}
            status={walletActionPending ? walletActionLabel : null}
            onClose={closeDialogs}
          >
            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm">Wallet name (optional)</span>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="My wallet"
                />
              </label>
              {formMode === "import" && (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm">
                      {importMode === "mnemonic"
                        ? "Recovery phrase"
                        : "Private key"}
                    </span>
                    <textarea
                      aria-label={
                        importMode === "mnemonic"
                          ? "Recovery phrase"
                          : "Private key"
                      }
                      className="w-full min-h-28 rounded-lg border bg-background p-3 text-base"
                      autoComplete="off"
                      spellCheck={false}
                      value={material}
                      onChange={(e) => setMaterial(e.target.value)}
                      placeholder={
                        importMode === "mnemonic"
                          ? "Enter your 12 or 24 recovery words"
                          : "Enter your private key"
                      }
                    />
                  </label>
                  <details>
                    <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
                      Advanced restore options
                    </summary>
                    <label className="block space-y-2">
                      <span className="text-sm">Recovery type</span>
                      <select
                        className="w-full min-h-11 rounded-lg border bg-background p-2"
                        value={importMode}
                        onChange={(e) => {
                          setImportMode(e.target.value as ImportMode);
                          setMaterial("");
                        }}
                      >
                        <option value="mnemonic">Recovery phrase</option>
                        <option value="privateKey">Private key</option>
                      </select>
                    </label>
                  </details>
                </>
              )}
              <label className="block space-y-2">
                <span className="text-sm">Wallet password</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm">Confirm password</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                />
              </label>
              <p className="text-sm text-muted-foreground">
                This password protects your wallet on this device. Picomart
                cannot reset it. Save your recovery phrase to restore access.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="min-w-0 gap-1.5 px-2 text-xs"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void (formMode === "create"
                      ? handleCreate()
                      : handleImport())
                  }
                >
                  {busyAction ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : formMode === "create" ? (
                    <Plus aria-hidden="true" />
                  ) : (
                    <RotateCcw aria-hidden="true" />
                  )}
                  {busyAction
                    ? "Saving..."
                    : formMode === "create"
                      ? "Create account"
                      : "Restore account"}
                </Button>
                <Button
                  variant="outline"
                  className={`min-w-0 gap-1.5 px-2 text-xs ${outlinedButtonClass}`}
                  disabled={busyAction !== null}
                  onClick={closeDialogs}
                >
                  <X aria-hidden="true" />
                  Cancel
                </Button>
              </div>
            </div>
          </WalletActionDialog>
        )}
        {formMode === "protect" && (
          <WalletActionDialog
            title="Change password"
            description="Update the password that protects this account on this device."
            busy={busyAction !== null || walletActionPending}
            error={pageError}
            status={walletActionPending ? walletActionLabel : null}
            onClose={closeDialogs}
          >
            <div className="space-y-3">
              <label className="block space-y-2">
                <span className="text-sm">Current password</span>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassphrase}
                  onChange={(e) => setCurrentPassphrase(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm">New password</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm">Confirm new password</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="min-w-0 gap-1.5 px-2 text-xs"
                  disabled={busyAction !== null}
                  onClick={() => void handleChangePassphrase()}
                >
                  {busyAction === "protect" ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Save aria-hidden="true" />
                  )}
                  {busyAction === "protect" ? "Saving..." : "Save password"}
                </Button>
                <Button
                  className={`min-w-0 gap-1.5 px-2 text-xs ${outlinedButtonClass}`}
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={closeDialogs}
                >
                  <X aria-hidden="true" />
                  Cancel
                </Button>
              </div>
            </div>
          </WalletActionDialog>
        )}
        {backupOpen && (
          <WalletActionDialog
            title="Back up"
            description="Save your backup privately to restore access on another device. Your password alone cannot restore your account."
            busy={busyAction !== null || walletActionPending}
            error={pageError}
            status={walletActionPending ? walletActionLabel : null}
            onClose={closeDialogs}
          >
            <div className="space-y-3">
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Anyone with your recovery phrase can use your funds. Never share
                it.
              </p>
              {backupItems ? (
                <div className="space-y-3">
                  {backupItems.length ? (
                    backupItems.map((item) => (
                      <div key={item.kind} className="space-y-2">
                        <p className="text-sm font-medium">{item.label}</p>
                        <Button
                          className={recoveryButtonClass}
                          variant="outline"
                          onClick={() => setBackupRevealed((v) => !v)}
                        >
                          {backupRevealed ? <EyeOff /> : <Eye />}
                          {backupRevealed
                            ? "Hide recovery phrase"
                            : "Reveal recovery phrase"}
                        </Button>
                        {backupRevealed && (
                          <p className="rounded-lg bg-muted p-3 font-mono text-sm break-words">
                            {item.value}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm">
                      This wallet has no recovery phrase. Keep its original
                      recovery secret safe.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {walletLocked && (
                    <label className="block space-y-2">
                      <span className="text-sm">Wallet password</span>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        value={backupPassphrase}
                        onChange={(e) => setBackupPassphrase(e.target.value)}
                      />
                    </label>
                  )}
                  <Button
                    variant="outline"
                    className={recoveryButtonClass}
                    disabled={
                      busyAction !== null || (walletLocked && !backupPassphrase)
                    }
                    onClick={() => void handleRevealBackup()}
                  >
                    {busyAction === "backup" ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : (
                      <KeyRound aria-hidden="true" />
                    )}
                    {busyAction === "backup"
                      ? "Preparing backup..."
                      : "Open recovery phrase"}
                  </Button>
                </>
              )}
            </div>
          </WalletActionDialog>
        )}
        {walletToRemove && (
          <WalletActionDialog
            title="Remove account?"
            description={`Remove ${walletToRemove.label} from this device.`}
            busy={busyAction !== null || walletActionPending}
            error={pageError}
            status={walletActionPending ? walletActionLabel : null}
            onClose={closeDialogs}
          >
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">
                Before removing this account, save a backup outside this
                browser. Without it, you could lose access to your funds and
                orders.
              </p>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                  checked={deleteBackupConfirmed}
                  disabled={busyAction !== null}
                  onChange={(event) =>
                    setDeleteBackupConfirmed(event.target.checked)
                  }
                />
                <span className="text-xs leading-relaxed">
                  I have saved a backup on my device, outside this browser.
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="destructive"
                  className="min-w-0 gap-1.5 px-2 text-xs"
                  disabled={busyAction !== null || !deleteBackupConfirmed}
                  onClick={() => void handleDeleteWallet(walletToRemove.id)}
                >
                  <Trash2 aria-hidden="true" />
                  Remove account
                </Button>
                <Button
                  className={`min-w-0 gap-1.5 px-2 text-xs ${outlinedButtonClass}`}
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={closeDialogs}
                >
                  <Check aria-hidden="true" />
                  Keep account
                </Button>
              </div>
            </div>
          </WalletActionDialog>
        )}
      </AppShellCard>
    </div>
  );
}

export default WalletPage;
