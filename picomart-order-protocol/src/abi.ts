export const PICOMART_ABI = [
  "function createOrderPaid(bytes32 seed,bytes32 catalogSeed,uint256 priceAmount,address priceToken,bytes buyerPubKey,bytes encKeyBuyer,bytes encKeySeller,bytes32 symKeyHash,bytes32 payloadHashBuyer) payable",
  "function catalogs(bytes32 seed) view returns (uint8 version,address seller,bytes sellerPubKey,string catalogUrl)",
  "function orders(bytes32 seed) view returns (uint8 version,bytes32 catalogSeed,uint8 status,uint256 priceAmount,address priceToken,address seller,address buyer,address payer,bytes buyerPubKey,bytes sellerPubKey,bytes encSymKeyBuyer,bytes encSymKeySeller,bytes32 symKeyHash,bytes32 payloadHashBuyer,bytes32 payloadHashSeller,uint64 createdTs,uint64 updatedTs)",
] as const;

export const HTS_APPROVE_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
] as const;
