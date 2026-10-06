import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { TEMPO_NETWORK_PROFILES } from "@/lib/tempoNetworks";
import { Button } from "./ui/button";

export default function TempoNetworkSwitch({
  showHeading = true,
}: {
  showHeading?: boolean;
}) {
  const { network, switchNetwork, walletActionPending } = useWallet();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section aria-label="Operating mode" className="space-y-2 print:hidden">
      {showHeading && <h2 className="text-sm font-medium">Operating mode</h2>}
      <div className="flex flex-wrap gap-2">
        {TEMPO_NETWORK_PROFILES.map((profile) => (
          <Button
            key={profile.id}
            size="sm"
            variant={network === profile.id ? "default" : "outline"}
            aria-pressed={network === profile.id}
            disabled={
              busy ||
              walletActionPending ||
              !profile.available ||
              network === profile.id
            }
            title={
              !profile.available ? "Live mode is not available yet." : undefined
            }
            onClick={() => {
              setBusy(true);
              setError("");
              void switchNetwork(profile.id)
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not change mode. Please try again.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {profile.label}
          </Button>
        ))}
      </div>
      {!TEMPO_NETWORK_PROFILES.find((profile) => profile.id === "mainnet")
        ?.available && (
        <p className="text-xs text-muted-foreground">
          Live mode is not available yet.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
