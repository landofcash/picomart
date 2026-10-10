import type {ChainAdapter} from "@/lib/crypto/types/ChainAdapter.ts";
import {getCurrentConfig} from "@/config";
import type {CatalogData, OrderMessageRef} from "@/lib/syncService.ts";
import type {GetStorageResult} from "@/lib/crypto/types/GetStorageResult.ts";
import {b64ToBytes, hexToBytes} from "@/utils/encoding.ts";
import * as hederaUtils from "@/lib/hedera/hederaUtils.ts";
import type {
  ContractArgument,
  NetworkId,
  TransactionPayload,
  WalletAdapter,
} from "@/context/wallet/types.ts";
import {toHex} from "viem";
import {ethers} from "ethers";
import PicomartAbi from "@/contracts/Picomart.sol/Picomart.json";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";
import {decodeHcsEnvelope, encodeHcsReferenceEnvelope, HCS_MESSAGE_ROLE, HCS_MESSAGE_TYPE} from "@/lib/hedera/hcsEnvelope.ts";
import {loadEncryptedPayloadFromHfs, loadEncryptedPayloadFromHfsWithWallet, uploadEncryptedPayloadToHfs} from "@/lib/hedera/hfsStorage.ts";
import {ContractId, TokenId} from "@hiero-ledger/sdk";
import {
  publicKeyBase64FromContractBytes,
  publicKeyBase64ToContractBytes,
} from "@picomart/order-protocol";

function seedToBytes32(seed: string): Uint8Array {
  return hexToBytes(toHex(new TextEncoder().encode(seed), {size: 32}));
}

function hashToBytes32(hash: string): Uint8Array {
  const bytes = hash.startsWith("0x") ? hexToBytes(hash) : b64ToBytes(hash);
  if (bytes.length !== 32) {
    throw new Error("Hash must decode to exactly 32 bytes.");
  }
  return bytes;
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

type MirrorTopicMessage = {
  message: string;
};

type MirrorTopicResponse = {
  messages?: MirrorTopicMessage[];
  links?: {
    next?: string | null;
  };
};

function contractAddressToTokenId(tokenAddress: string): string {
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    return "0.0.0";
  }

  return TokenId.fromSolidityAddress(tokenAddress.replace(/^0x/i, "")).toString();
}

function contractIdToEvmAddress(contractId: string): string {
  if (ethers.isAddress(contractId)) {
    return contractId;
  }

  return "0x" + ContractId.fromString(contractId).toSolidityAddress();
}

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


export const hederaAdapter: ChainAdapter = {
  name: "hedera",
  generateAccount: hederaUtils.generateAccount,
  accountFromMnemonic: hederaUtils.accountFromMnemonic,
  accountToMnemonic: hederaUtils.accountToMnemonic,
  signMessageInternal: hederaUtils.signMessage,

  async getAccountCoinAmount(address: string, coinType: string): Promise<bigint> {
    return await hederaUtils.getAccountCoinAmount(address, coinType);
  },

  formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
    return hederaUtils.formatCoinAmount(amount, decimals, maximumFractionDigits);
  },

  async requestDevnetFaucet(accountAddress: string, amount: number): Promise<void> {
    throw new Error(`Faucet not implemented for Hedera accountAddress:${accountAddress} amount:${amount}`);
  },

  async uploadCatalogUrlToBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    sellerPubKey: string,
    catalogueUrl: string
  ): Promise<string> {
    console.log(`Create catalog: ${seed} wallet ${walletAdapter.name} sellerPubKey:${sellerPubKey} url:${catalogueUrl}`);
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    const config = getCurrentConfig();

    const result = await walletAdapter.executeContract({
      contractId: config.account,
      function: "createCatalog",
      arguments: [
        bytes32Arg(seedToBytes32(seed)),
        bytesArg(publicKeyBase64ToContractBytes(sellerPubKey)),
        stringArg(catalogueUrl),
      ],
    });
    return result.hash;
  },

  async deleteProductBoxOnBlockchain(walletAdapter: WalletAdapter,seed: string): Promise<string> {
    console.log(`Delete catalogue: ${seed} wallet ${walletAdapter.name}`);
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }
    const config = getCurrentConfig();
    const result = await walletAdapter.executeContract({
      contractId: config.account,
      function: "deleteCatalog",
      arguments: [bytes32Arg(seedToBytes32(seed))],
    });
    return result.hash;
  },

  async refuseOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    payloadEncrypted: string,
  ): Promise<string> {
    console.log('Refuse order:', walletAdapter.name, seed, payloadHashSeller);

    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    const config = getCurrentConfig();
    const topicId = await hederaUtils.requireHcsTopicId();
    const orderData = await viewOrder(seed);
    const total = BigInt(orderData.priceAmount ?? orderData.amount ?? 0).toString();
    const token = contractAddressToTokenId(orderData.priceToken ?? orderData.token ?? ethers.ZeroAddress);
    const {fileId, payloadHash: encryptedPayloadHash} = await uploadEncryptedPayloadToHfs(walletAdapter, payloadEncrypted);
    const batch: TransactionPayload[] = [
      {
        type: "hcs",
        data: {
          topicId,
          message: encodeHcsReferenceEnvelope(seed, HCS_MESSAGE_ROLE.seller, HCS_MESSAGE_TYPE.sellerRefusal, {
            fileId,
            total,
            token,
            payloadHash: encryptedPayloadHash,
          }),
        },
      },
      {
        type: "contract",
        data: {
          contractId: config.account,
          function: "refuseOrder",
          arguments: [
            bytes32Arg(seedToBytes32(seed)),
            bytes32Arg(hashToBytes32(payloadHashSeller)),
          ],
        },
      },
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async startDeliveringOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    payloadEncrypted: string
  ): Promise<string> {
    console.log('Start delivering:', walletAdapter.name, seed, payloadHashSeller);
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    const config = getCurrentConfig();
    const topicId = await hederaUtils.requireHcsTopicId();
    const orderData = await viewOrder(seed);
    const total = BigInt(orderData.priceAmount ?? orderData.amount ?? 0).toString();
    const token = contractAddressToTokenId(orderData.priceToken ?? orderData.token ?? ethers.ZeroAddress);
    const {fileId, payloadHash: encryptedPayloadHash} = await uploadEncryptedPayloadToHfs(walletAdapter, payloadEncrypted);
    const batch: TransactionPayload[] = [
      {
        type: "hcs",
        data: {
          topicId,
          message: encodeHcsReferenceEnvelope(seed, HCS_MESSAGE_ROLE.seller, HCS_MESSAGE_TYPE.sellerDelivery, {
            fileId,
            total,
            token,
            payloadHash: encryptedPayloadHash,
          }),
        },
      },
      {
        type: "contract",
        data: {
          contractId: config.account,
          function: "startDelivering",
          arguments: [
            bytes32Arg(seedToBytes32(seed)),
            bytes32Arg(hashToBytes32(payloadHashSeller)),
          ],
        },
      },
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async setOrderTimeout(walletAdapter: WalletAdapter, timeoutSeconds: number): Promise<string> {
    const ONE_DAY_SECONDS = 86_400n;
    if (timeoutSeconds < ONE_DAY_SECONDS) {
      throw new Error("Picomart: Timeout too short");
    }
    const config = getCurrentConfig();
    const result = await walletAdapter.executeContract({
      contractId: config.account,
      function: "setOrderTimeout",
      arguments: [uint256Arg(BigInt(timeoutSeconds))],
    });
    return result.hash;
  },

  async viewCatalogOnBlockchain(seed: string): Promise<CatalogData> {
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    try {
      const {publicClient} = getHederaClient();
      const seedBytes32 = toHex(new TextEncoder().encode(seed), {size: 32}) as `0x${string}`;
      const contractAddress = getCurrentConfig().account as `0x${string}`;
      const res = await publicClient.readContract({
        address: contractAddress,
        abi: PicomartAbi.abi,
        functionName: "catalogs",
        args: [seedBytes32],
      }) as readonly [bigint, `0x${string}`, `0x${string}`, string];

      const [versionRaw, shopWallet, sellerPubKeyHex, catalogUrl] = res;
      if (shopWallet.toLowerCase() === "0x0000000000000000000000000000000000000000") {
        throw new Error("Product not found");
      }

      const sellerPubKey = sellerPubKeyHex && sellerPubKeyHex !== "0x"
          ? publicKeyBase64FromContractBytes(hexToBytes(sellerPubKeyHex))
          : "";

      return {
        version: Number(versionRaw),
        seed,
        shopWallet,
        catalogUrl,
        sellerPubKey,
      } as CatalogData;
    } catch (error) {
      console.error("Error viewing product (hedera):", error);
      throw error;
    }
  },

  async viewBuyerData(seed: string, messageRefs?: OrderMessageRef[]): Promise<GetStorageResult> {
    try {
      const topicId = await hederaUtils.requireHcsTopicId();
      const allowedTypes = [HCS_MESSAGE_TYPE.buyerInitialOrder];
      const data = messageRefs?.length
        ? await fetchHcsPayloadByMessageRefs(seed, messageRefs, HCS_MESSAGE_ROLE.buyer, allowedTypes)
        : await findHcsPayloadByEnvelope(topicId, seed, HCS_MESSAGE_ROLE.buyer, allowedTypes);
      if (!data) return {data: null, isFound: false}
      return {data, isFound: true}
    } catch (error) {
      console.error(`Error viewBuyerData seed:${seed}`, error);
      throw error;
    }
  },

  async viewSellerData(seed: string, messageRefs?: OrderMessageRef[]): Promise<GetStorageResult> {
    try {
      const topicId = await hederaUtils.requireHcsTopicId();
      const allowedTypes = [HCS_MESSAGE_TYPE.sellerDelivery, HCS_MESSAGE_TYPE.sellerRefusal];
      const data = messageRefs?.length
        ? await fetchHcsPayloadByMessageRefs(seed, messageRefs, HCS_MESSAGE_ROLE.seller, allowedTypes)
        : await findHcsPayloadByEnvelope(topicId, seed, HCS_MESSAGE_ROLE.seller, allowedTypes);
      if (!data) return {data: null, isFound: false}
      return {data, isFound: true}
    } catch (error) {
      console.error(`Error viewSellerData seed:${seed}`, error);
      throw error;
    }
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
    return name as NetworkId;
  },
};

async function viewOrder(seed: string): Promise<ethers.Result> {
  if (!seed || seed.length !== 22) {
    throw new Error("Seed must be a 22-character string");
  }

  const config = getCurrentConfig();
  const provider = new ethers.JsonRpcProvider(config.hedera.rpcUrl);
  const contract = new ethers.Contract(contractIdToEvmAddress(config.account), PicomartAbi.abi, provider);
  return await contract.orders(seedToBytes32(seed));
}

