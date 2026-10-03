import type {InternalWalletUnlockRequest} from "@/lib/internalWallet/types.ts";

type UnlockHandler = (request: InternalWalletUnlockRequest) => Promise<string>;

let unlockHandler: UnlockHandler | null = null;

export function setInternalWalletUnlockHandler(handler: UnlockHandler | null) {
  unlockHandler = handler;
}

export async function requestInternalWalletPassphrase(request: InternalWalletUnlockRequest): Promise<string> {
  if (!unlockHandler) {
    throw new Error("Wallet unlock UI is not available.");
  }

  return await unlockHandler(request);
}
