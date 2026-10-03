import React from "react";
import {createPortal} from "react-dom";
import {CheckCircle2} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {InternalWalletStatus} from "@/lib/internalWallet/types.ts";
import CopyableField from "@/components/CopyableField";

interface InternalWalletSuccessModalProps {
  open: boolean;
  wallet: InternalWalletStatus | null;
  onClose: () => void;
}

const InternalWalletSuccessModal: React.FC<InternalWalletSuccessModalProps> = ({
  open,
  wallet,
  onClose,
}) => {
  if (!open || !wallet) {
    return null;
  }

  const {identity, label} = wallet;

  const modal = (
    <div role="dialog" aria-modal="true" aria-label="Wallet created" className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-background p-6 shadow-xl space-y-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-600"/>
          <div>
            <h2 className="text-xl font-semibold">Wallet created</h2>
            <p className="text-sm text-muted-foreground">
              {label ?? "Built-in wallet"} is now stored locally and encrypted.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">

          <div>
            <div className="text-xs text-muted-foreground mb-1">Wallet address</div>
            <CopyableField value={identity.evmAddress} length={24} mdLength={24}/>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Back up this wallet before using it with funds. Recovery material can be revealed from the connected wallet panel.
        </div>

        <div className="flex items-center justify-end">
          <Button onClick={onClose}>Continue</Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletSuccessModal;
