import {CatalogCacheEntry, OrderCacheEntry} from "./types/types";
import {bytes32ToHex, bytesToBase64, isZeroAddress} from "./encoding";
import {bytes32ToSeedString} from "./seed";
import {
  hexToBytes,
  normalizeSolidityAddress,
  publicKeyBase64FromContractBytes,
} from "@picomart/order-protocol";

function contractPublicKeyToBase64(value: Uint8Array | string): string {
  try {
    const bytes = typeof value === "string" ? hexToBytes(value) : value;
    return publicKeyBase64FromContractBytes(bytes);
  } catch {
    return "";
  }
}

export function mapCatalogRowToCacheEntry(seedBytes32: string, row: any): CatalogCacheEntry | null {
  const seller = String(row?.seller ?? '');
  if (!seller || isZeroAddress(seller)) return null;

  const version = Number(row?.version ?? 1);
  const sellerPubKey = contractPublicKeyToBase64(row?.sellerPubKey ?? '0x');
  const catalogUrl = String(row?.catalogUrl ?? '');

  return {
    seed: bytes32ToSeedString(seedBytes32),
    version: Number.isFinite(version) ? version : 1,
    sellerWallet: seller,
    catalogUrl,
    sellerPubKey,
  };
}

export function mapOrderRowToCacheEntry(seedBytes32: string, row: any): OrderCacheEntry | null {
  const buyer = String(row?.buyer ?? '');
  if (!buyer || isZeroAddress(buyer)) return null;

  const seller = String(row?.seller ?? '');

  const payerAddr = String(row?.payer ?? '');
  const payer = payerAddr && !isZeroAddress(payerAddr) ? payerAddr : '';

  // ABI encodes uint8 fields as bigint/number-like; coerce through Number for safety.
  const version = BigInt(Number(row?.version ?? 1));
  const status = BigInt(Number(row?.status ?? 0));

  const catalogSeedBytes32 = String(row?.catalogSeed ?? '0x');
  const priceAmount = BigInt(String(row?.priceAmount ?? 0));
  const rawPriceToken = String(row?.priceToken ?? '');
  const priceToken = normalizeSolidityAddress(rawPriceToken) ?? rawPriceToken;

  return {
    version,
    seed: bytes32ToSeedString(seedBytes32),
    buyerWallet: buyer,
    sellerWallet: seller,
    amount: priceAmount,
    status,
    catalogSeed: bytes32ToSeedString(catalogSeedBytes32),
    price: priceAmount,
    priceToken,
    seller,
    buyer,
    payer,
    buyerPubKey: contractPublicKeyToBase64(row?.buyerPubKey ?? '0x'),
    sellerPubKey: contractPublicKeyToBase64(row?.sellerPubKey ?? '0x'),
    encryptedSymKeyBuyer: bytesToBase64(row?.encSymKeyBuyer ?? '0x'),
    encryptedSymKeySeller: bytesToBase64(row?.encSymKeySeller ?? '0x'),
    symKeyHash: bytes32ToHex(String(row?.symKeyHash ?? '0x')),
    payloadHashBuyer: bytes32ToHex(String(row?.payloadHashBuyer ?? '0x')),
    payloadHashSeller: bytes32ToHex(String(row?.payloadHashSeller ?? '0x')),
    createdDate: BigInt(String(row?.createdTs ?? 0)),
    updatedDate: BigInt(String(row?.updatedTs ?? 0)),
    messages: [],
  };
}
