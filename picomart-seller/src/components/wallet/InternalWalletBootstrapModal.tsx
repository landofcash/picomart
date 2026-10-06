import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { explorerAccountUrl, faucetAccountUrl, DEFAULT_PAYMENT_CURRENCY } from "@/config";
import type { NetworkId } from "@/context/wallet/types";
import type { InternalWalletIdentity } from "@/lib/internalWallet/types";
import CopyableField from "@/components/CopyableField";
import AccountDialog from "./AccountDialog";

export default function InternalWalletBootstrapModal({
  open,
  network,
  faucetUrl,
  title,
  message,
  identity,
  onClose,
}: {
  open: boolean;
  network: NetworkId;
  faucetUrl?: string;
  title: string | null;
  message: string | null;
  identity: InternalWalletIdentity | null;
  onClose: () => void;
}) {
  const address = identity?.evmAddress ?? identity?.address ?? "",
    demo = network === PICOMART_TEMPO_CONFIG.network;
  const fundingUrl =
    faucetUrl && address ? faucetAccountUrl(faucetUrl, address) : null;
  return (
    <AccountDialog
      open={open}
      title={title ?? "Add funds"}
      onClose={onClose}
      className="max-w-xl"
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      {demo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Demo mode</strong>
          <p className="mt-1">
            Use test {DEFAULT_PAYMENT_CURRENCY.symbol} only. Demo funds have no real monetary value.
          </p>
        </div>
      )}
      {address && (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="mx-auto rounded-xl border bg-white p-3">
            <QRCodeSVG value={address} size={132} includeMargin />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">Receiving address</p>
            <CopyableField value={address} length={20} mdLength={24} />
            <p className="text-sm text-muted-foreground">
              Transfer {demo ? "test " : ""}{DEFAULT_PAYMENT_CURRENCY.symbol} to this address. Return to
              your account and refresh the balance after the transfer.
            </p>
          </div>
        </div>
      )}
      {demo && fundingUrl && (
        <Button asChild>
          <a href={fundingUrl} target="_blank" rel="noreferrer">
            Get test funds
          </a>
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {DEFAULT_PAYMENT_CURRENCY.symbol} covers payments and transaction fees. Only transfer the
        supported currency using the correct mode.
      </p>
      {address && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Advanced details
          </summary>
          <a
            className="mt-2 block underline"
            href={explorerAccountUrl(address, network)}
            target="_blank"
            rel="noreferrer"
          >
            View account record
          </a>
        </details>
      )}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
    </AccountDialog>
  );
}
