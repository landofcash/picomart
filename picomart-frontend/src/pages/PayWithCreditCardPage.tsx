import {ArrowLeft, CreditCard, Loader2, CheckCircle, AlertCircle, Lock, ChevronUp, ChevronDown} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Link, Navigate, useNavigate} from 'react-router-dom'
import {useState} from 'react'
import { safePriceToDisplayString as priceToDisplayString } from '@/lib/tokenUtils'
import TokenIcon from '@/components/TokenIcon'
import AppShellCard from '@/components/AppShellCard'
import {encodeBase64Uuid} from "@/lib/uuidUtils.ts";
import {getConfig, signPrefix} from "@/config.ts";
import {useWallet} from "@/context/WalletContext.tsx";
import {generateKeyPairFromB64} from '@/utils/keygen'
import {encryptAES, encryptWithECIES, generateAESKey} from '@/utils/encryption'
import {b64FromBytes, hashCryptoKeyToB64, sha256} from "@/utils/encoding.ts";
import {stateToOrderData} from '@/lib/payWithUtils'
import ExpandableData from "@/components/ExpandableData.tsx";
import {useOrder} from '@/context/OrderContext'
import ShopVerificationMessage from '@/components/ShopVerificationMessage'
import {removePurchasedItems, type CartItem} from '@/lib/cartStorage'
import {checkoutError} from '@/lib/catalogCheckout'
import CatalogIdentity from '@/components/CatalogIdentity'
import InvalidCheckout from '@/components/InvalidCheckout'
import AddressDisplay from '@/components/AddressDisplay'
import {getChainAdapter} from "@/lib/crypto/cryptoUtils.ts";

type PaymentStatus = 'idle' | 'processing' | 'success' | 'error'

interface CreditCardInfo {
  cardNumber: string
  expiryDate: string
  cvv: string
  cardholderName: string
}


function PayWithCreditCardPage() {
  const {order, clearOrder} = useOrder()
  const {walletKind, signMessage, walletAdapter, network} = useWallet()
  const navigate = useNavigate()
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle')
  const [error, setError] = useState<string>('')
  const [transactionId, setTransactionId] = useState<string>('')
  const [orderSeed, setOrderSeed] = useState<string>('')
  const [signedSeed, setSignedSeed] = useState<string>('')
  const [keyPair, setKeyPair] = useState<{ publicKey: string; privateKey: string } | null>(null)
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null)
  const [encryptedSymKeySeller, setEncryptedSymKeySeller] = useState<string>('')
  const [encryptedSymKey, setEncryptedSymKey] = useState<string>('')
  const [symmetricKeyHash, setSymmetricKeyHash] = useState<string>('')
  const [encryptedDeliveryInfo, setEncryptedDeliveryInfo] = useState<string>('')
  const [payloadHash, setPayloadHash] = useState<string>('')
  const [debugExpanded, setDebugExpanded] = useState(false)
  const [purchasedItems, setPurchasedItems] = useState<CartItem[] | null>(null)

  const [cardInfo, setCardInfo] = useState<CreditCardInfo>({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: ''
  })

  const handleInputChange = (field: keyof CreditCardInfo, value: string) => {
    setCardInfo(prev => ({...prev, [field]: value}))
  }

  const formatCardNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '')
    // Add spaces every 4 digits
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ')
    return formatted.slice(0, 19) // Limit to 16 digits + 3 spaces
  }

  const formatExpiryDate = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '')
    // Add slash after 2 digits
    if (digits.length >= 2) {
      return digits.slice(0, 2) + '/' + digits.slice(2, 4)
    }
    return digits
  }

  const handleCardNumberChange = (value: string) => {
    const formatted = formatCardNumber(value)
    handleInputChange('cardNumber', formatted)
  }

  const handleExpiryDateChange = (value: string) => {
    const formatted = formatExpiryDate(value)
    handleInputChange('expiryDate', formatted)
  }

  const handleCvvChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    handleInputChange('cvv', digits)
  }

  const isFormValid = () => {
    return cardInfo.cardNumber.replace(/\s/g, '').length === 16 &&
      cardInfo.expiryDate.length === 5 &&
      cardInfo.cvv.length >= 3 &&
      cardInfo.cardholderName.trim().length > 0
  }
  const logError = (message: string) => {
    console.error(message)
    setError(message)
    setPaymentStatus('error')
  }
  const handlePayment = async () => {
    if (!isFormValid()) {
      setError('Please fill in all card details correctly')
      return
    }
    setPaymentStatus('processing')
    setError('')
    try {
      if (walletKind === 'external') {
        logError("(Beta Version) Crypto wallet is not supported with CC payment. " +
          "Please explicitly disconnect Crypto wallet to use CC payment.")
        return
      }

      if (walletAdapter === null) {
        logError("Please connect your wallet to proceed with CC payment.")
        return
      }

      if (!order) {
        logError('Invalid payment state')
        return
      }

      const invalidCheckout = checkoutError(order, network)
      if (invalidCheckout) throw new Error(invalidCheckout)

      const {tokenTotals, cartItems} = order
      const sellerPublicKey = cartItems[0].sellerPubKey

      // Prepare order data
      const orderData = stateToOrderData(order)
      const orderDataJson = JSON.stringify(orderData)

      //create seed and sign it
      const seed = encodeBase64Uuid(crypto.randomUUID())
      setOrderSeed(seed)
      const message = "Sign order seed for secure payment"
      const signed = await signMessage(signPrefix + seed, message)
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signed)))
      setSignedSeed(signedBase64)
      const generatedKeyPairLocal = await generateKeyPairFromB64(signedBase64)
      setKeyPair(generatedKeyPairLocal)
      const aesLocal = await generateAESKey()
      setAesKey(aesLocal)

      const encryptedDeliveryInfoLocal = await encryptAES(aesLocal, orderDataJson)

      const encryptedSymKeyLocal = await encryptWithECIES(generatedKeyPairLocal.publicKey, aesLocal)
      const encryptedSymKeySellerLocal = await encryptWithECIES(sellerPublicKey, aesLocal)
      setEncryptedDeliveryInfo(encryptedDeliveryInfoLocal)
      setEncryptedSymKey(encryptedSymKeyLocal)
      setEncryptedSymKeySeller(encryptedSymKeySellerLocal)

      const hashAES = await hashCryptoKeyToB64(aesLocal)
      setSymmetricKeyHash(hashAES)
      const payloadHashLocal = b64FromBytes(await sha256(new TextEncoder().encode(orderDataJson)))
      setPayloadHash(payloadHashLocal)
      const chainAdapter = getChainAdapter()
      const txId = await chainAdapter.createOrderInitialOnBlockchain(
        walletAdapter,
        tokenTotals,
        cartItems,
        seed,
        generatedKeyPairLocal.publicKey,
        encryptedSymKeyLocal,
        encryptedSymKeySellerLocal,
        hashAES,
        payloadHashLocal,
        encryptedDeliveryInfoLocal)

      setTransactionId(txId)

      // Simulate payment process
      await new Promise(resolve => setTimeout(resolve, 3000))
      setTransactionId('CC_' + Math.random().toString(36).substring(2, 9).toUpperCase())
      setPaymentStatus('success')
      setPurchasedItems(cartItems.map(item => ({...item})))

    } catch (err) {
      logError(err instanceof Error ? err.message : 'Payment failed')
    }
  }

  const handleRetry = () => {
    setPaymentStatus('idle')
    setError('')
    setTransactionId('')
  }

  const handleAutoFill = () => {
    setCardInfo({
      cardNumber: '4532 1234 5678 9012',
      expiryDate: '12/25',
      cvv: '123',
      cardholderName: 'John Doe'
    })
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

  if (!order) {
    return <Navigate to="/cart" replace/>
  }

  const invalidCheckout = checkoutError(order, network)
  if (invalidCheckout && paymentStatus !== 'success') return <InvalidCheckout message={invalidCheckout}/>

  const {cartItems, deliveryInfo, tokenTotals} = order

  // Calculate total in USD (simplified conversion)
  const totalUSD = Object.entries(tokenTotals).reduce((sum, [tokenType, total]) => {
    // TODO: Implement real-time crypto to USD conversion
    // For now, using simplified conversion rates by coinType
    const conversionRates: Record<string, number> = {
      '0.0.0': 0.10, // HBAR to USD (placeholder)
      '0.0.429274': 1.0, // USDC to USD placeholder
    }

    const token = getConfig(cartItems[0].network).supportedTokens.find(candidate => candidate.tokenId === tokenType)!
    const rate = conversionRates[tokenType] || 1.0
    const amount = Number(total) / (10 ** token.decimals)
    return sum + (amount * rate)
  }, 0)

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
          <CardTitle className="text-2xl font-bold">Pay with Credit Card</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <CatalogIdentity seed={cartItems[0].seed}/>
          <AddressDisplay value={cartItems[0].shopWallet} length={20} preferAccountId/>
          {/* Payment Status */}
          {paymentStatus !== 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5"/>
                  Payment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {paymentStatus === 'processing' && (
                  <div className="text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                    <p className="text-muted-foreground">Processing your payment...</p>
                  </div>
                )}

                {paymentStatus === 'success' && (
                  <div className="text-center space-y-2">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto"/>
                    <p className="text-green-600 font-medium">Payment successful!</p>
                    {transactionId && (
                      <p className="text-xs font-mono bg-green-50 p-2 rounded">
                        Transaction ID: {transactionId}
                      </p>
                    )}
                  </div>
                )}

                {paymentStatus === 'error' && (
                  <div className="text-center space-y-2">
                    <AlertCircle className="h-8 w-8 text-destructive mx-auto"/>
                    <p className="text-destructive font-medium">Payment failed</p>
                    {error && (
                      <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                        {error}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Credit Card Form */}
          {paymentStatus === 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="h-5 w-5"/>
                  Card Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="cardNumber" className="block text-sm font-medium mb-1">
                    Card Number *
                  </label>
                  <input id="cardNumber" type="text" value={cardInfo.cardNumber}
                         onChange={(e) => handleCardNumberChange(e.target.value)}
                         className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                         placeholder="1234 5678 9012 3456" maxLength={19}/>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="expiryDate" className="block text-sm font-medium mb-1">
                      Expiry Date *
                    </label>
                    <input id="expiryDate" type="text" value={cardInfo.expiryDate}
                           onChange={(e) => handleExpiryDateChange(e.target.value)}
                           className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                           placeholder="MM/YY" maxLength={5}/>
                  </div>

                  <div>
                    <label htmlFor="cvv" className="block text-sm font-medium mb-1">
                      CVV *
                    </label>
                    <input id="cvv" type="text" value={cardInfo.cvv} onChange={(e) => handleCvvChange(e.target.value)}
                           className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                           placeholder="123" maxLength={4}/>
                  </div>
                </div>

                <div>
                  <label htmlFor="cardholderName" className="block text-sm font-medium mb-1">
                    Cardholder Name *
                  </label>
                  <input id="cardholderName" type="text" value={cardInfo.cardholderName}
                         onChange={(e) => handleInputChange('cardholderName', e.target.value)}
                         className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                         placeholder="John Doe"/>
                </div>

                <Button variant="outline" size="sm" onClick={handleAutoFill} className="w-full">
                  Auto-fill with test data
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Payment Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="font-medium">Crypto Amounts:</div>
                {Object.entries(tokenTotals).map(([tokenType, total]) => (
                  <div key={tokenType} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <TokenIcon assetId={tokenType} size={16}/>
                      <span>{priceToDisplayString(tokenType, total)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center font-bold">
                  <span>Total (USD):</span>
                  <span>${totalUSD.toFixed(2)}</span>
                </div>
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
              </div>
            </CardContent>
          </Card>

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

                  {/* Encrypted Symmetric Key */}
                  {aesKey && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <h3 className="font-semibold text-green-700 mb-2 text-sm">🔐 AES Key</h3>
                      <ExpandableData value={aesKey}/>
                    </div>
                  )}
                  {encryptedSymKey && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <h3 className="font-semibold text-green-700 mb-2 text-sm">Encrypted Symmetric Key (Buyer)</h3>
                      <ExpandableData value={encryptedSymKey}/>
                    </div>
                  )}
                  {encryptedSymKeySeller && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <h3 className="font-semibold text-green-700 mb-2 text-sm">Encrypted Symmetric Key (Seller)</h3>
                      <ExpandableData value={encryptedSymKeySeller}/>
                    </div>
                  )}

                  {/* Encrypted Order Data */}
                  {encryptedDeliveryInfo && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <h3 className="font-semibold text-green-700 mb-2 text-sm">Encrypted Order Data</h3>
                      <ExpandableData value={encryptedDeliveryInfo}/>
                    </div>
                  )}

                  {/* Payload Hash */}
                  {payloadHash && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium">📦 Payload Hash:</p>
                      <p className="text-xs font-mono break-all">{payloadHash}</p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {paymentStatus === 'idle' && (
              <div className="space-y-3">
                {/* Shop Verification Message - Above Pay button */}
                {cartItems.length > 0 && (
                  <ShopVerificationMessage shopWallet={cartItems[0].shopWallet}/>
                )}

                <Button className="w-full" size="lg" onClick={handlePayment} disabled={!isFormValid()}>
                  <CreditCard className="mr-2 h-5 w-5"/>
                  Pay ${totalUSD.toFixed(2)}
                </Button>
              </div>
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

          {paymentStatus === 'idle' && (
            <div className="text-xs text-muted-foreground text-center">
              <p className="flex items-center justify-center gap-1">
                <Lock className="h-3 w-3"/>
                Your payment information is secure and encrypted </p>
            </div>
          )}
        </CardContent>
      </AppShellCard>
    </div>
  )
}

export default PayWithCreditCardPage
