import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
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
import {toast} from "sonner";
import {APP_KEY_PREFIX, getAvailableNetworkIds} from "@/config";
import type {ChainId, NetworkId, WalletAdapter, WalletKind} from "./wallet/types";
import {wrapWalletAdapterWithWalletAction} from "@/context/wallet/wrapWalletAdapterWithWalletAction";
import type {
  InternalWalletBackupItem,
  InternalWalletBalance,
  InternalWalletIdentity,
  InternalWalletLifecycleState,
  InternalWalletStatus,
  InternalWalletSummary,
} from "@/lib/internalWallet/types.ts";
import {getInternalWalletProvider} from "@/lib/internalWallet/registry.ts";
import {getWalletRecord} from "@/lib/internalWallet/store";
import {setInternalWalletUnlockHandler} from "@/lib/internalWallet/unlockGate.ts";
import InternalWalletUnlockDialog from "@/components/wallet/InternalWalletUnlockDialog";

function createAdaptersForChain(chain: ChainId, _network: NetworkId): WalletAdapter[] {
  if (chain !== "hedera") {
    return [];
  }

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
  availableExternalProviders: { id: string; name: string; installed: boolean }[];

  internalWallets: InternalWalletSummary[];
  activeInternalWalletId: string | null;
  internalAddresses: string[];

  refreshInternalWallets: () => Promise<void>;
  refreshInternalAddresses: () => Promise<void>;
  refreshActiveInternalWallet: () => Promise<void>;
  connectInternalWallet: (walletId: string) => Promise<void>;
  activateInternalAddress: (addr: string) => Promise<void>;
  createInternalWallet: (input: { passphrase: string; label?: string }) => Promise<InternalWalletStatus>;
  importInternalWallet: (input: { passphrase: string; label?: string; mnemonic?: string; privateKey?: string }) => Promise<InternalWalletStatus>;
  removeInternalWallet: (walletId: string) => Promise<void>;
  lockInternalWallet: () => Promise<void>;
  unlockInternalWallet: (passphrase: string) => Promise<void>;
  changeInternalWalletPassphrase: (input: { currentPassphrase?: string; nextPassphrase: string }) => Promise<void>;
  revealInternalWalletBackup: (passphrase?: string) => Promise<InternalWalletBackupItem[]>;
  associateInternalToken: (tokenId: string) => Promise<void>;

  connect: (opts?: { kind?: WalletKind; chain?: ChainId; providerId?: string; silent?: boolean }) => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: (network: NetworkId) => Promise<void>;
  setWalletKind: (kind: WalletKind | null) => void;
  setExternalProviderId: (id: string | null) => void;

  signMessage: (dataToSign: string, message: string) => Promise<Uint8Array>;
}

const WalletContext = createContext<WalletContextType | null>(null);

type UnlockDialogState = {
  network?: NetworkId;
  walletId: string;
  walletLabel: string;
  reason: "sign-message" | "sign-transaction" | "backup-reveal";
  reasonLabel: string;
  resolve: (passphrase: string) => void;
  reject: (error: Error) => void;
};

export function WalletProvider({children}: { children: ReactNode }) {
  const [walletKind, setWalletKind] = useState<WalletKind | null>(() => {
    return "internal";
  });
  const [chain] = useState<ChainId>("tempo");
  const [network, setNetwork] = useState<NetworkId>(() => {
    return PICOMART_TEMPO_CONFIG.network;
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
  const adapters = useMemo(() => createAdaptersForChain(chain, network), [chain, network]);

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

  useEffect(() => {
    if (adapters.length > 0 || walletKind !== "external") {
      return;
    }

    setExternalWalletAddress(null);
    setExternalProviderIdState(null);
    setWalletKind(null);
    localStorage.removeItem(`${APP_KEY_PREFIX}-walletKind`);
    localStorage.removeItem(`${APP_KEY_PREFIX}-externalProviderId`);
  }, [adapters.length, walletKind]);

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
      getLabel: () => walletKind === 'internal' ? 'Processing your request…' : 'Waiting for approval in your connected app…',
    });
  }, [activeAdapter, startWalletAction, walletKind]);

  const availableExternalProviders = useMemo(() => {
    return adapters
      .map(adapter => ({
        id: adapter.id,
        name: adapter.name,
        installed: adapter.isInstalled ? adapter.isInstalled() : true,
      }))
      .filter(provider => provider.installed);
  }, [adapters]);

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

  const createInternalWallet = useCallback(async (input: { passphrase: string; label?: string }) => {
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

  const changeInternalWalletPassphrase = useCallback(async (input: {
    currentPassphrase?: string;
    nextPassphrase: string;
  }) => {
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

        if (preferredKind === "external") {
          const candidates = [
            externalProviderId ? adapters.find(adapter => adapter.id === externalProviderId) : undefined,
            ...adapters,
          ].filter(Boolean) as WalletAdapter[];

          for (const adapter of candidates) {
            try {
              const addressFromProvider = await adapter.getAddress?.();
              if (addressFromProvider) {
                setExternalWalletAddress(addressFromProvider);
                setWalletKind("external");
                setExternalProviderIdState(adapter.id);
                return;
              }

              const connectedAddress = await adapter.connect({silent: true});
              if (connectedAddress) {
                setExternalWalletAddress(connectedAddress);
                setWalletKind("external");
                setExternalProviderIdState(adapter.id);
                return;
              }
            } catch {
              // Ignore reconnect errors from external providers.
            }
          }
        }

        if (walletKind !== "internal") {
          setExternalWalletAddress(null);
        }

        if (walletKind !== "external") {
          setWalletKind(null);
        }
      } catch (error) {
        console.error("Wallet reconnect failed:", error);
        setExternalWalletAddress(null);
        setWalletKind(null);
      }
    };

    void attemptReconnect();
  }, [adapters, externalProviderId, internalProvider, network, syncInternalWalletState, walletKind]);

  const switchNetwork = useCallback(async (nextNetwork: NetworkId) => {
    if (network === nextNetwork) {
      return;
    }

    const supported = new Set(getAvailableNetworkIds());
    if (!supported.has(nextNetwork)) {
      toast.error(`Network "${nextNetwork}" is not supported by this app.`);
      return;
    }

    if (walletKind === "internal" && internalActiveWallet && internalProvider) {
      await internalProvider.activateWallet(nextNetwork, internalActiveWallet.id);
    }

    setNetwork(nextNetwork);
    localStorage.setItem(`${APP_KEY_PREFIX}-network`, nextNetwork);
  }, [internalActiveWallet, internalProvider, network, walletKind]);

  useEffect(() => {
    if (!activeAdapter || walletKind !== "external") {
      return;
    }

    const offAccount = activeAdapter.onAccountChange?.((address) => {
      setExternalWalletAddress(address);
    });
    const offNetwork = activeAdapter.onNetworkChange?.((nextNetwork) => {
      if (nextNetwork) {
        void switchNetwork(nextNetwork);
      }
    });

    return () => {
      offAccount?.();
      offNetwork?.();
    };
  }, [activeAdapter, switchNetwork, walletKind]);

  const connect = useCallback(async (opts?: {
    kind?: WalletKind;
    chain?: ChainId;
    providerId?: string;
    silent?: boolean;
  }) => {
    const targetChain = opts?.chain ?? chain;
    const targetAdapters = createAdaptersForChain(targetChain, network);
    const targetKind = opts?.kind ?? walletKind ?? (targetAdapters.length > 0 ? "external" : "internal");

    if (targetKind === "internal") {
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
      if (wallets.length > 0) {
        const connected = await provider.activateWallet(network, wallets[0].id);
        setInternalActiveWallet(connected);
        setWalletKind("internal");
        await syncInternalWalletState();
      }

      return;
    }

    let adapter = opts?.providerId ? targetAdapters.find(candidate => candidate.id === opts.providerId) : undefined;
    if (!adapter) {
      adapter = targetAdapters.find(candidate => candidate.isInstalled?.()) ?? targetAdapters[0];
    }

    if (!adapter) {
      throw new Error(`No wallet adapters available for chain: ${targetChain}`);
    }

    const address = await adapter.connect({silent: !!opts?.silent});
    if (address) {
      setExternalWalletAddress(address);
      setWalletKind("external");
      setExternalProviderIdState(adapter.id);
    }
  }, [chain, network, syncInternalWalletState, walletKind]);

  const disconnect = useCallback(async () => {
    try {
      if (walletKind === "external" && activeAdapter) {
        await activeAdapter.disconnect();
        setExternalWalletAddress(null);
      } else if (walletKind === "internal" && internalProvider) {
        await internalProvider.disconnect(network);
        setInternalActiveWallet(null);
        await syncInternalWalletState();
      }

      setWalletKind(null);
      localStorage.removeItem(`${APP_KEY_PREFIX}-walletKind`);
      localStorage.removeItem(`${APP_KEY_PREFIX}-externalProviderId`);
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
    }
  }, [activeAdapter, internalProvider, network, walletKind, syncInternalWalletState]);

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
      setUnlockDialogError(error instanceof Error && error.message === 'Incorrect passphrase.'
        ? 'Incorrect password. Please try again.' : 'Could not unlock this account. Please try again.');
    } finally {
      setUnlockDialogBusy(false);
    }
  }, [unlockDialogState, syncInternalWalletState, chain, network]);

  const internalAddresses = useMemo(() => {
    return internalWallets.map(wallet => wallet.identity.evmAddress);
  }, [internalWallets]);

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
    availableExternalProviders,
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
    availableExternalProviders,
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
    associateInternalToken,
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

