import {ArrowLeft, Wallet, Loader2, CheckCircle, AlertCircle, Check, ChevronDown, ChevronUp, X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Link, Navigate, useNavigate} from 'react-router-dom'
import {useState} from 'react'
import { safePriceToDisplayString as priceToDisplayString } from '@/lib/tokenUtils'
import TokenIcon from '@/components/TokenIcon'
import AppShellCard from '@/components/AppShellCard'
import {useWallet} from '@/context/WalletContext'
import {explorerTxUrl} from '@/config'
import {formatCryptoError} from '@/lib/cryptoFormat'
import {encodeBase64Uuid} from '@/lib/uuidUtils'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {generateAESKey, encryptAES, encryptWithECIES} from '@/utils/encryption'
import {signPrefix} from '@/config'
import {hashCryptoKeyToB64, b64FromBytes, sha256} from '@/utils/encoding'
import ExpandableData from '@/components/ExpandableData'
import {stateToOrderData} from '@/lib/payWithUtils'
import {useOrder} from "@/context/OrderContext.tsx";
import ShopVerificationMessage from '@/components/ShopVerificationMessage'
import {removePurchasedItems, type CartItem} from '@/lib/cartStorage'
import {checkoutError} from '@/lib/catalogCheckout'
import CatalogIdentity from '@/components/CatalogIdentity'
import InvalidCheckout from '@/components/InvalidCheckout'
import type {OrderState} from '@/context/OrderContext'
import {getChainAdapter} from "@/lib/crypto/cryptoUtils.ts";


type PaymentStatus = 'idle' | 'connecting' | 'signing-seed' | 'confirming' | 'processing' | 'success' | 'error'
type PaymentStep = 1 | 2

function PayWithCryptoPage() {
  const {order, clearOrder} = useOrder()
  const {
    walletAddress,
    walletCanTransact,
    walletBootstrapMessage,
    walletKind,
    signMessage,
    walletAdapter,
    network,
  } = useWallet()
  const navigate = useNavigate()
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle')
  const [currentStep, setCurrentStep] = useState<PaymentStep>(1)
  const [error, setError] = useState<string>('')
  const [transactionId, setTransactionId] = useState<string>('')
  const [orderSeed, setOrderSeed] = useState<string>('')
  const [signedSeed, setSignedSeed] = useState<string>('')
  const [encryptedDeliveryInfo, setEncryptedDeliveryInfo] = useState<string>('')
  const [encryptedSymKey, setEncryptedSymKey] = useState<string>('')
  const [keyPair, setKeyPair] = useState<{ publicKey: string; privateKey: string } | null>(null)
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null)
  const [symmetricKeyHash, setSymmetricKeyHash] = useState<string>('')
  const [payloadHash, setPayloadHash] = useState<string>('')
  const [debugExpanded, setDebugExpanded] = useState(false)
  const [preparedOrder, setPreparedOrder] = useState<OrderState | null>(null)
  const [purchasedItems, setPurchasedItems] = useState<CartItem[] | null>(null)

  const handleConnectWallet = async () => {
    navigate('/wallet?returnTo=/pay-crypto')
  }

  const handleSignSeed = async () => {
    if (!walletAddress) {
      setError('Please connect your wallet first')
      return
    }

    if (!order) {
      setError('Invalid payment state')
      return
    }

    const invalidCheckout = checkoutError(order, network)
    if (invalidCheckout) {
      setError(invalidCheckout)
      setPaymentStatus('error')
      return
    }

    setPaymentStatus('signing-seed')
    setError('')

    try {
      // Step 1: Generate random order seed
      const seed = encodeBase64Uuid(crypto.randomUUID())
      setOrderSeed(seed)

      // Step 2: Prepare order data
      const orderData = stateToOrderData(order)
      const orderDataJson = JSON.stringify(orderData)

      // Step 3: Sign the seed with the wallet
      const data = signPrefix + seed
      const message = "Sign order seed for secure payment"
      const signed = await signMessage(data, message)
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signed)))
      setSignedSeed(signedBase64)

      // Step 4: Generate key pair and encrypt delivery info
      const generatedKeyPair = await generateKeyPairFromB64(signedBase64)
      setKeyPair(generatedKeyPair)

      const aes = await generateAESKey()
      setAesKey(aes)

      // Encrypt order data
      const encryptedPayload = await encryptAES(aes, orderDataJson)

      const encryptedKey = await encryptWithECIES(generatedKeyPair.publicKey, aes)

      setEncryptedDeliveryInfo(encryptedPayload)
      setEncryptedSymKey(encryptedKey)

      // Generate hashes for debug info
      const hashAES = await hashCryptoKeyToB64(aes)
      setSymmetricKeyHash(hashAES)

      const hashPayload = b64FromBytes(await sha256(new TextEncoder().encode(orderDataJson)))
      setPayloadHash(hashPayload)

      // Move to step 2
      const invalidAfterSigning = checkoutError(order, network)
      if (invalidAfterSigning) throw new Error(invalidAfterSigning)
      setPreparedOrder(order)
      setCurrentStep(2)
      setPaymentStatus('idle')

    } catch (err) {
      console.error('Seed signing error:', err)
      setError(formatCryptoError(err))
      setPaymentStatus('error')
    }
  }

  const handlePayment = async () => {
    if (!walletAddress || !signedSeed || !encryptedDeliveryInfo || !keyPair || !walletAdapter) {
      setError('Please complete step 1 first')
      return
    }

    if (!order) {
      setError('Invalid payment state')
      return
    }

    const {tokenTotals, cartItems} = order

    setPaymentStatus('confirming')
    setError('')

    try {
      const invalidCheckout = checkoutError(order, network)
      if (invalidCheckout) throw new Error(invalidCheckout)
      if (preparedOrder !== order) throw new Error('The order changed. Prepare the payment again.')
      setPaymentStatus('processing')

      // Get the seller public key from the first cart item
      const sellerPubKey = cartItems[0].sellerPubKey

      // Encrypt symmetric key for seller as well
      const encryptedSymKeySeller = await encryptWithECIES(sellerPubKey, aesKey!)
      const chainAdapter = getChainAdapter()
      const txId = await chainAdapter.createOrderPaidOnBlockchain(
        walletAdapter,
        tokenTotals,
        cartItems,
        orderSeed,
        keyPair.publicKey,
        encryptedSymKey,
        encryptedSymKeySeller,
        symmetricKeyHash,
        payloadHash,
        encryptedDeliveryInfo
      )

      setTransactionId(txId)
      setPurchasedItems(cartItems.map(item => ({...item})))
      setPaymentStatus('success')

    } catch (err) {
      console.error('Payment error:', err)
      setError(formatCryptoError(err))
      setPaymentStatus('error')
    }
  }

  const handleRetry = () => {
    setPreparedOrder(null)
    setPaymentStatus('idle')
    setCurrentStep(1)
    setError('')
    setTransactionId('')
    setOrderSeed('')
    setSignedSeed('')
    setEncryptedDeliveryInfo('')
    setEncryptedSymKey('')
    setKeyPair(null)
    setAesKey(null)
    setSymmetricKeyHash('')
    setPayloadHash('')
    setDebugExpanded(false)
  }

  const handleReturnToHome = () => {
    if (paymentStatus === 'success' && purchasedItems) {
      removePurchasedItems(purchasedItems)
      setPurchasedItems(null)

      // Clear the order from context and sessionStorage
      clearOrder()
    }

    // Navigate to home
    navigate('/')
  }

  const getExplorerUrl = (txId: string) => {
    return explorerTxUrl(txId)
  }

  if (!order) {
    return <Navigate to="/cart" replace/>
  }

  const invalidCheckout = checkoutError(order, network)
  if (invalidCheckout && paymentStatus !== 'success') return <InvalidCheckout message={invalidCheckout}/>

  const {cartItems, deliveryInfo, tokenTotals} = order

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          {/* Only show the order link when payment is not successful */}
          {paymentStatus !== 'success' && (
            <Link to="/order">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5"/>
              </Button>
            </Link>
          )}
          <CardTitle className="text-2xl font-bold">Pay with crypto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <CatalogIdentity seed={cartItems[0].seed}/>
          {/* Payment Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="font-medium">Total Amount:</div>
                {Object.entries(tokenTotals).map(([tokenType, total]) => (
                  <div key={tokenType} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TokenIcon assetId={tokenType} size={20}/>
                      <span className="font-bold">
                        {priceToDisplayString(tokenType, total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t text-sm text-muted-foreground">
                <p><strong>Items:</strong> {cartItems.length}</p>

                {/* Conditional delivery information display */}
                {deliveryInfo.noPhysicalDelivery ? (
                  <>
                    {deliveryInfo.email && (
                      <p><strong>Email:</strong> {deliveryInfo.email}</p>
                    )}
                    {deliveryInfo.deliveryComments && (
                      <p><strong>Comments:</strong> {deliveryInfo.deliveryComments}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p><strong>Delivery to:</strong> {deliveryInfo.fullName}</p>
                    <p>{deliveryInfo.address}, {deliveryInfo.city} {deliveryInfo.postalCode}</p>
                  </>
                )}

                {cartItems.length > 0 && (
                  <p><strong>Shop:</strong> {cartItems[0].shopWallet.slice(0, 8)}...{cartItems[0].shopWallet.slice(-8)}
                  </p>
                )}
                {orderSeed && (
                  <p><strong>Order ID:</strong> <span className="font-mono text-xs">{orderSeed}</span></p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Combined Payment Process & Status */}
          {paymentStatus !== 'success' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wallet className="h-5 w-5"/>
                  Payment Process & Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Step 1: Sign Order Seed */}
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {currentStep > 1 ? (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="h-4 w-4 text-white"/>
                      </div>
                    ) : (
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center`}>
                        <span className="text-sm font-medium">1</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${currentStep > 1 ? 'text-green-600' : 'text-foreground'}`}>
                      Sign Order Seed </p>
                    <p className="text-sm text-muted-foreground">
                      Create secure order identifier and encrypt delivery info </p>
                  </div>
                </div>

                {/* Step 2: Process Payment */}
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center`}>
                      <span className="text-sm font-medium">2</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Sign transaction and submit to the network </p>
                  </div>
                </div>

                {/* Current Status */}
                <div className="pt-4 border-t">
                  {paymentStatus === 'idle' && (
                    <div className="text-center space-y-2">
                      <p className="text-muted-foreground">
                        {!walletAddress ? 'Please connect your Hedera wallet to continue' :
                          walletKind === 'internal' && !walletCanTransact ? (walletBootstrapMessage || 'Fund and activate this wallet before paying') :
                            currentStep === 1 ? 'Ready to sign order seed' : 'Ready to process payment'}
                      </p>
                      {walletAdapter && walletAddress && (
                        <p className="text-sm font-mono bg-muted p-2 rounded">
                          Connected {walletAdapter.name}: {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                        </p>
                      )}
                    </div>
                  )}

                  {paymentStatus === 'connecting' && (
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                      <p className="text-muted-foreground">Connecting to wallet...</p>
                    </div>
                  )}

                  {paymentStatus === 'signing-seed' && (
                    <div className="text-center space-y-3">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                      <p className="text-muted-foreground">Please sign the order seed in your wallet</p>
                      <p className="text-xs text-muted-foreground">This creates a secure order identifier</p>
                      <Button variant="outline" size="sm" onClick={handleRetry} className="mt-2">
                        <X className="mr-2 h-4 w-4"/>
                        Cancel Signing
                      </Button>
                    </div>
                  )}

                  {paymentStatus === 'confirming' && (
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                      <p className="text-muted-foreground">Please confirm the payment transaction in your wallet</p>
                    </div>
                  )}

                  {paymentStatus === 'processing' && (
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                      <p className="text-muted-foreground">Processing payment on the network...</p>
                      <p className="text-xs text-muted-foreground">This may take a few seconds</p>
                    </div>
                  )}

                  {paymentStatus === 'error' && (
                    <div className="text-center space-y-2">
                      <AlertCircle className="h-8 w-8 text-destructive mx-auto"/>
                      <p className="text-destructive font-medium">Payment failed</p>
                      {error && (
                        <div
                          className="text-sm text-destructive bg-destructive/10 p-3 rounded text-left whitespace-pre-wrap">
                          {error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success Status (separate card when payment is successful) */}
          {paymentStatus === 'success' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500"/>
                  Payment Successful
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-2">
                  <p className="text-green-600 font-medium">Your payment has been processed successfully!</p>
                  {transactionId && (
                    <div className="space-y-2">
                      <p className="text-xs font-mono bg-green-50 p-2 rounded break-all">
                        TX: {transactionId}
                      </p>
                      <a href={getExplorerUrl(transactionId)} target="_blank" rel="noopener noreferrer"
                         className="text-xs text-blue-600 hover:underline">
                        View on the explorer →
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Debug Information Panel */}
          {signedSeed && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between cursor-pointer"
                           onClick={() => setDebugExpanded(!debugExpanded)}>
                  <span>🔍 Debug Information</span>
                  {debugExpanded ? (
                    <ChevronUp className="h-5 w-5"/>
                  ) : (
                    <ChevronDown className="h-5 w-5"/>
                  )}
                </CardTitle>
              </CardHeader>
              {debugExpanded && (
                <CardContent className="space-y-4">
                  {/* Order Seed */}
                  <div className="p-3 bg-muted rounded-md">
                    <h3 className="font-semibold text-blue-600 mb-2 text-sm">Order Seed (UUID)</h3>
                    <p className="text-xs font-mono break-all">{orderSeed}</p>
                  </div>

                  {/* Signed Seed */}
                  <div className="p-3 bg-muted rounded-md">
                    <h3 className="font-semibold text-yellow-600 mb-2 text-sm">Signed Seed (base64)</h3>
                    <ExpandableData value={signedSeed}/>
                  </div>

                  {/* Key Pair */}
                  {keyPair && (
                    <div className="p-3 bg-muted rounded-md space-y-2">
                      <div>
                        <p className="text-sm font-medium">🔓 Public Key:</p>
                        <p className="text-xs font-mono break-all">{keyPair.publicKey}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">🔐 Private Key:</p>
                        <ExpandableData value={keyPair.privateKey}/>
                      </div>
                    </div>
                  )}

                  {/* AES Key Hash */}
                  {symmetricKeyHash && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium">🔑 AES Key Hash:</p>
                      <p className="text-xs font-mono break-all">{symmetricKeyHash}</p>
                    </div>
                  )}

                  {/* Payload Hash */}
                  {payloadHash && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium">📦 Payload Hash:</p>
                      <p className="text-xs font-mono break-all">{payloadHash}</p>
                    </div>
                  )}

                  {/* Encrypted Order Data */}
                  {encryptedDeliveryInfo && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <h3 className="font-semibold text-green-700 mb-2 text-sm">Encrypted Order Data</h3>
                      <ExpandableData value={encryptedDeliveryInfo}/>
                    </div>
                  )}

                  {/* Encrypted Symmetric Key */}
                  {encryptedSymKey && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <h3 className="font-semibold text-green-700 mb-2 text-sm">Encrypted Symmetric Key</h3>
                      <ExpandableData value={encryptedSymKey}/>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {paymentStatus === 'idle' && (
              <>
                {!walletAddress ? (
                  <Button className="w-full" size="lg" onClick={handleConnectWallet}>
                    <Wallet className="mr-2 h-5 w-5"/>
                    Open Wallet
                  </Button>
                ) : walletKind === 'internal' && !walletCanTransact ? (
                  <Button className="w-full" size="lg" onClick={handleConnectWallet}>
                    <Wallet className="mr-2 h-5 w-5"/>
                    Activate Wallet
                  </Button>
                ) : currentStep === 1 ? (
                  <div className="space-y-3">
                    {/* Shop Verification Message - Above Sign Order Seed button */}
                    {cartItems.length > 0 && (
                      <ShopVerificationMessage shopWallet={cartItems[0].shopWallet}/>
                    )}

                    <Button className="w-full" size="lg" onClick={handleSignSeed}>
                      <Wallet className="mr-2 h-5 w-5"/>
                      Sign Order Seed
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full" size="lg" onClick={handlePayment}>
                    <Wallet className="mr-2 h-5 w-5"/>
                    Proceed with Payment
                  </Button>
                )}
              </>
            )}

            {paymentStatus === 'error' && (
              <Button className="w-full" size="lg" onClick={handleRetry}>
                Try Again
              </Button>
            )}

            {paymentStatus === 'success' && (
              <Button className="w-full" size="lg" onClick={handleReturnToHome}>
                Return to Home
              </Button>
            )}
          </div>

          {/* Security Notice */}
          {paymentStatus === 'idle' && walletAdapter && (
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>🔒 Your transaction will be securely processed</p>
              <p>⚡ Fast confirmation times</p>
              <p>🔐 Order information is encrypted with your wallet signature</p>
            </div>
          )}
        </CardContent>
      </AppShellCard>
    </div>
  )
}

export default PayWithCryptoPage
