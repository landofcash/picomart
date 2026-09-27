export const PICOMART_ABI = [
  // Catalog
  'event CatalogCreated(bytes32 indexed seed, address indexed seller)',
  'event CatalogUpdated(bytes32 indexed seed)',
  'event CatalogDeleted(bytes32 indexed seed)',

  // Orders
  'event OrderCreated(bytes32 indexed seed, address indexed buyer, address indexed seller)',
  'event OrderPaid(bytes32 indexed seed)',
  'event OrderDelivering(bytes32 indexed seed)',
  'event OrderCompleted(bytes32 indexed seed)',
  'event OrderRefundRequested(bytes32 indexed seed)',
  'event OrderRefundedToBuyer(bytes32 indexed seed)',
  'event OrderRefundedToSeller(bytes32 indexed seed)',
  'event OrderCanceled(bytes32 indexed seed)',
  'event OrderDeleted(bytes32 indexed seed)',

  // Public mapping getters
  'function catalogs(bytes32) view returns (uint8 version, address seller, bytes sellerPubKey, string catalogUrl)',
  'function orders(bytes32) view returns (uint8 version, bytes32 catalogSeed, uint8 status, uint256 priceAmount, address priceToken, address seller, address buyer, address payer, bytes buyerPubKey, bytes sellerPubKey, bytes encSymKeyBuyer, bytes encSymKeySeller, bytes32 symKeyHash, bytes32 payloadHashBuyer, bytes32 payloadHashSeller, uint64 createdTs, uint64 updatedTs)',
  'function hcsTopicId() view returns (string)',
  'function orderTimeout() view returns (uint256)',
] as const;
