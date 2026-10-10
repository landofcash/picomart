import { useSellerWalletPopup } from "@/context/SellerWalletPopup";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Coins,
  SlidersHorizontal,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import TempoNetworkSwitch from "@/components/TempoNetworkSwitch";
import TempoMarketShell from "@/components/TempoMarketShell";
import { PICOMART_TEMPO_CONFIG } from "@picomart/config";
import { TokenLabel } from "@/components/TokenAmount";
import { useTempoAdmin } from "@/hooks/useTempoAdmin";
import DeliverySetsBackup from "@/components/DeliverySetsBackup";

export default function TempoSettingsPage({
  seller = false,
}: {
  seller?: boolean;
}) {
  const openAccount = useSellerWalletPopup();
  const { isAdmin } = useTempoAdmin();
  return (
    <TempoMarketShell title="Settings" seller={seller}>
      {isAdmin && <Button asChild variant="outline"><Link to="/admin/tokens">Token administration<ArrowRight className="h-4 w-4" /></Link></Button>}
      <div className="grid items-start gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Account and security
            </CardTitle>
            <CardDescription>
              Manage access to your account on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Unlock your account, change your password, and save your recovery
              details from the account menu.
            </p>
            <Button variant="outline" className="w-full" onClick={openAccount}>
              Manage account
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              Currency and fees
            </CardTitle>
            <CardDescription>
              Know what your account balance covers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3 font-semibold">{PICOMART_TEMPO_CONFIG.paymentTokens.map(token => <TokenLabel key={token.tokenId} token={token.tokenId} />)}</div>
            <p className="text-sm leading-6 text-muted-foreground">
              Choose a supported currency for each catalog. Selling transaction fees use {PICOMART_TEMPO_CONFIG.feeToken.symbol}. You review the maximum
              transaction fee before approving a selling action.
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              Operating mode
            </CardTitle>
            <CardDescription>Choose where you use Picomart.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TempoNetworkSwitch showHeading={false} />
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              Demo mode uses test funds with no real monetary value.
            </p>
          </CardContent>
        </Card>
      </div>
      {seller && <DeliverySetsBackup />}
      <details className="rounded-2xl border bg-card px-5 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced settings
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Technical tools for checking the connection and saved operations.
        </p>
        <Link
          className="my-4 inline-flex min-h-10 items-center gap-2 text-sm text-primary underline underline-offset-4"
          to="/tempo-contract"
        >
          Contract diagnostics
          <ArrowRight className="h-4 w-4" />
        </Link>
      </details>
    </TempoMarketShell>
  );
}
