import type {ChainAdapter} from "@/lib/crypto/types/ChainAdapter";
import type {ContractArgument, ContractFunctionPayload, NetworkId, WalletAdapter, TransactionPayload} from "@/context/wallet/types.ts";
import {getCurrentConfig} from "@/config";
import type {OrderMessageRef, ProductData} from "@/lib/syncService.ts";
import type {GetStorageResult} from "@/lib/crypto/types/GetStorageResult.ts";
import type {CartItem} from "@/lib/cartStorage.ts";
import {validateCatalogCheckout} from '@/lib/catalogCheckout';
import {hexToBytes, b64ToBytes} from "@/utils/encoding.ts";
import type {InternalAccount} from "@/lib/crypto/types/InternalAccount.ts";
import * as hederaUtils from "@/lib/hedera/hederaUtils.ts";
import {decodeHcsEnvelope, encodeHcsReferenceEnvelope, HCS_MESSAGE_ROLE, HCS_MESSAGE_TYPE} from "@/lib/hedera/hcsEnvelope.ts";
import {loadEncryptedPayloadFromHfs, loadEncryptedPayloadFromHfsWithWallet, uploadEncryptedPayloadToHfs} from "@/lib/hedera/hfsStorage.ts";
import {
  publicKeyBase64FromContractBytes,
  publicKeyBase64ToContractBytes,
  hederaEntityIdToSolidityAddress,
  solidityEntityAddressToId,
} from "@picomart/order-protocol";
// @ts-ignore
import {Client, AccountId, PrivateKey, AccountCreateTransaction, Hbar, TokenId} from "@hiero-ledger/sdk";
import {ethers} from "ethers";
// @ts-ignore
import PicomartAbi from "@/contracts/Picomart.json";

// Contract catalog/order seeds are stored as raw UTF-8 bytes padded to bytes32.
function seedToBytes32(seed: string): Uint8Array {
  const encoded = new TextEncoder().encode(seed);
  if (encoded.length > 32) {
    throw new Error("Seed is too long to fit into bytes32.");
  }

  const bytes = new Uint8Array(32);
  bytes.set(encoded);
  return bytes;
}

// Hash fields are already SHA-256 outputs encoded as base64 or hex.
function hashToBytes32(hash: string): Uint8Array {
  const bytes = hash.startsWith("0x") ? hexToBytes(hash) : b64ToBytes(hash);
  if (bytes.length !== 32) {
    throw new Error("Hash must decode to exactly 32 bytes.");
  }
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  return b64ToBytes(value.trim());
}

function addressArg(value: string): ContractArgument {
  return {type: "address", value};
}

function bytesArg(value: Uint8Array): ContractArgument {
  return {type: "bytes", value};
}

function bytes32Arg(value: Uint8Array): ContractArgument {
  return {type: "bytes32", value};
}

function stringArg(value: string): ContractArgument {
  return {type: "string", value};
}

function uint256Arg(value: bigint): ContractArgument {
  return {type: "uint256", value};
}

function isHbarTokenId(tokenId: string): boolean {
  return tokenId === "HBAR" || tokenId === "0.0.0";
}

function tokenIdToContractAddress(tokenId: string): string {
  if (isHbarTokenId(tokenId)) {
    return ethers.ZeroAddress;
  }

  if (ethers.isAddress(tokenId)) {
    return tokenId;
  }

  const address = hederaEntityIdToSolidityAddress(TokenId.fromString(tokenId).toString());
  if (!address) throw new Error("Invalid packed Hedera token address");
  return address;
}

function contractAddressToTokenId(tokenAddress: string): string {
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    return "0.0.0";
  }

  const tokenId = solidityEntityAddressToId(tokenAddress);
  if (!tokenId) throw new Error("Invalid packed Hedera token address");
  return tokenId;
}

type MirrorTopicMessage = {
  message: string;
};

type MirrorTopicResponse = {
  messages?: MirrorTopicMessage[];
  links?: {
    next?: string | null;
  };
};

async function resolveEncryptedPayloadFromEnvelope(
  envelope: ReturnType<typeof decodeHcsEnvelope>,
): Promise<string | null> {
  if (!envelope) {
    return null;
  }

  if (envelope.payloadKind === "legacyText") {
    return envelope.encryptedPayload;
  }

  return await loadEncryptedPayloadFromHfs(envelope.reference.fileId, envelope.reference.payloadHash);
}

function buildHcsUrl(pathOrUrl: string, mirrorNodeUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${mirrorNodeUrl}${pathOrUrl}`;
}

async function findHcsPayloadByEnvelope(
  topicId: string,
  seed: string,
  role: number,
  allowedTypes: number[],
): Promise<string | null> {
  const config = getCurrentConfig();
  let nextUrl = `${config.hedera.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?order=desc&limit=100`;
  let pageCount = 0;

  while (nextUrl && pageCount < 20) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`Mirror node error ${response.status}`);
    }

    const data = await response.json() as MirrorTopicResponse;
    for (const message of data.messages ?? []) {
      const envelope = decodeHcsEnvelope(b64ToBytes(message.message));
      if (!envelope) {
        continue;
      }
      if (envelope.seed !== seed || envelope.role !== role || !allowedTypes.includes(envelope.type)) {
        continue;
      }
      return await resolveEncryptedPayloadFromEnvelope(envelope);
    }

    pageCount += 1;
    nextUrl = data.links?.next ? buildHcsUrl(data.links.next, config.hedera.mirrorNodeUrl) : "";
  }

  return null;
}

async function fetchHcsPayloadByMessageRefs(
  seed: string,
  messageRefs: OrderMessageRef[],
  role: number,
  allowedTypes: number[],
): Promise<string | null> {
  const config = getCurrentConfig();
  const refs = [...messageRefs]
    .filter(ref => ref.role === role && allowedTypes.includes(ref.type))
    .sort((a, b) => b.sequenceNumber - a.sequenceNumber);

  for (const ref of refs) {
    const response = await fetch(
      `${config.hedera.mirrorNodeUrl}/api/v1/topics/${ref.topicId}/messages?sequencenumber=eq:${ref.sequenceNumber}&limit=1`,
    );
    if (!response.ok) {
      throw new Error(`Mirror node error ${response.status}`);
    }

    const data = await response.json() as MirrorTopicResponse;
    const message = data.messages?.[0];
    if (!message) {
      continue;
    }

    const envelope = decodeHcsEnvelope(b64ToBytes(message.message));
    if (!envelope) {
      continue;
    }
    if (envelope.seed !== seed || envelope.role !== role || !allowedTypes.includes(envelope.type)) {
      continue;
    }

    return await resolveEncryptedPayloadFromEnvelope(envelope);
  }

  return null;
}

async function findHcsEnvelope(
  topicId: string,
  seed: string,
  role: number,
  allowedTypes: number[],
) {
  const config = getCurrentConfig();
  let nextUrl = `${config.hedera.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?order=desc&limit=100`;
  let pageCount = 0;

  while (nextUrl && pageCount < 20) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`Mirror node error ${response.status}`);
    }

    const data = await response.json() as MirrorTopicResponse;
    for (const message of data.messages ?? []) {
      const envelope = decodeHcsEnvelope(b64ToBytes(message.message));
      if (!envelope) {
        continue;
      }
      if (envelope.seed !== seed || envelope.role !== role || !allowedTypes.includes(envelope.type)) {
        continue;
      }
      return envelope;
    }

    pageCount += 1;
    nextUrl = data.links?.next ? buildHcsUrl(data.links.next, config.hedera.mirrorNodeUrl) : "";
  }

  return null;
}

async function fetchHcsEnvelopeByMessageRefs(
  seed: string,
  messageRefs: OrderMessageRef[],
  role: number,
  allowedTypes: number[],
) {
  const config = getCurrentConfig();
  const refs = [...messageRefs]
    .filter(ref => ref.role === role && allowedTypes.includes(ref.type))
    .sort((a, b) => b.sequenceNumber - a.sequenceNumber);

  for (const ref of refs) {
    const response = await fetch(
      `${config.hedera.mirrorNodeUrl}/api/v1/topics/${ref.topicId}/messages?sequencenumber=eq:${ref.sequenceNumber}&limit=1`,
    );
    if (!response.ok) {
      throw new Error(`Mirror node error ${response.status}`);
    }

    const data = await response.json() as MirrorTopicResponse;
    const message = data.messages?.[0];
    if (!message) {
      continue;
    }

    const envelope = decodeHcsEnvelope(b64ToBytes(message.message));
    if (!envelope) {
      continue;
    }
    if (envelope.seed !== seed || envelope.role !== role || !allowedTypes.includes(envelope.type)) {
      continue;
    }

    return envelope;
  }

  return null;
}

export async function loadBuyerEncryptedPayloadForDecryption(
  walletAdapter: WalletAdapter,
  seed: string,
  messageRefs?: OrderMessageRef[],
): Promise<GetStorageResult> {
  const topicId = await hederaUtils.requireHcsTopicId();
  const allowedTypes = [HCS_MESSAGE_TYPE.buyerInitialOrder];
  const envelope = messageRefs?.length
    ? await fetchHcsEnvelopeByMessageRefs(seed, messageRefs, HCS_MESSAGE_ROLE.buyer, allowedTypes)
    : await findHcsEnvelope(topicId, seed, HCS_MESSAGE_ROLE.buyer, allowedTypes);

  if (!envelope) {
    return {data: null, isFound: false};
  }

  if (envelope.payloadKind === "legacyText") {
    return {data: envelope.encryptedPayload, isFound: true};
  }

  const data = await loadEncryptedPayloadFromHfsWithWallet(
    walletAdapter,
    envelope.reference.fileId,
    envelope.reference.payloadHash,
  );

  return {data, isFound: true};
}

export async function loadSellerEncryptedPayloadForDecryption(
  walletAdapter: WalletAdapter,
  seed: string,
  messageRefs?: OrderMessageRef[],
): Promise<GetStorageResult> {
  const topicId = await hederaUtils.requireHcsTopicId();
  const allowedTypes = [HCS_MESSAGE_TYPE.sellerDelivery, HCS_MESSAGE_TYPE.sellerRefusal];
  const envelope = messageRefs?.length
    ? await fetchHcsEnvelopeByMessageRefs(seed, messageRefs, HCS_MESSAGE_ROLE.seller, allowedTypes)
    : await findHcsEnvelope(topicId, seed, HCS_MESSAGE_ROLE.seller, allowedTypes);

  if (!envelope) {
    return {data: null, isFound: false};
  }

  if (envelope.payloadKind === "legacyText") {
    return {data: envelope.encryptedPayload, isFound: true};
  }

  const data = await loadEncryptedPayloadFromHfsWithWallet(
    walletAdapter,
    envelope.reference.fileId,
    envelope.reference.payloadHash,
  );

  return {data, isFound: true};
}

export const hederaAdapter: ChainAdapter = {
  name: "hedera",

  async generateAccount() {
    return await hederaUtils.generateAccount();
  },

  async accountFromMnemonic(mnemonic: string) {
    return await hederaUtils.accountFromMnemonic(mnemonic);
  },

  accountToMnemonic(internal: InternalAccount) {
    return hederaUtils.accountToMnemonic(internal);
  },

  async signMessageInternal(internal: InternalAccount, message: string) {
    return await hederaUtils.signMessage(internal, message);
  },

  async getAccountCoinAmount(address: string, coinType: string): Promise<bigint> {
    const config = getCurrentConfig();
    try {
      const response = await fetch(`${config.hedera.mirrorNodeUrl}/api/v1/accounts/${address}`);
      const data = await response.json();
      if (isHbarTokenId(coinType)) {
        return BigInt(data.balance.balance);
      } else {
        // Fetch token balance
        const tokenResponse = await fetch(`${config.hedera.mirrorNodeUrl}/api/v1/accounts/${address}/tokens?tokenid=${coinType}`);
        const tokenData = await tokenResponse.json();
        if (tokenData.tokens && tokenData.tokens.length > 0) {
          return BigInt(tokenData.tokens[0].balance);
        }
      }
    } catch (e) {
      console.error("Error fetching balance:", e);
    }
    return 0n;
  },

  formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
    const amt = typeof amount === "bigint" ? Number(amount) : amount;
    const factor = Math.pow(10, decimals);
    return (amt / factor).toLocaleString(undefined, {
      maximumFractionDigits,
      minimumFractionDigits: 0
    });
  },

  async requestDevnetFaucet(accountAddress: string, amountOctas: number): Promise<void> {
    console.log("Faucet requested for", accountAddress, amountOctas);
    // On Hedera, you usually use the Hedera Portal for testnet HBAR
  },

  async uploadCatalogUrlToBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    sellerPubKey: string,
    catalogUrl: string
  ): Promise<string> {
    const config = getCurrentConfig();
  const seedBytes = seedToBytes32(seed);

    const payload: ContractFunctionPayload = {
      contractId: config.contractAddress,
      function: "createCatalog",
      arguments: [
        bytes32Arg(seedBytes),
        bytesArg(publicKeyBase64ToContractBytes(sellerPubKey)),
        stringArg(catalogUrl)
      ]
    };

    const result = await walletAdapter.executeContract(payload);
    return result.hash;
  },

  async deleteCatalogOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const seedBytes = seedToBytes32(seed);

    const payload: ContractFunctionPayload = {
      contractId: config.contractAddress,
      function: "deleteCatalog",
      arguments: [bytes32Arg(seedBytes)]
    };

    const result = await walletAdapter.executeContract(payload);
    return result.hash;
  },

  async createOrderInitialOnBlockchain(
    walletAdapter: WalletAdapter,
    tokenTotals: Record<string, bigint>,
    cartItems: CartItem[],
    orderSeed: string,
    buyerPubKey: string,
    encryptedSymKeyBuyer: string,
    encryptedSymKeySeller: string,
    symKeyHash: string,
    payloadHash: string,
    encryptedData: string
  ): Promise<string> {
    const config = getCurrentConfig();
    if (tokenTotals === undefined) throw new Error('Missing checkout total');
    const {items, tokenId, amount} = validateCatalogCheckout(cartItems, tokenTotals, config);
    const topicId = await hederaUtils.requireHcsTopicId();
    const first = items[0];
    const tokenAddress = tokenIdToContractAddress(tokenId);
    validateCatalogCheckout(items, tokenTotals);
    const {fileId, payloadHash: encryptedPayloadHash} = await uploadEncryptedPayloadToHfs(walletAdapter, encryptedData);

    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId,
          message: encodeHcsReferenceEnvelope(orderSeed, HCS_MESSAGE_ROLE.buyer, HCS_MESSAGE_TYPE.buyerInitialOrder, {
            fileId,
            total: amount.toString(),
            token: tokenId,
            payloadHash: encryptedPayloadHash,
          })
        }
      },
      {
        type: 'contract',
        data: {
          contractId: config.contractAddress,
          function: "createOrderInitial",
          arguments: [
            bytes32Arg(seedToBytes32(orderSeed)),
            bytes32Arg(seedToBytes32(first.seed)),
            uint256Arg(amount),
            addressArg(tokenAddress),
            bytesArg(publicKeyBase64ToContractBytes(buyerPubKey)),
            bytesArg(base64ToBytes(encryptedSymKeyBuyer)),
            bytesArg(base64ToBytes(encryptedSymKeySeller)),
            bytes32Arg(hashToBytes32(symKeyHash)),
            bytes32Arg(hashToBytes32(payloadHash))
          ]
        }
      }
    ];

    validateCatalogCheckout(items, tokenTotals);
    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async createOrderPaidOnBlockchain(
    walletAdapter: WalletAdapter,
    tokenTotals: Record<string, bigint>,
    cartItems: CartItem[],
    orderSeed: string,
    buyerPubKey: string,
    encryptedSymKeyBuyer: string,
    encryptedSymKeySeller: string,
    symKeyHash: string,
    payloadHash: string,
    encryptedData: string
  ): Promise<string> {
    const config = getCurrentConfig();
    if (tokenTotals === undefined) throw new Error('Missing checkout total');
    const {items, tokenId, amount} = validateCatalogCheckout(cartItems, tokenTotals, config);
    const topicId = await hederaUtils.requireHcsTopicId();
    const first = items[0];
    const tokenAddress = tokenIdToContractAddress(tokenId);
    validateCatalogCheckout(items, tokenTotals);
    const {fileId, payloadHash: encryptedPayloadHash} = await uploadEncryptedPayloadToHfs(walletAdapter, encryptedData);

    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId,
          message: encodeHcsReferenceEnvelope(orderSeed, HCS_MESSAGE_ROLE.buyer, HCS_MESSAGE_TYPE.buyerInitialOrder, {
            fileId,
            total: amount.toString(),
            token: tokenId,
            payloadHash: encryptedPayloadHash,
          })
        }
      }
    ];

    if (!isHbarTokenId(tokenId)) {
      // Hedera batches allow only one contract call, which must be last.
      batch.push({
        type: 'tokenAllowance',
        data: {
          tokenId,
          spender: config.contractAddress,
          amount,
        }
      });
    }

    batch.push({
      type: 'contract',
      data: {
        contractId: config.contractAddress,
        function: "createOrderPaid",
        arguments: [
          bytes32Arg(seedToBytes32(orderSeed)),
          bytes32Arg(seedToBytes32(first.seed)),
          uint256Arg(amount),
          addressArg(tokenAddress),
          bytesArg(publicKeyBase64ToContractBytes(buyerPubKey)),
          bytesArg(base64ToBytes(encryptedSymKeyBuyer)),
          bytesArg(base64ToBytes(encryptedSymKeySeller)),
          bytes32Arg(hashToBytes32(symKeyHash)),
          bytes32Arg(hashToBytes32(payloadHash))
        ],
        amount: isHbarTokenId(tokenId) ? amount : 0n
      }
    });

    validateCatalogCheckout(items, tokenTotals);
    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async refuseOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    encryptedDeliveryCommentData: string,
    _senderAddress: string,
    _tokenTypes: string[],
    _payerAddress: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const topicId = await hederaUtils.requireHcsTopicId();
    const orderData = await viewOrder(seed);
    const total = BigInt(orderData.priceAmount ?? orderData.amount ?? 0).toString();
    const token = contractAddressToTokenId(orderData.priceToken ?? orderData.token ?? ethers.ZeroAddress);
    const {fileId, payloadHash: encryptedPayloadHash} = await uploadEncryptedPayloadToHfs(walletAdapter, encryptedDeliveryCommentData);
    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId,
          message: encodeHcsReferenceEnvelope(seed, HCS_MESSAGE_ROLE.seller, HCS_MESSAGE_TYPE.sellerRefusal, {
            fileId,
            total,
            token,
            payloadHash: encryptedPayloadHash,
          })
        }
      },
      {
        type: 'contract',
        data: {
          contractId: config.contractAddress,
          function: "refuseOrder",
          arguments: [
            bytes32Arg(seedToBytes32(seed)),
            bytes32Arg(hashToBytes32(payloadHashSeller))
          ]
        }
      }
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async startDeliveringOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    encryptedDeliveryCommentData: string,
    _senderAddress: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const topicId = await hederaUtils.requireHcsTopicId();
    const orderData = await viewOrder(seed);
    const total = BigInt(orderData.priceAmount ?? orderData.amount ?? 0).toString();
    const token = contractAddressToTokenId(orderData.priceToken ?? orderData.token ?? ethers.ZeroAddress);
    const {fileId, payloadHash: encryptedPayloadHash} = await uploadEncryptedPayloadToHfs(walletAdapter, encryptedDeliveryCommentData);
    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId,
          message: encodeHcsReferenceEnvelope(seed, HCS_MESSAGE_ROLE.seller, HCS_MESSAGE_TYPE.sellerDelivery, {
            fileId,
            total,
            token,
            payloadHash: encryptedPayloadHash,
          })
        }
      },
      {
        type: 'contract',
        data: {
          contractId: config.contractAddress,
          function: "startDelivering",
          arguments: [
            bytes32Arg(seedToBytes32(seed)),
            bytes32Arg(hashToBytes32(payloadHashSeller))
          ]
        }
      }
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async cancelOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const payload: ContractFunctionPayload = {
      contractId: config.contractAddress,
      function: "cancelOrder",
      arguments: [bytes32Arg(seedToBytes32(seed))]
    };

    const result = await walletAdapter.executeContract(payload);
    return result.hash;
  },

  async confirmOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const payload: ContractFunctionPayload = {
      contractId: config.contractAddress,
      function: "confirmOrder",
      arguments: [bytes32Arg(seedToBytes32(seed))]
    };

    const result = await walletAdapter.executeContract(payload);
    return result.hash;
  },

  async requestRefundOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const payload: ContractFunctionPayload = {
      contractId: config.contractAddress,
      function: "requireRefund",
      arguments: [bytes32Arg(seedToBytes32(seed))]
    };

    const result = await walletAdapter.executeContract(payload);
    return result.hash;
  },

  async viewCatalogOnBlockchain(seed: string): Promise<ProductData> {
    const config = getCurrentConfig();
    const seedBytes = seedToBytes32(seed);

    try {
      const provider = new ethers.JsonRpcProvider(config.hedera.rpcUrl);
      const contract = new ethers.Contract(hederaUtils.getContractEvmAddress(), PicomartAbi.abi, provider);
      const catalog = await contract.catalogs(seedBytes);

      if (catalog.seller === ethers.ZeroAddress) {
        throw new Error("Catalog not found");
      }

      return {
        version: Number(catalog.version),
        seed: seed,
        shopWallet: catalog.seller,
        sellerPubKey: publicKeyBase64FromContractBytes(hexToBytes(catalog.sellerPubKey)),
        productsUrl: catalog.catalogUrl
      };
    } catch (error) {
      console.error("Error viewing catalog:", error);
      throw error;
    }
  },

  async viewBuyerData(seed: string, messageRefs?: OrderMessageRef[]): Promise<GetStorageResult> {
    return viewDataFromHCS(seed, true, messageRefs);
  },

  async viewSellerData(seed: string, messageRefs?: OrderMessageRef[]): Promise<GetStorageResult> {
    return viewDataFromHCS(seed, false, messageRefs);
  },

  async resolveAddressToName(address: string): Promise<string | null> {
    return address;
  },

  async resolveNameToAddress(name: string): Promise<string | null> {
    return name;
  },

  mapNetworkName(name?: string): NetworkId {
    if (!name) throw new Error('Network name is required');
    const n = name.toLowerCase();
    if (n.includes('main')) return 'mainnet';
    if (n.includes('test')) return 'testnet';
    if (n.includes('preview')) return 'previewnet';
    if (n.includes('local')) return 'local';
    return name as NetworkId;
  },

};

async function viewOrder(seed: string): Promise<any> {
  const config = getCurrentConfig();
    const seedBytes = seedToBytes32(seed);
  const provider = new ethers.JsonRpcProvider(config.hedera.rpcUrl);
  const contract = new ethers.Contract(hederaUtils.getContractEvmAddress(), PicomartAbi.abi, provider);
  return await contract.orders(seedBytes);
}

async function viewDataFromHCS(seed: string, isBuyer: boolean, messageRefs?: OrderMessageRef[]): Promise<GetStorageResult> {
  try {
    const topicId = await hederaUtils.requireHcsTopicId();
    const orderData = await viewOrder(seed);
    const hashHex = isBuyer ? orderData.payloadHashBuyer : orderData.payloadHashSeller;

    if (!hashHex || hashHex === ethers.ZeroHash) {
      return {isFound: false, data: ""};
    }

    const role = isBuyer ? HCS_MESSAGE_ROLE.buyer : HCS_MESSAGE_ROLE.seller;
    const allowedTypes = isBuyer
      ? [HCS_MESSAGE_TYPE.buyerInitialOrder]
      : [HCS_MESSAGE_TYPE.sellerDelivery, HCS_MESSAGE_TYPE.sellerRefusal];

    const encryptedPayload = messageRefs?.length
      ? await fetchHcsPayloadByMessageRefs(seed, messageRefs, role, allowedTypes)
      : await findHcsPayloadByEnvelope(topicId, seed, role, allowedTypes);

    if (encryptedPayload) {
      return {isFound: true, data: encryptedPayload};
    }
  } catch (e) {
    console.error("Error viewing data from HCS:", e);
  }

  return {isFound: false, data: ""};
}
