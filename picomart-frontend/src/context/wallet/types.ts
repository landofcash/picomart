import type {TempoWalletTransactions} from "@/lib/internalWallet/tempoTransactions";
export type ChainId = 'hedera' | string;
export type NetworkId = 'mainnet' | 'testnet' | 'previewnet' | 'local' | string;
export type WalletKind = 'external' | 'internal';
export type WalletProviderId = 'hashpack' | 'blade' | string;

export type ContractArgument =
  | { type: 'address'; value: string }
  | { type: 'bytes'; value: Uint8Array }
  | { type: 'bytes32'; value: Uint8Array }
  | { type: 'string'; value: string }
  | { type: 'uint256'; value: bigint };

export type ContractFunctionPayload = {
  contractId: string;
  function: string;
  arguments: ContractArgument[];
  amount?: bigint; // amount of HBAR to send
};

export type HCSMessagePayload = {
  topicId: string;
  message: string | Uint8Array;
};

export type TransactionPayload = 
  | { type: 'contract', data: ContractFunctionPayload }
  | { type: 'tokenAllowance', data: { tokenId: string; spender: string; amount: bigint } }
  | { type: 'hcs', data: HCSMessagePayload };

export interface WalletAdapter {
  /** Isolated EVM calls and recovery; inherited Hedera payloads stay separate. */
  readonly tempo?: TempoWalletTransactions;
  readonly chain: ChainId;
  readonly name: string;
  readonly id: WalletProviderId;

  // Optional: detect if the adapter can be used on this device/session (e.g., window provider installed)
  isInstalled?(): boolean;

  getAddress(): Promise<string | null>;
  getNetwork?(): Promise<NetworkId | null>;

  connect(opts?: { silent?: boolean }): Promise<string | null>;
  disconnect(): Promise<void>;

  onAccountChange?(cb: (address: string | null) => void): () => void;
  onNetworkChange?(cb: (network: NetworkId | null) => void): () => void;

  getPublicKey?(): Promise<string | null>;
  signMessage(dataToSign: string, message?: string): Promise<Uint8Array>;
  executeContract(payload: ContractFunctionPayload): Promise<{ hash: string }>;
  executeBatch(payloads: TransactionPayload[]): Promise<{ hash: string }>;
  signAndSubmit?(transaction: object): Promise<{ hash: string; txId?: string; fileId?: string }>;
  readFileContents?(fileId: string): Promise<Uint8Array>;
}

export type WalletActionKind = "signMessage" | "executeContract" | "executeBatch" | "signAndSubmit";
