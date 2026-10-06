import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@/context/WalletContext";
import { accountCurrencies } from "@/lib/internalWallet/currencies";
import AccountDialog from "./AccountDialog";
import {Copy} from 'lucide-react';
import { Button } from "../ui/button";

export default function AccountReceiveDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { walletAddress, network } = useWallet(),
    currencies = accountCurrencies(network);
  const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
  async function copy(){try{await navigator.clipboard.writeText(walletAddress!);setCopied(true);setCopyError(false);}catch{setCopyError(true);}}
  return (
    <AccountDialog
      open
      title="Receive funds"
      onClose={onClose}
      className="max-w-md"
    >
      {walletAddress && currencies.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Network: {" "}
            <strong className="text-foreground">Tempo · Demo network</strong>.
            Choose this same network in the sending app.
          </p>
          <div className="mx-auto w-fit rounded-xl bg-white p-4">
            <QRCodeSVG
              value={walletAddress}
              size={192}
              level="M"
              title="Receiving address"
            />
          </div>
          <div className="space-y-2 break-all">
            <p className="text-sm font-medium">Your receiving address</p>
            <p className="font-mono text-xs">{walletAddress}</p>
            <Button variant="outline" className="w-full" onClick={()=>void copy()}><Copy className="h-4 w-4"/>{copied?'Address copied':'Copy address'}</Button>
            {copyError&&<p role="alert" className="text-xs text-destructive">Copy was unavailable. Select and copy the address above.</p>}
          </div>
        </>
      ) : (
        <p>Select a supported account in Settings to receive funds.</p>
      )}
      <Button variant="outline" className="w-full" onClick={onClose}>
        Done
      </Button>
    </AccountDialog>
  );
}
