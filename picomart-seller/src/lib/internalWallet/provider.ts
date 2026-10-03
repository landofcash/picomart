import type {WalletAdapter, ChainId, NetworkId} from "@/context/wallet/types.ts";
import type {
  InternalWalletBackupItem,
  InternalWalletCreateInput,
  InternalWalletImportInput,
  InternalWalletPassphraseChangeInput,
  InternalWalletStatus,
  InternalWalletSummary,
} from "@/lib/internalWallet/types.ts";

export interface InternalWalletProvider {
  readonly id: string;
  readonly chain: ChainId;
  readonly displayName: string;

  listWallets(network: NetworkId): Promise<InternalWalletSummary[]>;
  getActiveWallet(network: NetworkId): Promise<InternalWalletStatus | null>;
  createWallet(network: NetworkId, input: InternalWalletCreateInput): Promise<InternalWalletStatus>;
  importWallet(network: NetworkId, input: InternalWalletImportInput): Promise<InternalWalletStatus>;
  activateWallet(network: NetworkId, walletId: string): Promise<InternalWalletStatus>;
  disconnect(network: NetworkId): Promise<void>;
  refreshWallet(network: NetworkId, walletId: string): Promise<InternalWalletStatus>;
  removeWallet(network: NetworkId, walletId: string): Promise<void>;
  lockWallet(walletId: string): Promise<void>;
  unlockWallet(network: NetworkId, walletId: string, passphrase: string): Promise<InternalWalletStatus>;
  changePassphrase(network: NetworkId, walletId: string, input: InternalWalletPassphraseChangeInput): Promise<InternalWalletStatus>;
  revealBackup(walletId: string, passphrase?: string): Promise<InternalWalletBackupItem[]>;
  associateToken(network: NetworkId, walletId: string, tokenId: string): Promise<InternalWalletStatus>;
  getWalletAdapter(network: NetworkId): WalletAdapter;
}


