import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  UserRound,
  PlusCircle,
  FileUp,
  Trash2,
  ExternalLink,
  RefreshCcw,
  Shield,
  LockKeyhole,
  LogOut,
  HandCoins,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import CopyableField from "@/components/CopyableField";
import { accountCurrencies, formatAccountBalance } from "@/lib/internalWallet/currencies";
import AccountSendDialog from "@/components/wallet/AccountSendDialog";
import AccountReceiveDialog from "@/components/wallet/AccountReceiveDialog";
import { useWallet } from "@/context/WalletContext";
import { getConfig, DEFAULT_PAYMENT_CURRENCY } from "@/config";
import AppVersion from "@/components/AppVersion";
import type {
  InternalWalletBackupItem,
  InternalWalletStatus,
} from "@/lib/internalWallet/types";
import AccountDialog from "@/components/wallet/AccountDialog";
import AccountUnlockButton from "@/components/wallet/AccountUnlockButton";
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
  | "send"
  | "receive"
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
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const currencies = accountCurrencies(network);
  const [backup, setBackup] = useState<InternalWalletBackupItem[] | null>(null),
    [created, setCreated] = useState<InternalWalletStatus | null>(null),
    [removeId, setRemoveId] = useState<string | null>(null);
  const active = useMemo(
    () =>
      internalWallets.find((account) => account.id === activeInternalWalletId),
    [internalWallets, activeInternalWalletId],
  );
  const deleting = internalWallets.find((account) => account.id === removeId),
    paymentBalance = walletBalances.find((balance) => balance.tokenId.toLowerCase() === DEFAULT_PAYMENT_CURRENCY.tokenId.toLowerCase());
  const wasOpen = useRef(false),
    running = useRef(false);
  const refresh = wallet.refreshActiveInternalWallet,
    refreshList = wallet.refreshInternalWallets;
  useEffect(() => {
    if (open && !wasOpen.current) {
      setError(null);
      void (
        walletAddress && walletKind === "internal" ? refresh() : refreshList()
      ).catch(() =>
        setError("Could not update account details. Please try again."),
      );
    }
    wasOpen.current = open;
  }, [open, walletAddress, walletKind, refresh, refreshList]);
  useEffect(() => {
    onBusyChange(busy || wallet.walletActionPending);
    return () => onBusyChange(false);
  }, [busy, wallet.walletActionPending, onBusyChange]);
  useEffect(() => {
    setBackup(null);
    setShowAllCurrencies(false);
    setAction(null);
    setError(null);
  }, [walletAddress, network]);
  useEffect(() => {
    if (wallet.walletLocked) setBackup(null);
  }, [wallet.walletLocked]);
  useEffect(() => {
    if (!backup) return;
    const clear = () => setBackup(null),
      timer = window.setTimeout(clear, 60_000);
    window.addEventListener("pagehide", clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", clear);
    };
  }, [backup]);
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
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(
        message === "Incorrect passphrase."
          ? "Incorrect password. Please try again."
          : message === "Invalid English BIP-39 recovery phrase."
            ? "Check your recovery words and their order, then try again."
            : message.includes("already exists")
              ? "This account is already saved in this browser. Select it from your account list."
              : "The account action could not be completed. Check your details and try again.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const modalOpen = Boolean(action || created),
    blocked = busy || wallet.walletActionPending;
  return (
    <>
      <PopoverContent
        aria-label="Account"
        align="end"
        collisionPadding={8}
        style={modalOpen ? { display: "none" } : undefined}
        onInteractOutside={(event) => {
          if (modalOpen || blocked) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (modalOpen || blocked) event.preventDefault();
        }}
        className={
          walletAddress
            ? "w-[min(44rem,calc(100vw-1rem))] max-h-[min(calc(100dvh-1rem),var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain space-y-5 p-4 sm:p-5"
            : "w-[min(26rem,calc(100vw-1rem))] max-h-[min(calc(100dvh-1rem),var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain space-y-4 p-4 sm:p-5"
        }
      >
        {walletAddress ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  {walletKind === "internal"
                    ? "Picomart account"
                    : "Connected account"}
                </p>
                <h2 className="text-lg font-semibold">
                  {walletKind === "internal"
                    ? (active?.label ?? "My account")
                    : "Connected account"}
                </h2>
              </div>
              <span className="rounded-full border px-2 py-1 text-xs">
                {wallet.walletLocked
                  ? "Locked"
                  : paymentBalance?.raw === 0n
                    ? "Needs funds"
                    : "Ready"}
              </span>
            </div>
            <div
              data-wallet-columns
              className={
                walletKind === "internal"
                  ? "grid gap-5 sm:grid-cols-2"
                  : "space-y-5"
              }
            >
              <div className="min-w-0 space-y-4">
                <div className="rounded-xl border p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Receiving address
                  </p>
                  <CopyableField
                    value={walletAddress}
                    length={20}
                    mdLength={24}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use Receive to view a QR code and the supported currencies.
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Advanced details
                    </summary>
                    <a
                      href={
                        getConfig(network).explorerBaseUrl +
                        "/address/" +
                        walletAddress
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View account record
                    </a>
                  </details>
                </div>
                {walletKind === "internal" && (
                  <>
                    <AccountUnlockButton onStart={onClose} />
                    <p className="text-xs text-muted-foreground">
                      This account is saved in this browser. Recovery words let
                      you restore access on another device.
                    </p>
                    <details className="rounded-xl border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Account settings
                      </summary>
                      <div className="mt-3 space-y-2">
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          disabled={blocked}
                          onClick={() => show("backup")}
                        >
                          <Shield className="h-4 w-4" />
                          Save recovery words
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          disabled={blocked}
                          onClick={() => show("protect")}
                        >
                          <LockKeyhole className="h-4 w-4" />
                          Change password
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          disabled={blocked || wallet.walletLocked}
                          onClick={() => void run(wallet.lockInternalWallet)}
                        >
                          <LockKeyhole className="h-4 w-4" />
                          Lock account
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-destructive"
                          disabled={blocked}
                          onClick={() =>
                            show("remove", activeInternalWalletId ?? undefined)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove from this device
                        </Button>
                      </div>
                    </details>
                  </>
                )}
              </div>
              <div className="min-w-0 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Available balance</h3>
                    {walletKind === "internal" && (
                      <Button
                        aria-label="Refresh balances"
                        variant="ghost"
                        size="icon"
                        disabled={blocked}
                        onClick={() => void run(refresh)}
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {walletKind === "internal" ? (
                    <div className="space-y-2">
                      {currencies
                        .filter(
                          (currency) =>
                            showAllCurrencies ||
                            currency.tokenId.toLowerCase() === DEFAULT_PAYMENT_CURRENCY.tokenId.toLowerCase() ||
                            (walletBalances.find(
                              (balance) =>
                                balance.tokenId.toLowerCase() ===
                                currency.tokenId.toLowerCase(),
                            )?.raw ?? 0n) > 0n,
                        )
                        .map((currency) => {
                          const balance = walletBalances.find(
                            (item) =>
                              item.tokenId.toLowerCase() ===
                              currency.tokenId.toLowerCase(),
                          );
                          return (
                            <div
                              key={currency.tokenId}
                              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                            >
                              <span className="flex items-center gap-2 text-sm">
                                <img src={currency.img} alt="" className="h-6 w-6 shrink-0 rounded-full"/>
                                {currency.symbol}
                              </span>
                              <span className="min-w-0 break-all text-right font-semibold tabular-nums" title={balance ? `${balance.formatted} ${currency.symbol}` : undefined}>
                                {balance ? formatAccountBalance(balance.raw, balance.decimals) : "—"}
                              </span>
                            </div>
                          );
                        })}
                      <button
                        type="button"
                        className="text-xs text-primary underline underline-offset-4"
                        onClick={() => setShowAllCurrencies((value) => !value)}
                      >
                        {showAllCurrencies
                          ? "Show funded currencies"
                          : "Show all currencies"}
                      </button>
                      {!walletBalances.length && (
                        <p className="text-sm text-muted-foreground">
                          Balance is not available yet. Refresh to check.
                        </p>
                      )}
                      {network === PICOMART_TEMPO_CONFIG.network && (
                        <p className="text-xs text-muted-foreground">
                          Demo funds have no real monetary value.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Check your balance in the connected app.
                    </p>
                  )}
                </div>
                {walletKind === "internal" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={
                          blocked ||
                          !currencies.length ||
                          !wallet.walletAdapter?.tempo
                        }
                        onClick={() => show("send")}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                        Send
                      </Button>
                      <Button
                        variant="outline"
                        disabled={blocked || !currencies.length}
                        onClick={() => show("receive")}
                      >
                        <ArrowDownLeft className="h-4 w-4" />
                        Receive
                      </Button>
                    </div>
                    {paymentBalance?.raw === 0n && (
                      <p className="text-sm text-muted-foreground">
                        Add {DEFAULT_PAYMENT_CURRENCY.symbol} before publishing or making payments. It
                        covers payments and transaction fees.
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      className="w-full"
                      disabled={blocked}
                      onClick={() => show("funding")}
                    >
                      <HandCoins className="h-4 w-4" />
                      {network === PICOMART_TEMPO_CONFIG.network ? "Add test funds" : "Add funds"}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  disabled={blocked}
                  onClick={() =>
                    void run(async () => {
                      await wallet.disconnect();
                      onClose();
                    })
                  }
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                Start selling with Picomart
              </h2>
              <p className="text-sm text-muted-foreground">
                Create an account in this browser, or restore one you already
                have.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={blocked}
              onClick={() => show("create")}
            >
              <PlusCircle className="h-4 w-4" />
              Create account
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={blocked}
              onClick={() => show("import")}
            >
              <FileUp className="h-4 w-4" />
              Restore account
            </Button>
            {!!internalWallets.length && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Accounts on this device</h3>
                {internalWallets.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-2 rounded-xl border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {account.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {account.locked ? "Password required" : "Ready"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        disabled={blocked}
                        onClick={() =>
                          void run(async () => {
                            await wallet.connectInternalWallet(account.id);
                            onClose();
                          })
                        }
                      >
                        Use account
                      </Button>
                      <Button
                        aria-label={
                          "Remove " + account.label + " from this device"
                        }
                        variant="ghost"
                        size="icon"
                        disabled={blocked}
                        onClick={() => show("remove", account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!!wallet.availableExternalProviders.length && (
              <details className="border-t pt-3">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Advanced connection options
                </summary>
                <div className="mt-3 grid gap-2">
                  {wallet.availableExternalProviders.map((provider) => (
                    <Button
                      key={provider.id}
                      variant="outline"
                      disabled={blocked}
                      onClick={() =>
                        void run(async () => {
                          await wallet.connect({
                            kind: "external",
                            chain: "tempo",
                            providerId: provider.id,
                          });
                          onClose();
                        })
                      }
                    >
                      <UserRound className="h-4 w-4" />
                      Connect {provider.name}
                    </Button>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        {error && !action && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <AppVersion className="pt-2"/>
      </PopoverContent>
      <InternalWalletCreateModal
        open={action === "create"}
        busy={blocked}
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
        busy={blocked}
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
        onBackup={() => {
          setCreated(null);
          show("backup");
        }}
      />
      <InternalWalletBackupModal
        key={backup ? "revealed" : "empty"}
        open={action === "backup"}
        busy={blocked}
        error={error}
        items={backup}
        onClose={closeAction}
        onReveal={() =>
          run(async () => {
            setBackup(await wallet.revealInternalWalletBackup());
          })
        }
      />
      <InternalWalletProtectModal
        open={action === "protect"}
        busy={blocked}
        error={error}
        onClose={closeAction}
        onSubmit={(input) =>
          run(async () => {
            await wallet.changeInternalWalletPassphrase(input);
            setAction(null);
          })
        }
      />
      <AccountDialog
        open={action === "remove"}
        title="Remove account from this device"
        busy={blocked}
        onClose={closeAction}
      >
        <p className="text-sm text-muted-foreground">
          This removes access from this browser. Your account and funds remain
          available if you have your recovery words or original private key.
          Make sure you have saved them first.
        </p>
        <p className="font-medium">{deleting?.label}</p>
        <CopyableField
          value={deleting?.identity.evmAddress ?? walletAddress ?? ""}
          length={24}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={blocked} onClick={closeAction}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={blocked || !removeId}
            onClick={() =>
              void run(async () => {
                await wallet.removeInternalWallet(removeId!);
                if (removeId === activeInternalWalletId) onClose();
                setAction(null);
                setRemoveId(null);
              })
            }
          >
            {busy ? "Removing?" : "Remove from this device"}
          </Button>
        </div>
      </AccountDialog>
      {open && action === "send" && (
        <AccountSendDialog
          key={`${walletAddress}:${network}`}
          onClose={closeAction}
          onBusyChange={setBusy}
        />
      )}
      {open && action === "receive" && (
        <AccountReceiveDialog
          key={`${walletAddress}:${network}`}
          onClose={closeAction}
        />
      )}
      <InternalWalletBootstrapModal
        open={action === "funding"}
        network={network}
        faucetUrl=""
        title={network === PICOMART_TEMPO_CONFIG.network ? "Add test funds" : "Add funds"}
        message={`${DEFAULT_PAYMENT_CURRENCY.symbol} is the currency used for payments and transaction fees.}`}
        identity={wallet.walletIdentity}
        onClose={closeAction}
      />
    </>
  );
}
