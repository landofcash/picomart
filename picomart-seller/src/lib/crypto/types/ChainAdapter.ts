import type {InternalAccount} from "@/lib/crypto/types/InternalAccount.ts";
import type {GetStorageResult} from "@/lib/crypto/types/GetStorageResult.ts";
import type {NetworkId, WalletAdapter} from "@/context/wallet/types.ts";
import type {CatalogData, OrderMessageRef} from "@/lib/syncService.ts";

export interface ChainAdapter {
  readonly name: string; // e.g., 'hedera'

  // Wallet-free operations (local/custodial)
  generateAccount(): Promise<InternalAccount>;

  accountFromMnemonic(mnemonic: string): Promise<InternalAccount>;

  accountToMnemonic(internal: InternalAccount): string | undefined;

  signMessageInternal(internal: InternalAccount, message: string): Promise<Uint8Array>;


  /**
   * Uploads a product catalogue URL to the blockchain
   * @param walletAdapter
   * @param seed The 22-character base64-encoded UUID seed
   * @param sellerPubKey The seller's public key (base64 encoded)
   * @param catalogueUrl The URL where the product catalogue JSON is hosted
   * @returns The transaction ID
   */
  uploadCatalogUrlToBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    sellerPubKey: string,
    catalogueUrl: string
  ): Promise<string>

  /**
   * Deletes a product box from the blockchain using the cleanupProduct method
   * @param walletAdapter
   * @param seed The 22-character base64-encoded seed
   * @returns The transaction ID
   */
  deleteProductBoxOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string
  ): Promise<string>

  /**
   * Refuses an order by calling the smart contract refuseOrder method
   * @param walletAdapter
   * @param seed The order seed (bytes)
   * @param payloadHashSeller The seller's payload hash (bytes)
   * @param payloadEncrypted
   * @param tokenTypes
   * @returns The transaction ID
   */
  refuseOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    payloadEncrypted: string,
    tokenTypes: string[],
  ): Promise<string>

  /**
   * Starts delivering an order by calling the smart contract startDeliveringOrder method
   * @param walletAdapter
   * @param seed The order seed (bytes)
   * @param payloadHashSeller The seller's payload hash (bytes)
   * @param payloadEncrypted
   * @returns The transaction ID
   */
  startDeliveringOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    payloadEncrypted: string
  ): Promise<string>

  /**
   * Sets the order timeout on the Picomart contract (owner-only).
   * Mirrors Solidity: setOrderTimeout(uint256 _timeout)
   * @param walletAdapter Owner wallet adapter
   * @param timeoutSeconds Timeout in seconds (must be >= 1 day)
   * @returns The transaction ID / hash
   */
  setOrderTimeout(
    walletAdapter: WalletAdapter,
    timeoutSeconds: bigint | number
  ): Promise<string>

  viewCatalogOnBlockchain(seed: string): Promise<CatalogData>

  viewBuyerData(seed: string, messageRefs?: OrderMessageRef[]): Promise<GetStorageResult>

  viewSellerData(seed: string, messageRefs?: OrderMessageRef[]): Promise<GetStorageResult>

  /**
   * Resolves an address to name (ENS on Ethereum or NFD on Algorand.)
   * @param address The address to resolve
   * @returns The address or null if not found
   * */
  resolveAddressToName(address: string): Promise<string | null>

  /**
   * Resolves a name to address (ENS on Ethereum or NFD on Algorand.)
   * @param name The name to resolve
   * @returns The name or null if not found
   */
  resolveNameToAddress(name: string): Promise<string | null>

  mapNetworkName(name ?: string): NetworkId

 // Wallet balances and faucet helpers
  getAccountCoinAmount(address: string, coinType: string): Promise<bigint>

  formatCoinAmount(
    amount: bigint | number,
    decimals: number,
    maximumFractionDigits?: number
  ): string

  requestDevnetFaucet(accountAddress: string, amount: number): Promise<void>
}
