/**
 * Type for API response
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}


/**
 * Interface for cached product data
 */
export interface CatalogCacheEntry {
  seed: string;
  version: number;
  sellerWallet: string;
  catalogUrl?: string;
  sellerPubKey?: string;
  priceToken?: bigint;
  price?: bigint;
  description?: string;
}

/**
 * Interface for cached order data
 */
export interface OrderCacheEntry {
  version: bigint;
  seed: string; // renamed from orderId - 22 bytes base64 encoded UUID
  buyerWallet: string;
  sellerWallet: string;
  amount: bigint;
  status: bigint;
  catalogSeed: string;
  price: bigint;
  priceToken: string;
  seller: string;
  buyer: string;
  payer: string;
  buyerPubKey: string;
  sellerPubKey: string;
  encryptedSymKeyBuyer: string;
  encryptedSymKeySeller: string;
  symKeyHash: string;
  payloadHashBuyer: string;
  payloadHashSeller: string;
  createdDate: bigint;
  updatedDate: bigint;
  messages: OrderMessageRef[];
  sourceNetwork?: string;
  sourceContractId?: string;
  sourceContractEvmAddress?: string;
  innerTransactionId?: string;
  innerTransactionHash?: string;
  outerTransactionId?: string;
  outerTransactionHash?: string;
  outerConsensusTimestamp?: string;
  outerPayerAccountId?: string;
  outerTransactionType?: 'ATOMICBATCH';
  outerResult?: 'SUCCESS';
}

export interface OrderMessageRef {
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  sender: string;
  role: number;
  type: number;
}

/**
 * Interface for product store data
 */
export interface CatalogStore {
  id: string;
  sellerWallet: string;
  catalogs: CatalogCacheEntry[];
  networkName: string;
}

/**
 * Interface for the order store data
 */
export interface OrderStore {
  id: string;
  buyerWallet: string;
  orders: OrderCacheEntry[];
  networkName: string;
}

/**
 * Interface for network sync state
 */
export interface NetworkSyncState {
  networkName: string;
  lastProcessedRound: number;
}
