import type {ChainId, ContractFunctionPayload, NetworkId, TransactionPayload, WalletAdapter} from "@/context/wallet/types.ts";
import {APP_NAME, BASE_URL, getCurrentConfig} from "@/config";
import {
  base64StringToSignatureMap,
  base64StringToUint8Array,
  DAppConnector,
  extractFirstSignature,
  transactionToBase64String,
} from "@hashgraph/hedera-wallet-connect";
import type {LogLevel} from "@hashgraph/hedera-wallet-connect/dist/lib/shared/logger";
import {LedgerId, type TransactionResponseJSON} from "@hiero-ledger/sdk";
import type {SignClientTypes} from "@walletconnect/types";

export type HederaWalletConnectAdapterOptions = {
  id?: string
  name?: string
  chain?: ChainId

  projectId: string
  metadata: SignClientTypes.Metadata

  /** The network used to format signerAccountId like hedera:testnet:0.0.123 */
  network: NetworkId

  /** DAppConnector network LedgerId */
  ledgerId: LedgerId

  /**
   * If you want to connect() to open QR modal automatically, use 'modal'.
   * If you want to handle URI yourself, use 'uri'.
   */
  connectMode?: 'modal' | 'uri'

  /**
   * Called when connectMode='uri' to deliver the WC URI (QR/deeplink).
   * For web apps you can show your own QR; for mobile you can deep-link.
   */
  onUri?: (uri: string) => void

  /**
   * Polling interval used for account/network change detection
   * because DAppConnector does not expose subscription hooks publicly.
   */
  pollIntervalMs?: number

  /**
   * Supported methods/events/chains passed into DAppConnector constructor.
   * Usually you can omit these and let DAppConnector default.
   */
  methods?: string[]
  events?: string[]
  chains?: string[]

  logLevel: LogLevel
}

export class HederaWalletConnectAdapter implements WalletAdapter {
  readonly chain: ChainId
  readonly name: string
  readonly id: string

  private readonly dAppConnector: DAppConnector
  private readonly network: NetworkId
  private readonly connectMode: 'modal' | 'uri'
  private readonly onUri?: (uri: string) => void

  private initialized = false
  private currentAccount: string | null = null

  constructor(opts: HederaWalletConnectAdapterOptions) {
    this.chain = opts.chain ?? 'hedera'
    this.name = opts.name ?? 'Hedera WalletConnect'
    this.id = opts.id ?? 'hedera-wallet-connect'

    this.network = opts.network
    this.connectMode = opts.connectMode ?? 'modal'
    this.onUri = opts.onUri

    this.dAppConnector = new DAppConnector(
      opts.metadata,
      opts.ledgerId,
      opts.projectId,
      opts.methods,
      opts.events,
      opts.chains,
      opts.logLevel,
    )
  }

  /**
   * You must call this once before using connect/sign methods.
   */
  async init(): Promise<void> {
    if (this.initialized) return
    await this.dAppConnector.init({ logger: 'error' })
    this.initialized = true
    this.refreshFromConnector()
  }

  isInstalled(): boolean {
    return true
  }

  async getAddress(): Promise<string | null> {
    this.refreshFromConnector()
    return this.currentAccount
  }

  async getNetwork(): Promise<NetworkId | null> {
    this.refreshFromConnector()
    return this.network
  }

  async getPublicKey(): Promise<string | null> {
    return null
  }

  async connect(opts?: { silent?: boolean }): Promise<string | null> {
    await this.ensureInit()

    this.refreshFromConnector()
    if (opts?.silent && this.currentAccount) return this.currentAccount

    if (this.connectMode === 'modal') {
      await this.dAppConnector.openModal(undefined, false)
    } else {
      if (!this.onUri) {
        throw new Error("connectMode='uri' requires opts.onUri callback in constructor to receive WalletConnect URI",)
      }
      await this.dAppConnector.connect((uri) => this.onUri?.(uri))
    }
    this.refreshFromConnector()
    return this.currentAccount
  }

  async disconnect(): Promise<void> {
    await this.ensureInit()
    await this.dAppConnector.disconnectAll() // public API
    this.currentAccount = null
  }

  onNetworkChange(cb: (network: NetworkId | null) => void): () => void {
    // DAppConnector doesn't expose a chain/network subscription publicly.
    // This adapter is configured for a single network.
    cb(this.network)
    return () => {
      // no-op
    }
  }

  async signMessage(dataToSign: string): Promise<Uint8Array> {
    await this.ensureInit()
    const account = await this.requireAccount()
    const res = await this.dAppConnector.signMessage({
      signerAccountId: this.formatSignerAccountId(account),
      message: dataToSign,
    })
    const signatureMapLike = res.result.signatureMap;
    try {
      const signatureMap = base64StringToSignatureMap(signatureMapLike)
      return extractFirstSignature(signatureMap)
    } catch {
      return base64StringToUint8Array(signatureMapLike)
    }
  }

  async signAndSubmit(transaction: object): Promise<{ hash: string, txId: string, fileId?: string }> {
    await this.ensureInit()
    const hederaTransaction = transaction as any
    const account = await this.requireAccount()
    const res = await this.dAppConnector.signAndExecuteTransaction({
      signerAccountId: this.formatSignerAccountId(account),
      transactionList: transactionToBase64String(hederaTransaction as any),
    })
    console.log(res)
    const result = (res as unknown) as TransactionResponseJSON;
    const hash =result.transactionHash;
    const txId = result.transactionId;
    return { hash, txId }
  }

  async readFileContents(_fileId: string): Promise<Uint8Array> {
    throw new Error('External Hedera file reads are not configured in seller yet.')
  }

  async executeContract(_payload: ContractFunctionPayload): Promise<{ hash: string }> {
    throw new Error('External Hedera contract execution is not configured in seller yet.')
  }

  async executeBatch(_payloads: TransactionPayload[]): Promise<{ hash: string }> {
    throw new Error('External Hedera batch execution is not configured in seller yet.')
  }

  // -------------------------
  // Internals
  // -------------------------

  private async ensureInit() {
    if (!this.initialized) {
      await this.init()
    }
  }

  private refreshFromConnector() {
    const signer = this.dAppConnector.signers[this.dAppConnector.signers.length - 1]
    if(!signer) return
    this.currentAccount = signer.getAccountId().toString()
  }

  private formatSignerAccountId(accountId: string): string {
    // HIP-30 format expected by hedera-wallet-connect: hedera:<network>:<shard>.<realm>.<num>
    // Keep getAddress() returning the raw <shard>.<realm>.<num> string.
    if (accountId.startsWith('hedera:')) return accountId

    const parts = accountId.split(':')
    if (parts.length === 2) {
      // Allow callers to pass '<network>:0.0.x'
      return `hedera:${parts[0]}:${parts[1]}`
    }
    if (parts.length >= 3) {
      // Already namespaced (unknown scheme) — don't double-wrap.
      return accountId
    }

    return `hedera:${this.network}:${accountId}`
  }

  private async requireAccount(): Promise<string> {
    const addr = await this.getAddress()
    if (!addr) throw new Error('Wallet not connected')
    return addr
  }
}

// ---------------------------------------------------------------------------
// Default exported instance used by WalletContext
// ---------------------------------------------------------------------------

const defaultMetadata: SignClientTypes.Metadata = {
  name: APP_NAME,
  description: `${APP_NAME} Seller Portal`,
  url: BASE_URL,
  icons: [`${BASE_URL}/favicon.ico`],
}

function ledgerIdForNetwork(network: NetworkId): LedgerId {
  if (network === 'mainnet') return LedgerId.MAINNET
  if (network === 'testnet') return LedgerId.TESTNET
  return LedgerId.TESTNET
}

export function createHashpackWalletAdapter(network: NetworkId = getCurrentConfig().name as NetworkId) {
  return new HederaWalletConnectAdapter({
    id: 'hashpack',
    name: 'HashPack',
    chain: 'hedera',
    projectId: '705402d29011540cddc4d19b6aab8448',
    metadata: defaultMetadata,
    network,
    ledgerId: ledgerIdForNetwork(network),
    connectMode: 'modal',
    logLevel: 'error',
  })
}

export const hashpackWalletAdapter = createHashpackWalletAdapter()

