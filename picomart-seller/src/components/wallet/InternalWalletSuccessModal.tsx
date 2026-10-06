import React from "react";
import AccountDialog from "./AccountDialog";
import {CheckCircle2} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {InternalWalletStatus} from "@/lib/internalWallet/types.ts";
import CopyableField from "@/components/CopyableField";

interface InternalWalletSuccessModalProps {
  open: boolean;
  wallet: InternalWalletStatus | null;
  onClose: () => void;
  onBackup?: () => void;
}

const InternalWalletSuccessModal: React.FC<InternalWalletSuccessModalProps> = ({
  open,
  wallet,
  onClose,
  onBackup,
}) => {
  if (!open || !wallet) {
    return null;
  }

  const {identity, label} = wallet;

  const modal = (
    <AccountDialog open={open} title="Account created" onClose={onClose} className="max-w-xl">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-600"/>
          <div>
            <p className="text-sm text-muted-foreground">
              {label ?? "My account"} is ready to use in this browser.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">

          <div>
            <div className="text-xs text-muted-foreground mb-1">Receiving address</div>
            <CopyableField value={identity.evmAddress} length={24} mdLength={24}/>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Save your recovery words before adding funds. You will need them if you clear browser data or use another device.
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Do this later</Button>
          {onBackup && <Button onClick={onBackup}>Save recovery words</Button>}
        </div>
      </div>
    </AccountDialog>
  );

  return modal;
};

export default InternalWalletSuccessModal;
