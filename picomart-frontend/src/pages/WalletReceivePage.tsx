import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDownToLine,
  Check,
  ChevronRight,
  Copy,
  FlaskConical,
  LoaderCircle,
  RefreshCcw,
  Wallet,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { JsonRpcProvider } from "ethers";
import { PICOMART_TEMPO_CONFIG } from "@picomart/config";
import AppShellCard from "@/components/AppShellCard";
import CopyableField from "@/components/CopyableField";
import TokenIcon from "@/components/TokenIcon";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import { tempoNetworkLabel } from "@/lib/tempoNetworks";

export default function WalletReceivePage({
  mode = "choose",
}: {
  mode?: "choose" | "transfer" | "test-tokens";
}) {
  const {
    walletAddress,
    walletIdentity,
    network,
    refreshActiveInternalWallet,
  } = useWallet();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo");
  const query =
    returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? "?" + new URLSearchParams({ returnTo }).toString()
      : "";
  const [copied, setCopied] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const current = useRef(walletAddress);
  current.current = walletAddress;
  const mounted = useRef(true),
    running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const account = walletAddress
    ? (walletIdentity?.evmAddress ?? walletAddress)
    : null;
  useEffect(() => {
    setCopied(false);
    setError(null);
    setNotice(null);
  }, [account, mode]);
  const testnet =
    network === PICOMART_TEMPO_CONFIG.network && network === "moderato";
  const requestTokens = async () => {
    if (!account || !testnet || running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const rpc = new JsonRpcProvider(PICOMART_TEMPO_CONFIG.rpcUrl);
    try {
      if (
        Number((await rpc.getNetwork()).chainId) !==
        PICOMART_TEMPO_CONFIG.chainId
      )
        throw new Error("The network does not match this account.");
      if (
        current.current?.toLowerCase() !== account.toLowerCase() ||
        !mounted.current
      )
        return;
      const hashes: unknown = await rpc.send("tempo_fundAddress", [account]);
      if (
        !Array.isArray(hashes) ||
        hashes.length === 0 ||
        !hashes.every((hash) => /^0x[0-9a-fA-F]{64}$/.test(String(hash)))
      )
        throw new Error("Could not request test tokens. Try again shortly.");
      if (
        current.current?.toLowerCase() === account.toLowerCase() &&
        mounted.current
      ) {
        setNotice(
          "Test tokens requested. Refresh your balances after the transfer is confirmed.",
        );
        try {
          await refreshActiveInternalWallet();
        } catch {
          /* Balances can be refreshed later. */
        }
      }
    } catch (e) {
      if (mounted.current)
        setError(
          (e as { code?: string; message?: string }).code
            ? "Could not request test tokens. The faucet may be busy; try again shortly."
            : (e as Error).message,
        );
    } finally {
      rpc.destroy();
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const transferPath = "/wallet/receive/transfer" + query;
  return (
    <div className="w-full flex items-start justify-center pb-2 sm:px-4 sm:pb-10">
      <AppShellCard className="w-full max-w-lg">
        <CardHeader className="grid-rows-1 gap-0 px-5 pb-2 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label={
                mode === "choose" ? "Back to account" : "Back to receive"
              }
            >
              <Link
                to={(mode === "choose" ? "/wallet" : "/wallet/receive") + query}
              >
                <ArrowLeft />
              </Link>
            </Button>
            <CardTitle className="text-2xl font-bold">
              <h1>
                {mode === "choose"
                  ? "Receive"
                  : mode === "transfer"
                    ? "Transfer in"
                    : "Get test tokens"}
              </h1>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-5 sm:px-6">
          {mode === "test-tokens" && (
            <p className="text-xs font-medium text-muted-foreground">
              Tempo · {tempoNetworkLabel(network)}
            </p>
          )}
          {!account ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Open an account before receiving tokens.
              </p>
              <Button asChild className="w-full">
                <Link to={"/wallet" + query}>
                  <Wallet />
                  Open account
                </Link>
              </Button>
            </div>
          ) : mode === "choose" ? (
            <>
              <div className="space-y-3">
                <Link
                  to={transferPath}
                  className="flex min-h-24 items-center gap-4 bg-muted/40 p-4 transition-colors hover:bg-muted/70"
                >
                  <ArrowDownToLine className="h-7 w-7 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      Transfer from another wallet
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      Receive from a wallet or exchange using your address or QR
                      code.
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
                {testnet && (
                  <Link
                    to={"/wallet/receive/test-tokens" + query}
                    className="flex min-h-24 items-center gap-4 bg-muted/40 p-4 transition-colors hover:bg-muted/70"
                  >
                    <FlaskConical className="h-7 w-7 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        Get test tokens
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        Add free demo tokens to try payments on the test
                        network.
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                )}
              </div>
            </>
          ) : mode === "transfer" ? (
            <>
              <div className="flex justify-center bg-muted/30 py-5">
                <QRCodeSVG
                  value={account}
                  size={224}
                  level="M"
                  marginSize={4}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  role="img"
                  aria-label="Account address QR code"
                  className="h-auto max-w-full"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Your account address
                </p>
                <CopyableField
                  value={account}
                  showCopyIcon
                  small
                  className="break-all text-muted-foreground"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                className="w-full"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(account)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError(
                        "Could not copy the address. Try copying the full address above.",
                      ),
                    )
                }
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied!" : "Copy address"}
              </Button>
              <div
                className="flex flex-wrap items-center justify-center gap-3"
                aria-label="Account tokens"
              >
                {PICOMART_TEMPO_CONFIG.tokens.map((t) => (
                  <span
                    key={t.tokenId}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <TokenIcon assetId={t.tokenId} size={20} />
                    {t.symbol}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 bg-muted/40 p-4">
                <FlaskConical className="h-7 w-7 shrink-0" />
                <p className="text-sm leading-relaxed">
                  Test tokens let you try Picomart without spending real money.
                  They have no monetary value.
                </p>
              </div>
              <CopyableField
                value={account}
                small
                showCopyIcon
                className="break-all text-muted-foreground"
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="text-sm text-emerald-700 dark:text-emerald-400"
                >
                  {notice}
                </p>
              )}
              <Button
                className="w-full"
                disabled={busy || !testnet}
                onClick={() => void requestTokens()}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <FlaskConical />
                )}
                {busy ? "Requesting test tokens…" : "Request test tokens"}
              </Button>
              {notice && (
                <Button asChild variant="outline" className="w-full">
                  <Link to={"/wallet" + query}>
                    <RefreshCcw />
                    View balances
                  </Link>
                </Button>
              )}
            </>
          )}
        </CardContent>
      </AppShellCard>
    </div>
  );
}
