import type {ChainId, NetworkId} from "@/context/wallet/types.ts";

export type InternalWalletLifecycleState = "local_only" | "funded_or_alias_created" | "ready";
export type InternalWalletBackupKind = "mnemonic" | "privateKey";

export interface InternalWalletBaseIdentity {
  evmAddress: string;
  alias: string | null;
  publicKey: string;
}

export interface InternalWalletIdentity extends InternalWalletBaseIdentity {
  address: string;
  accountId: string | null;
}

export interface InternalWalletNetworkState {
  accountId: string | null;
  lifecycleState: InternalWalletLifecycleState;
}

export interface InternalWalletEncryptedSecret {
  version: 1;
  cipherTextBase64: string;
  ivBase64: string;
  saltBase64: string;
  kdf: {
    algorithm: "argon2id";
    iterations: number;
    parallelism: number;
    memorySize: number;
    hashLength: number;
  };
}

export interface InternalWalletSecretMaterial {
  privateKeyHex: string;
  mnemonic?: string;
  importedAs: InternalWalletBackupKind;
}

export interface InternalWalletRecord {
  id: string;
  providerId: string;
  chain: ChainId;
  label: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  baseIdentity: InternalWalletBaseIdentity;
  networkStates: Record<string, InternalWalletNetworkState>;
  backupKinds: InternalWalletBackupKind[];
  encryptedSecret: InternalWalletEncryptedSecret;
}

export interface InternalWalletSummary {
  id: string;
  providerId: string;
  chain: ChainId;
  network: NetworkId;
  label: string;
  lifecycleState: InternalWalletLifecycleState;
  identity: InternalWalletIdentity;
  backupKinds: InternalWalletBackupKind[];
  active: boolean;
  locked: boolean;
  lastUsedAt: string | null;
}

export interface InternalWalletBalance {
  tokenId: string;
  symbol: string;
  decimals: number;
  raw: bigint;
  formatted: string;
  associated: boolean;
}

export interface InternalWalletStatus extends InternalWalletSummary {
  balances: InternalWalletBalance[];
  bootstrapRequired: boolean;
  canTransact: boolean;
  bootstrapTitle: string | null;
  bootstrapMessage: string | null;
}

export interface InternalWalletBackupItem {
  kind: InternalWalletBackupKind;
  label: string;
  value: string;
}

export interface InternalWalletCreateInput {
  passphrase: string;
  label?: string;
}

export interface InternalWalletImportInput {
  passphrase: string;
  label?: string;
  mnemonic?: string;
  privateKey?: string;
}

export interface InternalWalletPassphraseChangeInput {
  currentPassphrase?: string;
  nextPassphrase: string;
}

export interface InternalWalletUnlockRequest {
  network?: NetworkId;
  walletId: string;
  walletLabel: string;
  reason: "sign-message" | "sign-transaction" | "backup-reveal";
  reasonLabel: string;
}
