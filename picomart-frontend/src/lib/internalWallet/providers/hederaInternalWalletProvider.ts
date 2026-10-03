import {
  AccountId,
  AccountAllowanceApproveTransaction,
  BatchTransaction,
  ContractFunctionParameters,
  ContractId,
  ContractExecuteTransaction,
  FileContentsQuery,
  FileId,
  Hbar,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TokenAssociateTransaction,
  TokenId,
  Transaction,
} from "@hiero-ledger/sdk";
import BigNumber from "bignumber.js";
import {getConfig} from "@/config.ts";
import type {
  ContractArgument,
  ContractFunctionPayload,
  NetworkId,
  TransactionPayload,
  WalletAdapter,
} from "@/context/wallet/types.ts";
import {accountFromMnemonic, generateAccount, signMessage as signWithInternalAccount} from "@/lib/hedera/hederaUtils.ts";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";
import {encryptSecretMaterial, normalizePrivateKeyHex, privateKeyBytesToHex, privateKeyHexToBytes} from "@/lib/internalWallet/crypto.ts";
import type {InternalWalletProvider} from "@/lib/internalWallet/provider.ts";
import {
  cacheUnlockedSecret,
  getActiveWalletId,
  getCachedUnlockedSecret,
  getWalletRecord,
  isWalletLocked,
  loadWalletRecords,
  lockWalletSession,
  removeWalletRecord,
  setActiveWalletId,
  unlockWalletRecord,
  upsertWalletRecord,
} from "@/lib/internalWallet/store.ts";
import type {
  InternalWalletBackupItem,
  InternalWalletBalance,
  InternalWalletBaseIdentity,
  InternalWalletCreateInput,
  InternalWalletImportInput,
  InternalWalletLifecycleState,
  InternalWalletPassphraseChangeInput,
  InternalWalletRecord,
  InternalWalletStatus,
  InternalWalletSummary,
} from "@/lib/internalWallet/types.ts";
import {requestInternalWalletPassphrase} from "@/lib/internalWallet/unlockGate.ts";

type MirrorAccountResponse = {
  account?: string;
  alias?: string | null;
  evm_address?: string | null;
  balance?: {
    balance?: number;
    tokens?: Array<{token_id: string; balance: number}>;
  };
};

const HEDERA_PROVIDER_ID = "hedera-internal";

function normalizeEvmAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getDefaultLabel(records: InternalWalletRecord[]) {
  return `Wallet ${records.length + 1}`;
}

function buildBaseIdentity(privateKeyHex: string): InternalWalletBaseIdentity {
  const normalizedHex = normalizePrivateKeyHex(privateKeyHex);
  const privateKey = PrivateKey.fromStringECDSA(normalizedHex);
  const publicKey = privateKey.publicKey;

  return {
    publicKey: publicKey.toStringRaw(),
    evmAddress: normalizeEvmAddress(publicKey.toEvmAddress()),
    alias: null,
  };
}

function buildIdentity(record: InternalWalletRecord, network: NetworkId) {
  const networkState = record.networkStates[network];
  const accountId = networkState?.accountId ?? null;
  const evmAddress = normalizeEvmAddress(record.baseIdentity.evmAddress);

  return {
    ...record.baseIdentity,
    evmAddress,
    accountId,
    address: accountId ?? evmAddress,
  };
}

function buildSummary(record: InternalWalletRecord, network: NetworkId, activeWalletId: string | null): InternalWalletSummary {
  const networkState = record.networkStates[network] ?? {
    accountId: null,
    lifecycleState: "local_only" as const,
  };

  return {
    id: record.id,
    providerId: record.providerId,
    chain: record.chain,
    network,
    label: record.label,
    lifecycleState: networkState.lifecycleState,
    identity: buildIdentity(record, network),
    backupKinds: record.backupKinds,
    active: activeWalletId === record.id,
    locked: isWalletLocked(record.id),
    lastUsedAt: record.lastUsedAt,
  };
}

async function fetchMirrorAccount(network: NetworkId, identifier: string): Promise<MirrorAccountResponse | null> {
  const normalizedIdentifier = identifier.includes(".") ? identifier.trim() : normalizeEvmAddress(identifier);
  const url = `${getConfig(network).hedera.mirrorNodeUrl}/api/v1/accounts/${normalizedIdentifier}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Mirror node error ${response.status}`);
  }

  return await response.json() as MirrorAccountResponse;
}

function computeLifecycleState(account: MirrorAccountResponse | null): InternalWalletLifecycleState {
  const hbarBalance = BigInt(account?.balance?.balance ?? 0);

  if (!account?.account) {
    return "local_only";
  }
  if (hbarBalance <= 0n) {
    return "funded_or_alias_created";
  }
  return "ready";
}

function buildBalances(network: NetworkId, account: MirrorAccountResponse | null): InternalWalletBalance[] {
  const supportedTokens = getConfig(network).supportedTokens;
  const tokenMap = new Map((account?.balance?.tokens ?? []).map(token => [token.token_id, BigInt(token.balance)]));
  const hbarBalance = BigInt(account?.balance?.balance ?? 0);

  return supportedTokens.map(token => {
    const raw = token.tokenId === "0.0.0" ? hbarBalance : (tokenMap.get(token.tokenId) ?? 0n);
    return {
      tokenId: token.tokenId,
      symbol: token.name,
      decimals: token.decimals,
      raw,
      formatted: (Number(raw) / Math.pow(10, token.decimals)).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      }),
      associated: token.tokenId === "0.0.0" ? true : tokenMap.has(token.tokenId),
    };
  });
}

function buildBootstrapCopy(network: NetworkId, lifecycleState: InternalWalletLifecycleState) {
  if (lifecycleState === "local_only") {
    return {
      bootstrapRequired: true,
      canTransact: false,
      bootstrapTitle: "Activate wallet on Hedera",
      bootstrapMessage: network === "testnet"
        ? "This wallet exists only in your browser. Fund the alias or EVM address from the Hedera faucet or another wallet, then refresh until an account ID is resolved."
        : "This wallet exists only in your browser. Fund the alias or EVM address externally, then refresh until the Hedera account ID is resolved.",
    };
  }

  if (lifecycleState === "funded_or_alias_created") {
    return {
      bootstrapRequired: true,
      canTransact: false,
      bootstrapTitle: "Wallet detected, HBAR still needed",
      bootstrapMessage: "The Hedera account exists, but it does not have enough HBAR to be used reliably for marketplace transactions. Add HBAR, then refresh.",
    };
  }

  return {
    bootstrapRequired: false,
    canTransact: true,
    bootstrapTitle: null,
    bootstrapMessage: null,
  };
}

async function getProviderRecords() {
  const records = await loadWalletRecords();
  return records.filter(record => record.providerId === HEDERA_PROVIDER_ID);
}

async function getProviderRecord(walletId: string): Promise<InternalWalletRecord> {
  const record = await getWalletRecord(walletId);
  if (!record || record.providerId !== HEDERA_PROVIDER_ID) {
    throw new Error("Internal wallet not found.");
  }
  return record;
}

async function saveRefreshedStatus(record: InternalWalletRecord, network: NetworkId): Promise<InternalWalletStatus> {
  const evmAddress = normalizeEvmAddress(record.baseIdentity.evmAddress);
  const account = await fetchMirrorAccount(network, evmAddress);
  const lifecycleState = computeLifecycleState(account);
  const accountId = account?.account ?? null;
  const updatedRecord: InternalWalletRecord = {
    ...record,
    updatedAt: nowIso(),
    baseIdentity: {
      ...record.baseIdentity,
      evmAddress,
    },
    networkStates: {
      ...record.networkStates,
      [network]: {
        accountId,
        lifecycleState,
      },
    },
  };

  await upsertWalletRecord(updatedRecord);

  const activeWalletId = await getActiveWalletId("hedera", network);
  const summary = buildSummary(updatedRecord, network, activeWalletId);
  const bootstrap = buildBootstrapCopy(network, lifecycleState);

  return {
    ...summary,
    balances: buildBalances(network, account),
    ...bootstrap,
  };
}

async function getActiveWalletRecord(network: NetworkId): Promise<InternalWalletRecord | null> {
  const activeWalletId = await getActiveWalletId("hedera", network);
  if (!activeWalletId) {
    return null;
  }
  return await getProviderRecord(activeWalletId);
}

async function requireUnlockedSecret(
  record: InternalWalletRecord,
  reason: "sign-message" | "sign-transaction" | "backup-reveal",
  reasonLabel: string,
) {
  const cached = getCachedUnlockedSecret(record.id);
  if (cached) {
    return cached;
  }

  const passphrase = await requestInternalWalletPassphrase({
    walletId: record.id,
    walletLabel: record.label,
    reason,
    reasonLabel,
  });

  return await unlockWalletRecord(record, passphrase);
}

async function markWalletUsed(record: InternalWalletRecord) {
  const updatedRecord: InternalWalletRecord = {
    ...record,
    lastUsedAt: nowIso(),
    updatedAt: nowIso(),
  };
  await upsertWalletRecord(updatedRecord);
}

function buildContractFunctionParameters(argumentsList: ContractArgument[]): ContractFunctionParameters {
  const parameters = new ContractFunctionParameters();

  for (const argument of argumentsList) {
    switch (argument.type) {
      case "address":
        parameters.addAddress(argument.value);
        break;
      case "bytes":
        parameters.addBytes(argument.value);
        break;
      case "bytes32":
        parameters.addBytes32(argument.value);
        break;
      case "string":
        parameters.addString(argument.value);
        break;
      case "uint256":
        parameters.addUint256(new BigNumber(argument.value.toString()));
        break;
      default: {
        const unreachable: never = argument;
        throw new Error(`Unsupported contract argument: ${String(unreachable)}`);
      }
    }
  }

  return parameters;
}

function toSdkContractId(contractId: string): ContractId | string {
  if (contractId.trim().startsWith("0x")) {
    return ContractId.fromEvmAddress(0, 0, contractId);
  }

  return contractId;
}

function buildSdkTransaction(payload: TransactionPayload, accountId: AccountId) {
  if (payload.type === "tokenAllowance") {
    return new AccountAllowanceApproveTransaction().approveTokenAllowance(
      payload.data.tokenId,
      accountId,
      toSdkContractId(payload.data.spender),
      new BigNumber(payload.data.amount.toString()),
    );
  }

  if (payload.type === "contract") {
    const transaction = new ContractExecuteTransaction()
      .setContractId(toSdkContractId(payload.data.contractId))
      .setGas(1_000_000)
      .setFunction(payload.data.function, buildContractFunctionParameters(payload.data.arguments));

    if (payload.data.amount) {
      transaction.setPayableAmount(Hbar.fromTinybars(payload.data.amount.toString()));
    }

    return transaction;
  }

  return new TopicMessageSubmitTransaction()
    .setTopicId(payload.data.topicId)
    .setMessage(payload.data.message);
}

async function executeContractWithSecret(
  status: InternalWalletStatus,
  privateKeyHex: string,
  payload: ContractFunctionPayload,
): Promise<{hash: string}> {
  const {sdkClient} = getHederaClient();
  const accountId = AccountId.fromString(status.identity.accountId!);
  const privateKey = PrivateKey.fromStringECDSA(privateKeyHex);
  sdkClient.setOperator(accountId, privateKey);

  const transaction = new ContractExecuteTransaction()
    .setContractId(toSdkContractId(payload.contractId))
    .setGas(1_000_000)
    .setFunction(payload.function, buildContractFunctionParameters(payload.arguments));

  if (payload.amount) {
    transaction.setPayableAmount(Hbar.fromTinybars(payload.amount.toString()));
  }

  const response = await transaction.execute(sdkClient);
  await response.getReceipt(sdkClient);

  return {hash: response.transactionId.toString()};
}

async function executeBatchWithSecret(
  status: InternalWalletStatus,
  privateKeyHex: string,
  payloads: TransactionPayload[],
): Promise<{hash: string}> {
  const {sdkClient} = getHederaClient();
  const accountId = AccountId.fromString(status.identity.accountId!);
  const privateKey = PrivateKey.fromStringECDSA(privateKeyHex);
  sdkClient.setOperator(accountId, privateKey);
  const batchKey = privateKey.publicKey;
  const innerTransactions = [];

  for (const payload of payloads) {
    const transaction = buildSdkTransaction(payload, accountId);
    await transaction.batchify(sdkClient, batchKey);
    innerTransactions.push(transaction);
  }

  const batchTransaction = new BatchTransaction()
    .setInnerTransactions(innerTransactions)
    .freezeWith(sdkClient);

  await batchTransaction.sign(privateKey);
  const response = await batchTransaction.execute(sdkClient);
  await response.getReceipt(sdkClient);

  return {hash: response.transactionId.toString()};
}

async function signAndSubmitWithSecret(
  status: InternalWalletStatus,
  privateKeyHex: string,
  transaction: Transaction,
): Promise<{hash: string; txId?: string; fileId?: string}> {
  const {sdkClient} = getHederaClient();
  const accountId = AccountId.fromString(status.identity.accountId!);
  const privateKey = PrivateKey.fromStringECDSA(privateKeyHex);
  sdkClient.setOperator(accountId, privateKey);

  const response = await transaction.execute(sdkClient);
  const receipt = await response.getReceipt(sdkClient);

  return {
    hash: response.transactionHash ? Buffer.from(response.transactionHash).toString("hex") : "",
    txId: response.transactionId?.toString(),
    fileId: receipt.fileId?.toString(),
  };
}

async function readFileContentsWithSecret(
  status: InternalWalletStatus,
  privateKeyHex: string,
  fileId: string,
): Promise<Uint8Array> {
  const {sdkClient} = getHederaClient();
  const accountId = AccountId.fromString(status.identity.accountId!);
  const privateKey = PrivateKey.fromStringECDSA(privateKeyHex);
  sdkClient.setOperator(accountId, privateKey);

  const contents = await new FileContentsQuery()
    .setFileId(FileId.fromString(fileId))
    .execute(sdkClient);

  return new Uint8Array(contents);
}

class HederaInternalWalletProvider implements InternalWalletProvider {
  readonly id = HEDERA_PROVIDER_ID;
  readonly chain = "hedera" as const;
  readonly displayName = "Internal Wallet";

  async listWallets(network: NetworkId): Promise<InternalWalletSummary[]> {
    const records = await getProviderRecords();
    const activeWalletId = await getActiveWalletId(this.chain, network);
    return records.map(record => buildSummary(record, network, activeWalletId));
  }

  async getActiveWallet(network: NetworkId): Promise<InternalWalletStatus | null> {
    const record = await getActiveWalletRecord(network);
    if (!record) {
      return null;
    }
    return await saveRefreshedStatus(record, network);
  }

  async createWallet(network: NetworkId, input: InternalWalletCreateInput): Promise<InternalWalletStatus> {
    const existingRecords = await getProviderRecords();
    const account = await generateAccount();
    const privateKeyHex = privateKeyBytesToHex(account.sk);
    const now = nowIso();

    const record: InternalWalletRecord = {
      id: crypto.randomUUID(),
      providerId: this.id,
      chain: this.chain,
      label: input.label?.trim() || getDefaultLabel(existingRecords),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      baseIdentity: buildBaseIdentity(privateKeyHex),
      networkStates: {},
      backupKinds: account.mnemonic ? ["mnemonic", "privateKey"] : ["privateKey"],
      encryptedSecret: await encryptSecretMaterial(input.passphrase, {
        privateKeyHex,
        mnemonic: account.mnemonic,
        importedAs: account.mnemonic ? "mnemonic" : "privateKey",
      }),
    };

    await upsertWalletRecord(record);
    await setActiveWalletId(this.chain, network, record.id);
    cacheUnlockedSecret(record.id, {
      privateKeyHex,
      mnemonic: account.mnemonic,
      importedAs: account.mnemonic ? "mnemonic" : "privateKey",
    });

    return await saveRefreshedStatus(record, network);
  }

  async importWallet(network: NetworkId, input: InternalWalletImportInput): Promise<InternalWalletStatus> {
    const mnemonic = input.mnemonic?.trim();
    const rawPrivateKey = input.privateKey?.trim();
    if (!mnemonic && !rawPrivateKey) {
      throw new Error("Provide a mnemonic or private key to import.");
    }

    let privateKeyHex: string;
    let backupKinds: Array<"mnemonic" | "privateKey">;

    if (mnemonic) {
      const account = await accountFromMnemonic(mnemonic);
      privateKeyHex = privateKeyBytesToHex(account.sk);
      backupKinds = ["mnemonic", "privateKey"];
    } else {
      privateKeyHex = normalizePrivateKeyHex(rawPrivateKey!);
      backupKinds = ["privateKey"];
    }

    const baseIdentity = buildBaseIdentity(privateKeyHex);
    const existingRecords = await getProviderRecords();
    const duplicate = existingRecords.find(record => normalizeEvmAddress(record.baseIdentity.evmAddress) === baseIdentity.evmAddress);

    if (duplicate) {
      await setActiveWalletId(this.chain, network, duplicate.id);
      return await saveRefreshedStatus(duplicate, network);
    }

    const now = nowIso();
    const record: InternalWalletRecord = {
      id: crypto.randomUUID(),
      providerId: this.id,
      chain: this.chain,
      label: input.label?.trim() || getDefaultLabel(existingRecords),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      baseIdentity,
      networkStates: {},
      backupKinds,
      encryptedSecret: await encryptSecretMaterial(input.passphrase, {
        privateKeyHex,
        mnemonic,
        importedAs: mnemonic ? "mnemonic" : "privateKey",
      }),
    };

    await upsertWalletRecord(record);
    await setActiveWalletId(this.chain, network, record.id);
    cacheUnlockedSecret(record.id, {
      privateKeyHex,
      mnemonic,
      importedAs: mnemonic ? "mnemonic" : "privateKey",
    });

    return await saveRefreshedStatus(record, network);
  }

  async activateWallet(network: NetworkId, walletId: string): Promise<InternalWalletStatus> {
    const record = await getProviderRecord(walletId);
    await setActiveWalletId(this.chain, network, record.id);
    return await saveRefreshedStatus(record, network);
  }

  async disconnect(network: NetworkId): Promise<void> {
    await setActiveWalletId(this.chain, network, null);
  }

  async refreshWallet(network: NetworkId, walletId: string): Promise<InternalWalletStatus> {
    const record = await getProviderRecord(walletId);
    return await saveRefreshedStatus(record, network);
  }

  async removeWallet(network: NetworkId, walletId: string): Promise<void> {
    const activeWalletId = await getActiveWalletId(this.chain, network);
    if (activeWalletId === walletId) {
      await setActiveWalletId(this.chain, network, null);
    }
    await removeWalletRecord(walletId);
  }

  async lockWallet(walletId: string): Promise<void> {
    lockWalletSession(walletId);
  }

  async unlockWallet(network: NetworkId, walletId: string, passphrase: string): Promise<InternalWalletStatus> {
    const record = await getProviderRecord(walletId);
    await unlockWalletRecord(record, passphrase);
    return await this.refreshWallet(network, walletId);
  }

  async changePassphrase(network: NetworkId, walletId: string, input: InternalWalletPassphraseChangeInput): Promise<InternalWalletStatus> {
    const record = await getProviderRecord(walletId);
    const secret = await unlockWalletRecord(record, input.currentPassphrase ?? "");
    const updatedRecord: InternalWalletRecord = {
      ...record,
      updatedAt: nowIso(),
      encryptedSecret: await encryptSecretMaterial(input.nextPassphrase, secret),
    };

    await upsertWalletRecord(updatedRecord);
    cacheUnlockedSecret(updatedRecord.id, secret);
    return await saveRefreshedStatus(updatedRecord, network);
  }

  async revealBackup(walletId: string, passphrase?: string): Promise<InternalWalletBackupItem[]> {
    const record = await getProviderRecord(walletId);
    const secret = passphrase
      ? await unlockWalletRecord(record, passphrase)
      : await requireUnlockedSecret(record, "backup-reveal", "Reveal backup material");

    if (!secret.mnemonic) {
      return [];
    }

    return [{
      kind: "mnemonic",
      label: "Recovery Phrase",
      value: secret.mnemonic,
    }];
  }

  async associateToken(network: NetworkId, walletId: string, tokenId: string): Promise<InternalWalletStatus> {
    const record = await getProviderRecord(walletId);
    const status = await saveRefreshedStatus(record, network);

    if (!status.identity.accountId || !status.canTransact) {
      throw new Error(status.bootstrapMessage ?? "This wallet is not ready for token association yet.");
    }

    const secret = await requireUnlockedSecret(record, "sign-transaction", "Sign transaction");
    const {sdkClient} = getHederaClient();
    const accountId = AccountId.fromString(status.identity.accountId);
    const privateKey = PrivateKey.fromStringECDSA(secret.privateKeyHex);
    sdkClient.setOperator(accountId, privateKey);

    const transaction = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([TokenId.fromString(tokenId)])
      .freezeWith(sdkClient);

    const response = await transaction.sign(privateKey).then(signed => signed.execute(sdkClient));
    await response.getReceipt(sdkClient);
    await markWalletUsed(record);

    return await this.refreshWallet(network, walletId);
  }

  getWalletAdapter(network: NetworkId): WalletAdapter {
    return {
      chain: this.chain,
      id: "internal",
      name: "Built-in (Internal)",
      isInstalled() {
        return true;
      },
      async getAddress() {
        const activeWallet = await hederaInternalWalletProvider.getActiveWallet(network);
        return activeWallet?.identity.address ?? null;
      },
      async getPublicKey() {
        const record = await getActiveWalletRecord(network);
        return record?.baseIdentity.publicKey ?? null;
      },
      async getNetwork() {
        return network;
      },
      async connect(opts) {
        const activeWallet = await hederaInternalWalletProvider.getActiveWallet(network);
        if (activeWallet) {
          return activeWallet.identity.address;
        }

        if (opts?.silent) {
          return null;
        }

        const wallets = await hederaInternalWalletProvider.listWallets(network);
        if (wallets.length === 0) {
          return null;
        }

        const connected = await hederaInternalWalletProvider.activateWallet(network, wallets[0].id);
        return connected.identity.address;
      },
      async disconnect() {
        await hederaInternalWalletProvider.disconnect(network);
      },
      onAccountChange() {
        return () => undefined;
      },
      onNetworkChange() {
        return () => undefined;
      },
      async signMessage(dataToSign: string) {
        const record = await getActiveWalletRecord(network);
        if (!record) {
          throw new Error("No active internal wallet.");
        }

        const secret = await requireUnlockedSecret(record, "sign-message", "Sign message");
        return await signWithInternalAccount({
          addr: normalizeEvmAddress(record.baseIdentity.evmAddress),
          sk: privateKeyHexToBytes(secret.privateKeyHex),
          mnemonic: secret.mnemonic,
        }, dataToSign);
      },
      async executeContract(payload: ContractFunctionPayload) {
        const record = await getActiveWalletRecord(network);
        if (!record) {
          throw new Error("No active internal wallet.");
        }

        const status = await saveRefreshedStatus(record, network);
        if (!status.canTransact || !status.identity.accountId) {
          throw new Error(status.bootstrapMessage ?? "This wallet is not ready for transactions yet.");
        }

        const secret = await requireUnlockedSecret(record, "sign-transaction", "Sign transaction");
        const result = await executeContractWithSecret(status, secret.privateKeyHex, payload);
        await markWalletUsed(record);
        return result;
      },
      async executeBatch(payloads: TransactionPayload[]) {
        const record = await getActiveWalletRecord(network);
        if (!record) {
          throw new Error("No active internal wallet.");
        }

        const status = await saveRefreshedStatus(record, network);
        if (!status.canTransact || !status.identity.accountId) {
          throw new Error(status.bootstrapMessage ?? "This wallet is not ready for transactions yet.");
        }

        const secret = await requireUnlockedSecret(record, "sign-transaction", "Sign transaction");
        const result = await executeBatchWithSecret(status, secret.privateKeyHex, payloads);
        await markWalletUsed(record);
        return result;
      },
      async signAndSubmit(transaction: object) {
        const record = await getActiveWalletRecord(network);
        if (!record) {
          throw new Error("No active internal wallet.");
        }

        const status = await saveRefreshedStatus(record, network);
        if (!status.canTransact || !status.identity.accountId) {
          throw new Error(status.bootstrapMessage ?? "This wallet is not ready for transactions yet.");
        }

        const secret = await requireUnlockedSecret(record, "sign-transaction", "Sign transaction");
        const result = await signAndSubmitWithSecret(status, secret.privateKeyHex, transaction as Transaction);
        await markWalletUsed(record);
        return result;
      },
      async readFileContents(fileId: string) {
        const record = await getActiveWalletRecord(network);
        if (!record) {
          throw new Error("No active internal wallet.");
        }

        const status = await saveRefreshedStatus(record, network);
        if (!status.canTransact || !status.identity.accountId) {
          throw new Error(status.bootstrapMessage ?? "This wallet is not ready for transactions yet.");
        }

        const secret = await requireUnlockedSecret(record, "sign-transaction", "Read file contents");
        const result = await readFileContentsWithSecret(status, secret.privateKeyHex, fileId);
        await markWalletUsed(record);
        return result;
      },
    };
  }
}

export const hederaInternalWalletProvider = new HederaInternalWalletProvider();
