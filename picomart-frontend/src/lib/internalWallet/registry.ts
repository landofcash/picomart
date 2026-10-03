import type {ChainId} from "@/context/wallet/types.ts";
import type {InternalWalletProvider} from "@/lib/internalWallet/provider.ts";
import {tempoInternalWalletProvider} from "@/lib/internalWallet/providers/tempoInternalWalletProvider";

const providers: Record<string, InternalWalletProvider> = {
  tempo: tempoInternalWalletProvider,
};

export function getInternalWalletProvider(chain: ChainId): InternalWalletProvider | null {
  return providers[chain] ?? null;
}
