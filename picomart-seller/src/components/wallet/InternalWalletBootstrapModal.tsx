import React from "react";
import {createPortal} from "react-dom";
import {ExternalLink, HandCoins, Sparkles} from "lucide-react";
import {QRCodeSVG} from "qrcode.react";
import {Button} from "@/components/ui/button";
import {explorerAccountUrl, faucetAccountUrl} from "@/config";
import type {NetworkId} from "@/context/wallet/types.ts";
import type {InternalWalletIdentity} from "@/lib/internalWallet/types.ts";
import CopyableField from "@/components/CopyableField";

interface InternalWalletBootstrapModalProps {
  open: boolean;
  network: NetworkId;
  faucetUrl?: string;
  title: string | null;
  message: string | null;
  identity: InternalWalletIdentity | null;
  onClose: () => void;
}

const InternalWalletBootstrapModal: React.FC<InternalWalletBootstrapModalProps> = ({
  open,
  network,
  faucetUrl,
  title,
  message,
  identity,
  onClose,
}) => {
  if (!open) {
    return null;
  }

  const fundingAddress = identity?.evmAddress ?? identity?.address ?? identity?.accountId ?? "";
  const faucetTargetUrl = faucetUrl
    ? faucetAccountUrl(faucetUrl, fundingAddress)
    : null;
  const accountTarget = identity?.accountId ?? identity?.evmAddress ?? identity?.address ?? null;

  const modal = (
    <div role="dialog" aria-modal="true" aria-label="Fund your wallet" className="fixed inset-0 z-[110] overflow-y-auto bg-[radial-gradient(circle_at_top,#0d4368_0%,rgba(2,13,20,0.86)_52%)] p-3 sm:p-4">
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-0">
        <div className="my-2 w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[28px] border border-sky-100/70 bg-[linear-gradient(180deg,#fcfeff_0%,#eef7fb_100%)] shadow-[0_36px_100px_-48px_rgba(3,23,36,0.65)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]">
        <div className="bg-[linear-gradient(135deg,#08253a_0%,#0a5b84_56%,#2dc6d6_100%)] px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-sky-50">
                <Sparkles className="h-3.5 w-3.5"/>
                Wallet Funding
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold sm:text-2xl">{title ?? "Wallet bootstrap"}</h2>
                <p className="max-w-xl text-sm text-sky-50/85">{message}</p>
              </div>
            </div>
            <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-50">
              {network}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
          <div className="space-y-4">
              {network === "moderato" && faucetTargetUrl ? (
                <div className="flex flex-col gap-3 rounded-[20px] border border-emerald-200/80 bg-[linear-gradient(135deg,#ecfdf3_0%,#f0f9ff_100%)] p-4 shadow-[0_18px_45px_-36px_rgba(16,185,129,0.65)] sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900">
                      <HandCoins className="h-3.5 w-3.5"/>
                      Testnet Only
                    </div>
                    <div className="text-sm font-semibold text-emerald-950">Get free test PathUSD for this wallet</div>
                    <div className="text-sm text-emerald-900/80">
                      Open the faucet to send free test PathUSD to this wallet, then come back here and refresh the wallet status.
                    </div>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="bg-[linear-gradient(135deg,#0d8d63_0%,#0aa06b_45%,#0f766e_100%)] text-white shadow-[0_18px_34px_-22px_rgba(15,118,110,0.7)] hover:brightness-105"
                  >
                    <a href={faucetTargetUrl} target="_blank" rel="noreferrer">
                      <HandCoins className="h-4 w-4"/>
                      Open faucet
                    </a>
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-[28px] border border-sky-100 bg-white p-4 shadow-[0_24px_60px_-42px_rgba(3,23,36,0.6)]">
                    <QRCodeSVG value={fundingAddress} size={156} includeMargin={true}/>
                  </div>
                  <div className="rounded-full border border-sky-200 bg-sky-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-900">
                    Fund PathUSD
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Funding Address</div>
                    <CopyableField value={fundingAddress}/>
                  </div>

                  <div className="rounded-[18px] border border-sky-100 bg-white/85 p-4 text-sm text-slate-700 shadow-[0_18px_45px_-40px_rgba(3,23,36,0.45)]">
                    Scan the QR code from another wallet or copy the address above. Once the transfer settles, refresh the wallet status and you can start creating catalogs.
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-200 bg-white/85 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Why PathUSD</div>
                      <div className="mt-2 text-sm text-slate-700">
                        PathUSD covers Tempo network fees for catalog creation and other signed marketplace actions.
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-white/85 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recommended</div>
                      <div className="mt-2 text-sm text-slate-700">
                        Keep enough PathUSD for payments and network fees.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-2 border-t border-sky-100 pt-2">
                {accountTarget ? (
                  <Button asChild variant="outline" className="border-sky-200 bg-white/90 hover:bg-sky-50">
                    <a href={explorerAccountUrl(accountTarget, network)} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4"/>
                      View on explorer
                    </a>
                  </Button>
                ) : <div />}
                <Button variant="outline" onClick={onClose} className="border-slate-200 bg-white/90 hover:bg-slate-50">
                  Close
                </Button>
              </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletBootstrapModal;
