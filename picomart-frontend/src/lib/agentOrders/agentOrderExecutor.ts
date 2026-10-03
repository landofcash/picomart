import type {PicomartDeliveryDetailsV1, PicomartOrderQuoteV1} from '@picomart/order-protocol'
import type {WalletAdapter} from '@/context/wallet/types'
import {getCurrentConfig, signPrefix} from '@/config'
import {getHcsTopicId} from '@/lib/hedera/hederaUtils'
import {getChainAdapter} from '@/lib/crypto/cryptoUtils'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {generateAESKey, encryptAES, encryptWithECIES} from '@/utils/encryption'
import {b64FromBytes, hashCryptoKeyToB64, sha256} from '@/utils/encoding'
import {assertQuoteExecutable} from '@/lib/agentOrders/quoteExpiry'
import {validateCatalogCheckout} from '@/lib/catalogCheckout'

export type AgentOrderExecutionInput = {
  quote: PicomartOrderQuoteV1
  delivery: PicomartDeliveryDetailsV1
  walletAdapter: WalletAdapter
  signMessage: (data: string, message: string) => Promise<Uint8Array>
}

export async function executeQuotedPicomartOrder(input: AgentOrderExecutionInput): Promise<string> {
  const {quote, delivery, walletAdapter, signMessage} = input
  assertQuoteExecutable(quote)
  const config = getCurrentConfig()
  const cartItems = quote.items.map(item => ({
    id: item.productId, name: item.name, price: BigInt(item.unitAmount), priceToken: quote.payment.asset,
    quantity: item.quantity, image: 'https://picomart.zkbytes.com/logo.svg', shopWallet: quote.catalog.sellerEvmAddress,
    sellerPubKey: quote.catalog.sellerPublicKey, seed: quote.catalog.seed, network: 'testnet',
  }))
  const tokenTotals = {[quote.payment.asset]: BigInt(quote.payment.amount)}
  validateCatalogCheckout(cartItems, tokenTotals, config)
  const currentTopic = await getHcsTopicId('testnet')
  if (config.name !== 'testnet' || config.contractAddress !== quote.picomart.contractId ||
      config.contractEvmAddress !== quote.picomart.contractEvmAddress ||
      currentTopic.trim() !== quote.picomart.hcsTopicId) {
    throw new Error('The active wallet contract or topic no longer matches the approved quote.')
  }
  assertQuoteExecutable(quote)
  const signed = await signMessage(`${signPrefix}${quote.orderSeed}`, 'Approve this Picomart agent order')
  assertQuoteExecutable(quote)
  const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signed)))
  const keyPair = await generateKeyPairFromB64(signedBase64)
  const aesKey = await generateAESKey()
  const orderData = {
    deliveryInfo: delivery,
    cartItems: quote.items.map(item => ({
      id: item.productId, name: item.name, price: item.unitAmount,
      priceToken: quote.payment.asset, quantity: item.quantity,
    })),
  }
  const plaintext = JSON.stringify(orderData)
  const encryptedPayload = await encryptAES(aesKey, plaintext)
  const encryptedSymKeyBuyer = await encryptWithECIES(keyPair.publicKey, aesKey)
  const encryptedSymKeySeller = await encryptWithECIES(quote.catalog.sellerPublicKey, aesKey)
  const symKeyHash = await hashCryptoKeyToB64(aesKey)
  const payloadHash = b64FromBytes(await sha256(new TextEncoder().encode(plaintext)))
  assertQuoteExecutable(quote)
  return getChainAdapter().createOrderPaidOnBlockchain(
    walletAdapter,
    tokenTotals,
    cartItems,
    quote.orderSeed,
    keyPair.publicKey,
    encryptedSymKeyBuyer,
    encryptedSymKeySeller,
    symKeyHash,
    payloadHash,
    encryptedPayload,
  )
}
