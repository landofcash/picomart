import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {APP_KEY_PREFIX, getAvailableNetworkIds} from "@/config";
import {wrapWalletAdapterWithWalletAction} from "@/context/wallet/wrapWalletAdapterWithWalletAction";
import type {ChainId, NetworkId, WalletAdapter, WalletKind} from "@/context/wallet/types";
import type {
  InternalWalletBackupItem,
  InternalWalletBalance,
  InternalWalletIdentity,
  InternalWalletLifecycleState,
  InternalWalletUnlockRequest,
  InternalWalletStatus,
  InternalWalletSummary,
} from "@/lib/internalWallet/types.ts";
import {getInternalWalletProvider} from "@/lib/internalWallet/registry.ts";
import {getWalletRecord} from "@/lib/internalWallet/store";
import {setInternalWalletUnlockHandler} from "@/lib/internalWallet/unlockGate.ts";
import InternalWalletUnlockDialog from "@/components/wallet/InternalWalletUnlockDialog";

function createAdaptersForChain(): WalletAdapter[] {
  return [];
}

export interface WalletContextType {
  walletAddress: string | null;
  walletAdapter: WalletAdapter | null;
  network: NetworkId;
  chain: ChainId;
  walletKind: WalletKind | null;
  walletIdentity: InternalWalletIdentity | null;
  walletLifecycleState: InternalWalletLifecycleState | null;
  walletLocked: boolean;
  walletCanTransact: boolean;
  walletBootstrapTitle: string | null;
  walletBootstrapMessage: string | null;
  walletBalances: InternalWalletBalance[];
  walletActionPending: boolean;
  walletActionLabel: string | null;
  externalProviderId: string | null;
  availableExternalProviders: {id: string; name: string; installed: boolean}[];
  internalWallets: InternalWalletSummary[];
  activeInternalWalletId: string | null;
  internalAddresses: string[];
  refreshInternalWallets: () => Promise<void>;
  refreshInternalAddresses: () => Promise<void>;
  refreshActiveInternalWallet: () => Promise<void>;
  connectInternalWallet: (walletId: string) => Promise<void>;
  activateInternalAddress: (addr: string) => Promise<void>;
  createInternalWallet: (input: {passphrase: string; label?: string}) => Promise<InternalWalletStatus>;
  importInternalWallet: (input: {passphrase: string; label?: string; mnemonic?: string; privateKey?: string}) => Promise<InternalWalletStatus>;
  removeInternalWallet: (walletId: string) => Promise<void>;
  lockInternalWallet: () => Promise<void>;
  unlockInternalWallet: (passphrase: string) => Promise<void>;
  changeInternalWalletPassphrase: (input: {currentPassphrase?: string; nextPassphrase: string}) => Promise<void>;
  revealInternalWalletBackup: (passphrase?: string) => Promise<InternalWalletBackupItem[]>;
  associateInternalToken: (tokenId: string) => Promise<void>;
  connect: (opts?: {kind?: WalletKind; chain?: ChainId; providerId?: string; silent?: boolean}) => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: (network: NetworkId) => Promise<void>;
  setWalletKind: (kind: WalletKind | null) => void;
  setExternalProviderId: (id: string | null) => void;
  signMessage: (dataToSign: string, message: string) => Promise<Uint8Array>;
}

const WalletContext = createContext<WalletContextType | null>(null);

type UnlockDialogState = InternalWalletUnlockRequest & {
  resolve: (passphrase: string) => void;
  reject: (error: Error) => void;
};

export function WalletProvider({children}: {children: ReactNode}) {
  const [walletKind, setWalletKind] = useState<WalletKind | null>(() => {
    return "internal";
  });
  const [chain] = useState<ChainId>("tempo");
  const [network, setNetwork] = useState<NetworkId>(() => {
    const saved=localStorage.getItem(`${APP_KEY_PREFIX}-network`);
    return saved&&getAvailableNetworkIds().includes(saved)?saved:'moderato';
  });
  const [externalProviderId, setExternalProviderIdState] = useState<string | null>(() => {
    return localStorage.getItem(`${APP_KEY_PREFIX}-externalProviderId`);
  });
  const [externalWalletAddress, setExternalWalletAddress] = useState<string | null>(null);
  const [internalWallets, setInternalWallets] = useState<InternalWalletSummary[]>([]);
  const [internalActiveWallet, setInternalActiveWallet] = useState<InternalWalletStatus | null>(null);
  const [unlockDialogState, setUnlockDialogState] = useState<UnlockDialogState | null>(null);
  const [unlockDialogBusy, setUnlockDialogBusy] = useState(false);
  const [unlockDialogError, setUnlockDialogError] = useState<string | null>(null);
  const [walletActionPending, setWalletActionPending] = useState(false);
  const [walletActionLabel, setWalletActionLabel] = useState<string | null>(null);
  const walletActionCountRef = useRef(0);

  const internalProvider = useMemo(() => getInternalWalletProvider(chain), [chain]);
  const adapters = useMemo(() => createAdaptersForChain(), []);

  const walletAddress = walletKind === "internal"
    ? (internalActiveWallet?.identity.address ?? null)
    : externalWalletAddress;



  useEffect(() => {
    if (walletKind) {
      localStorage.setItem(`${APP_KEY_PREFIX}-walletKind`, walletKind);
    }
  }, [walletKind]);

  useEffect(() => {
    if (externalProviderId) {
      localStorage.setItem(`${APP_KEY_PREFIX}-externalProviderId`, externalProviderId);
    }
  }, [externalProviderId]);

  const syncInternalWalletState = useCallback(async () => {
    if (!internalProvider) {
      setInternalWallets([]);
      setInternalActiveWallet(null);
      return;
    }

    const [activeWallet, wallets] = await Promise.all([
      internalProvider.getActiveWallet(network),
      internalProvider.listWallets(network),
    ]);

    setInternalActiveWallet(previous => activeWallet ? {...activeWallet, balances: previous?.id === activeWallet.id ? previous.balances : activeWallet.balances} : null);
    setInternalWallets(wallets);
  }, [internalProvider, network]);

  useEffect(() => {
    void syncInternalWalletState();
  }, [syncInternalWalletState]);

  useEffect(() => {
    setInternalWalletUnlockHandler((request) => {
      return new Promise<string>((resolve, reject) => {
        setUnlockDialogError(null);
        setUnlockDialogState({
          ...request,
          resolve,
          reject,
        });
      });
    });

    return () => {
      setInternalWalletUnlockHandler(null);
    };
  }, []);

  const startWalletAction = useCallback((_kind: "signMessage" | "executeContract" | "executeBatch" | "signAndSubmit", label: string) => {
    walletActionCountRef.current += 1;
    setWalletActionPending(true);
    setWalletActionLabel(label);

    return () => {
      walletActionCountRef.current = Math.max(0, walletActionCountRef.current - 1);
      if (walletActionCountRef.current === 0) {
        setWalletActionPending(false);
        setWalletActionLabel(null);
      }
    };
  }, []);

  const activeAdapter = useMemo<WalletAdapter | null>(() => {
    if (walletKind === "internal" && internalProvider) {
      return internalProvider.getWalletAdapter(network);
    }
    if (!adapters.length) {
      return null;
    }
    if (externalProviderId) {
      return adapters.find(adapter => adapter.id === externalProviderId) ?? adapters[0];
    }
    return adapters.find(adapter => adapter.isInstalled?.()) ?? adapters[0];
  }, [adapters, externalProviderId, internalProvider, network, walletKind]);

  const walletAdapterForUi = useMemo(() => {
    if (!activeAdapter) {
      return null;
    }

    return wrapWalletAdapterWithWalletAction(activeAdapter, {
      onStart: startWalletAction,
    });
  }, [activeAdapter, startWalletAction]);

  const refreshInternalWallets = useCallback(async () => {
    await syncInternalWalletState();
  }, [syncInternalWalletState]);

  const refreshActiveInternalWallet = useCallback(async () => {
    if (!internalProvider || !internalActiveWallet) {
      return;
    }

    const refreshed = await internalProvider.refreshWallet(network, internalActiveWallet.id);
    setInternalActiveWallet(refreshed);
    await syncInternalWalletState();
  }, [internalActiveWallet, internalProvider, network, syncInternalWalletState]);

  const connectInternalWallet = useCallback(async (walletId: string) => {
    if (!internalProvider) {
      throw new Error("No internal wallet provider is configured for this chain.");
    }

    const connected = await internalProvider.activateWallet(network, walletId);
    setInternalActiveWallet(connected);
    setWalletKind("internal");
    await syncInternalWalletState();
  }, [internalProvider, network, syncInternalWalletState]);

  const activateInternalAddress = useCallback(async (addr: string) => {
    const target = internalWallets.find(wallet =>
      wallet.identity.address === addr ||
      wallet.identity.accountId === addr ||
      wallet.identity.evmAddress === addr,
    );

    if (!target) {
      throw new Error("Internal wallet not found.");
    }

    await connectInternalWallet(target.id);
  }, [connectInternalWallet, internalWallets]);

  const createInternalWallet = useCallback(async (input: {passphrase: string; label?: string}) => {
    if (!internalProvider) {
      throw new Error("No internal wallet provider is configured for this chain.");
    }

    const created = await internalProvider.createWallet(network, input);
    setInternalActiveWallet(created);
    setWalletKind("internal");
    await syncInternalWalletState();
    return created;
  }, [internalProvider, network, syncInternalWalletState]);

  const importInternalWallet = useCallback(async (input: {
    passphrase: string;
    label?: string;
    mnemonic?: string;
    privateKey?: string;
  }) => {
    if (!internalProvider) {
      throw new Error("No internal wallet provider is configured for this chain.");
    }

    const imported = await internalProvider.importWallet(network, input);
    setInternalActiveWallet(imported);
    setWalletKind("internal");
    await syncInternalWalletState();
    return imported;
  }, [internalProvider, network, syncInternalWalletState]);

  const removeInternalWallet = useCallback(async (walletId: string) => {
    if (!internalProvider) {
      throw new Error("No internal wallet provider is configured for this chain.");
    }

    await internalProvider.removeWallet(network, walletId);

    if (internalActiveWallet?.id === walletId) {
      setInternalActiveWallet(null);
      if (walletKind === "internal") {
        setWalletKind(null);
      }
    }

    await syncInternalWalletState();
  }, [internalActiveWallet?.id, internalProvider, network, syncInternalWalletState, walletKind]);

  const lockInternalWallet = useCallback(async () => {
    if (!internalProvider || !internalActiveWallet) {
      return;
    }

    await internalProvider.lockWallet(internalActiveWallet.id);
    await refreshActiveInternalWallet();
  }, [internalActiveWallet, internalProvider, refreshActiveInternalWallet]);

  const unlockInternalWallet = useCallback(async (passphrase: string) => {
    if (!internalProvider || !internalActiveWallet) {
      throw new Error("No active internal wallet.");
    }

    const unlocked = await internalProvider.unlockWallet(network, internalActiveWallet.id, passphrase);
    setInternalActiveWallet(unlocked);
    await syncInternalWalletState();
  }, [internalActiveWallet, internalProvider, network, syncInternalWalletState]);

  const changeInternalWalletPassphrase = useCallback(async (input: {currentPassphrase?: string; nextPassphrase: string}) => {
    if (!internalProvider || !internalActiveWallet) {
      throw new Error("No active internal wallet.");
    }

    const updated = await internalProvider.changePassphrase(network, internalActiveWallet.id, input);
    setInternalActiveWallet(updated);
    await syncInternalWalletState();
  }, [internalActiveWallet, internalProvider, network, syncInternalWalletState]);

  const revealInternalWalletBackup = useCallback(async (passphrase?: string) => {
    if (!internalProvider || !internalActiveWallet) {
      throw new Error("No active internal wallet.");
    }

    return await internalProvider.revealBackup(internalActiveWallet.id, passphrase);
  }, [internalActiveWallet, internalProvider]);

  const associateInternalToken = useCallback(async (tokenId: string) => {
    if (!internalProvider || !internalActiveWallet) {
      throw new Error("No active internal wallet.");
    }

    const updated = await internalProvider.associateToken(network, internalActiveWallet.id, tokenId);
    setInternalActiveWallet(updated);
    await syncInternalWalletState();
  }, [internalActiveWallet, internalProvider, network, syncInternalWalletState]);

  useEffect(() => {
    const attemptReconnect = async () => {
      try {
        const preferredKind = localStorage.getItem(`${APP_KEY_PREFIX}-walletKind`) as WalletKind | null;

        if (preferredKind === "internal" && internalProvider) {
          const activeWallet = await internalProvider.getActiveWallet(network);
          if (activeWallet) {
            setInternalActiveWallet(activeWallet);
            setWalletKind("internal");
            await syncInternalWalletState();
            return;
          }
        }

        setExternalWalletAddress(null);
        setWalletKind(null);
      } catch (error) {
        console.error("Wallet reconnect failed:", error);
        setExternalWalletAddress(null);
        setWalletKind(null);
      }
    };

    void attemptReconnect();
  }, [internalProvider, network, syncInternalWalletState]);

  const switchNetwork = useCallback(async (nextNetwork: NetworkId) => {
    if (network === nextNetwork) {
      return;
    }

    const supported = new Set(getAvailableNetworkIds());
    if (!supported.has(nextNetwork)) {
      throw new Error(`Network "${nextNetwork}" is not supported by this app.`);
    }

    if (walletKind === "internal" && internalActiveWallet && internalProvider) {
      await internalProvider.activateWallet(nextNetwork, internalActiveWallet.id);
    }

    setNetwork(nextNetwork);
    localStorage.setItem(`${APP_KEY_PREFIX}-network`, nextNetwork);
  }, [internalActiveWallet, internalProvider, network, walletKind]);

  const connect = useCallback(async (opts?: {
    kind?: WalletKind;
    chain?: ChainId;
    providerId?: string;
    silent?: boolean;
  }) => {
    const targetChain = opts?.chain ?? chain;
    const targetKind = opts?.kind ?? walletKind ?? "internal";

    if (targetKind !== "internal") {
      throw new Error("External wallets are not configured in this app.");
    }

    const provider = getInternalWalletProvider(targetChain);
    if (!provider) {
      throw new Error("No internal wallet provider is configured for this chain.");
    }

    const activeWallet = await provider.getActiveWallet(network);
    if (activeWallet) {
      setInternalActiveWallet(activeWallet);
      setWalletKind("internal");
      await syncInternalWalletState();
      return;
    }

    const wallets = await provider.listWallets(network);
    if (wallets.length === 0) {
      return;
    }

    const connected = await provider.activateWallet(network, wallets[0].id);
    setInternalActiveWallet(connected);
    setWalletKind("internal");
    await syncInternalWalletState();
  }, [chain, network, syncInternalWalletState, walletKind]);

  const disconnect = useCallback(async () => {
    try {
      if (walletKind === "internal" && internalProvider) {
        await internalProvider.disconnect(network);
        setInternalActiveWallet(null);
      }

      setExternalWalletAddress(null);
      setWalletKind(null);
      localStorage.removeItem(`${APP_KEY_PREFIX}-walletKind`);
      localStorage.removeItem(`${APP_KEY_PREFIX}-externalProviderId`);
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
    }
  }, [internalProvider, network, walletKind]);

  const setExternalProviderId = useCallback((id: string | null) => {
    setExternalProviderIdState(id);
  }, []);

  const signMessage = useCallback(async (dataToSign: string, message: string) => {
    if (!walletKind) {
      throw new Error("No wallet connected.");
    }
    if (!walletAdapterForUi) {
      throw new Error("No active wallet adapter.");
    }
    return await walletAdapterForUi.signMessage(dataToSign, message);
  }, [walletAdapterForUi, walletKind]);

  const handleUnlockDialogCancel = useCallback(() => {
    if (unlockDialogState) {
      unlockDialogState.reject(new Error("Wallet unlock was cancelled."));
    }
    setUnlockDialogError(null);
    setUnlockDialogBusy(false);
    setUnlockDialogState(null);
  }, [unlockDialogState]);

  const handleUnlockDialogConfirm = useCallback(async (passphrase: string) => {
    if (!unlockDialogState) {
      return;
    }

    setUnlockDialogBusy(true);
    setUnlockDialogError(null);
    try {
      const record = await getWalletRecord(unlockDialogState.walletId);
      if (!record) throw new Error("Wallet no longer exists.");
      const provider = getInternalWalletProvider(record.chain);
      if (!provider) throw new Error("Wallet provider is unavailable.");
      await provider.unlockWallet(unlockDialogState.network ?? network, record.id, passphrase);
      if (record.chain === chain) await syncInternalWalletState();
      unlockDialogState.resolve(passphrase);
      setUnlockDialogState(null);
    } catch (error) {
      setUnlockDialogError(error instanceof Error ? error.message : "Failed to unlock wallet.");
    } finally {
      setUnlockDialogBusy(false);
    }
  }, [unlockDialogState, syncInternalWalletState, chain, network]);

  const internalAddresses = useMemo(() => internalWallets.map(wallet => wallet.identity.evmAddress), [internalWallets]);

  const contextValue = useMemo<WalletContextType>(() => ({
    walletAddress,
    walletAdapter: walletAdapterForUi,
    network,
    chain,
    walletKind,
    walletIdentity: walletKind === "internal" ? (internalActiveWallet?.identity ?? null) : null,
    walletLifecycleState: walletKind === "internal" ? (internalActiveWallet?.lifecycleState ?? null) : null,
    walletLocked: walletKind === "internal" ? (internalActiveWallet?.locked ?? false) : false,
    walletCanTransact: walletKind === "internal" ? (internalActiveWallet?.canTransact ?? false) : walletAddress != null,
    walletBootstrapTitle: walletKind === "internal" ? (internalActiveWallet?.bootstrapTitle ?? null) : null,
    walletBootstrapMessage: walletKind === "internal" ? (internalActiveWallet?.bootstrapMessage ?? null) : null,
    walletBalances: walletKind === "internal" ? (internalActiveWallet?.balances ?? []) : [],
    walletActionPending,
    walletActionLabel,
    externalProviderId,
    availableExternalProviders: [],
    internalWallets,
    activeInternalWalletId: internalActiveWallet?.id ?? null,
    internalAddresses,
    refreshInternalWallets,
    refreshInternalAddresses: refreshInternalWallets,
    refreshActiveInternalWallet,
    connectInternalWallet,
    activateInternalAddress,
    createInternalWallet,
    importInternalWallet,
    removeInternalWallet,
    lockInternalWallet,
    unlockInternalWallet,
    changeInternalWalletPassphrase,
    revealInternalWalletBackup,
    associateInternalToken,
    connect,
    disconnect,
    switchNetwork,
    setWalletKind,
    setExternalProviderId,
    signMessage,
  }), [
    activateInternalAddress,
    associateInternalToken,
    chain,
    changeInternalWalletPassphrase,
    connect,
    connectInternalWallet,
    createInternalWallet,
    disconnect,
    externalProviderId,
    importInternalWallet,
    internalActiveWallet,
    internalAddresses,
    internalWallets,
    lockInternalWallet,
    network,
    refreshActiveInternalWallet,
    refreshInternalWallets,
    removeInternalWallet,
    revealInternalWalletBackup,
    setExternalProviderId,
    signMessage,
    switchNetwork,
    unlockInternalWallet,
    walletActionLabel,
    walletActionPending,
    walletAdapterForUi,
    walletAddress,
    walletKind,
  ]);

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
      <InternalWalletUnlockDialog
        open={unlockDialogState != null}
        request={unlockDialogState ? {
          walletId: unlockDialogState.walletId,
          walletLabel: unlockDialogState.walletLabel,
          reason: unlockDialogState.reason,
          reasonLabel: unlockDialogState.reasonLabel,
        } : null}
        busy={unlockDialogBusy}
        error={unlockDialogError}
        onCancel={handleUnlockDialogCancel}
        onConfirm={handleUnlockDialogConfirm}
      />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
