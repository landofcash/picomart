import React, {useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {XCircle, MessageSquare, AlertCircle, Key, Check, Loader2, X} from 'lucide-react'
import {type Order} from '@/lib/syncService'
import {useWallet} from '@/context/WalletContext'
import {sha256, b64FromBytes} from '@/utils/encoding'
import {decryptWithECIES, encryptAES} from '@/utils/encryption'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {CRYPTO_NAME_BLOCKCHAIN, signPrefix} from '@/config'
import {formatCryptoError} from '@/lib/cryptoFormat'
import {getChainAdapter} from "@/lib/crypto/cryptoUtils.ts";

interface RefuseDeliveryProps {
  order: Order
  onDeliveryRefused?: (customInfo: string) => void
  onCancel?: () => void
}

interface SignedPayloadData {
  payloadHashSeller: string
  encryptedDeliveryCommentData: string
  originalCustomInfo: string
}

const RefuseDelivery: React.FC<RefuseDeliveryProps> = ({
                                                         order,
                                                         onDeliveryRefused,
                                                         onCancel
                                                       }) => {
  const {walletAdapter, walletAddress, signMessage, walletCanTransact, walletBootstrapMessage, walletKind} = useWallet()
  const [customInfo, setCustomInfo] = useState('')

  // Two-step process state
  const [signedPayloadData, setSignedPayloadData] = useState<SignedPayloadData | null>(null)
  const [isPayloadSigned, setIsPayloadSigned] = useState(false)
  const [isSigningPayload, setIsSigningPayload] = useState(false)

  // Transaction state
  const [isRefusingDelivery, setIsRefusingDelivery] = useState(false)
  const [transactionError, setTransactionError] = useState<string | null>(null)
  const [signingError, setSigningError] = useState<string | null>(null)


  // Check if current form data matches signed data
  const isFormDataChanged = () => {
    if (!signedPayloadData) return false
    return customInfo !== signedPayloadData.originalCustomInfo
  }

  // Determine the current step based on state
  const currentStep = isPayloadSigned && !isFormDataChanged() ? 2 : 1

  // Reset signed state when form data changes
  const handleFormChange = (value: string) => {
    setCustomInfo(value)

    // Reset signed state if data has changed
    if (isPayloadSigned && signedPayloadData && value !== signedPayloadData.originalCustomInfo) {
      setIsPayloadSigned(false)
      setSignedPayloadData(null)
      setSigningError(null)
      setTransactionError(null)
    }
  }

  /**
   * Step 1: Sign and encrypt the delivery payload
   */
  const handleSignAndEncrypt = async () => {
    if (!walletAddress) {
      setSigningError('Wallet not connected')
      return
    }
    if (walletKind === 'internal' && !walletCanTransact) {
      setSigningError(walletBootstrapMessage ?? 'This wallet is not ready for transactions yet.')
      return
    }

    setIsSigningPayload(true)
    setSigningError(null)
    setTransactionError(null)

    try {
      // Sign the product seed with the wallet (chain adapter) to generate the seller's key pair
      const dataToSign = signPrefix + order.catalogSeed
      const signedBytes = await signMessage(
        dataToSign,
        "Sign seed for delivery refusal payload encryption"
      )

      // Generate the seller's key pair from signed data
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signedBytes)))
      const keyPair = await generateKeyPairFromB64(signedBase64)

      // Decrypt the symmetric AES key using the seller's private key
      const decryptedSymKey = await decryptWithECIES(keyPair.privateKey, order.encryptedSymKeySeller)

      // Prepare the delivery payload (customInfo only for refusal)
      const deliveryPayload = JSON.stringify({
        customInfo: customInfo || null,
        timestamp: Date.now(),
        orderSeed: order.seed,
        action: 'refuse'
      })

      // Calculate SHA256 hash of the unencrypted payload
      const payloadBytes = new TextEncoder().encode(deliveryPayload)
      const payloadHashBytes = await sha256(payloadBytes)
      const payloadHashSeller = b64FromBytes(payloadHashBytes)

      // Encrypt the delivery payload with the decrypted AES key
      const encryptedDeliveryCommentData = await encryptAES(decryptedSymKey, deliveryPayload)

      // Store the signed payload data
      const newSignedPayloadData: SignedPayloadData = {
        payloadHashSeller,
        encryptedDeliveryCommentData,
        originalCustomInfo: customInfo
      }

      setSignedPayloadData(newSignedPayloadData)
      setIsPayloadSigned(true)

    } catch (error) {
      console.error('Failed to sign and encrypt payload:', error)
      setSigningError(error instanceof Error ? error.message : 'Failed to sign and encrypt payload')
    } finally {
      setIsSigningPayload(false)
    }
  }

  /**
   * Step 2: Refuse delivery on the blockchain
   */
  const handleRefuseDelivery = async () => {
    if (!order || !walletAddress || !walletAdapter) {
      setTransactionError('Order data or wallet not available')
      return
    }
    if (walletKind === 'internal' && !walletCanTransact) {
      setTransactionError(walletBootstrapMessage ?? 'This wallet is not ready for transactions yet.')
      return
    }

    if (!isPayloadSigned || !signedPayloadData) {
      setTransactionError('Please sign the delivery payload first')
      return
    }

    if (isFormDataChanged()) {
      setTransactionError('Form data has changed since signing. Please sign the payload again.')
      return
    }

    setIsRefusingDelivery(true)
    setTransactionError(null)

    try {
      // Call the blockchain method to refuse the order
      const txId = await getChainAdapter().refuseOrderOnBlockchain(
        walletAdapter,
        order.seed,
        signedPayloadData.payloadHashSeller,
        signedPayloadData.encryptedDeliveryCommentData,
        [order.priceToken]
      )

      console.log('Order refused! Transaction ID:', txId)
      alert(`Order refused successfully!\nTransaction ID: ${txId}`)

      // Call the callback if provided
      if (onDeliveryRefused) {
        onDeliveryRefused(customInfo)
      }

      // Reset form and signed state
      setCustomInfo('')
      setIsPayloadSigned(false)
      setSignedPayloadData(null)

    } catch (error) {
      console.error('Failed to refuse delivery:', error)
      setTransactionError(formatCryptoError(error))
    } finally {
      setIsRefusingDelivery(false)
    }
  }

  // Reset the signing process
  const handleResetSigning = () => {
    setIsPayloadSigned(false)
    setSignedPayloadData(null)
    setSigningError(null)
    setTransactionError(null)
  }

  // Handle retry (cancel current operation)
  const handleRetry = () => {
    setIsSigningPayload(false)
    setIsRefusingDelivery(false)
    setSigningError(null)
    setTransactionError(null)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600"/>
            Refuse Delivery
          </CardTitle>
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-4 w-4 mr-2"/>
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Form Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="customInfo" className="text-sm font-medium">
              Reason for Refusal
            </label>
            <textarea id="customInfo" value={customInfo} onChange={(e) => handleFormChange(e.target.value)}
                      placeholder="Please provide a reason for refusing this delivery (e.g., product defect, incorrect item, customer request, etc.)..."
                      rows={4} disabled={isSigningPayload || isRefusingDelivery}
                      className="flex h-auto w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"/>
          </div>
        </div>

        {/* Two-Step Process */}
        <div className="space-y-4">
          {/* Step 1: Sign Delivery Payload */}
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
                Sign Refusal Payload </p>
              <p className="text-sm text-muted-foreground">
                Create secure refusal identifier and encrypt refusal info </p>
            </div>
          </div>

          {/* Step 2: Send Blockchain Transaction */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center`}>
                <span className="text-sm font-medium">2</span>
              </div>
            </div>
            <div className="flex-1">
              <p className={`font-medium text-foreground`}>
                Send Transaction </p>
              <p className="text-sm text-muted-foreground">
                Refuse delivery</p>
            </div>
          </div>

          {/* Current Status */}
          <div className="pt-4 border-t">
            {!walletAddress && (
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">Please connect your wallet to continue</p>
              </div>
            )}

            {walletAddress && currentStep === 1 && !isSigningPayload && (
              <div className="text-center space-y-2">
                <Button onClick={handleSignAndEncrypt} disabled={isSigningPayload} className="mt-2">
                  <Key className="mr-2 h-4 w-4"/>
                  Sign Refusal Payload
                </Button>
              </div>
            )}

            {isSigningPayload && (
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                <p className="text-muted-foreground">Please sign the refusal payload in your wallet</p>
                <p className="text-xs text-muted-foreground">This creates a secure refusal identifier</p>
                <Button variant="outline" size="sm" onClick={handleRetry} className="mt-2">
                  <X className="mr-2 h-4 w-4"/>
                  Cancel Signing
                </Button>
              </div>
            )}

            {currentStep === 2 && !isRefusingDelivery && (
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">Ready to refuse delivery on the {CRYPTO_NAME_BLOCKCHAIN}</p>
                <Button onClick={handleRefuseDelivery} variant="destructive" disabled={isRefusingDelivery}
                        className="mt-4">
                  <XCircle className="mr-2 h-4 w-4"/>
                  Refuse Delivery
                </Button>
              </div>
            )}

            {isRefusingDelivery && (
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                <p className="text-muted-foreground">
                  Please confirm the refusal transaction in your wallet </p>
                <p className="text-xs text-muted-foreground">This may take a few seconds</p>
              </div>
            )}

            {(signingError || transactionError) && (
              <div className="text-center space-y-2">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto"/>
                <p className="text-destructive font-medium">
                  {signingError ? 'Signing failed' : 'Transaction failed'}
                </p>
                {(signingError || transactionError) && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded text-left whitespace-pre-wrap">
                    {signingError || transactionError}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={handleRetry} className="mt-2">
                  Try Again
                </Button>
              </div>
            )}
          </div>

          {/* Reset Process Button */}
          {isPayloadSigned && (
            <div className="pt-4 border-t">
              <Button variant="outline" onClick={handleResetSigning} className="w-full"
                      disabled={isSigningPayload || isRefusingDelivery}>
                Reset Process
              </Button>
            </div>
          )}
        </div>

        {/* Warning Message */}
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
          <div>
            <p className="font-medium">Warning: This action cannot be undone</p>
            <p>Refusing delivery will cancel the order and update the status to "Cancelled" on the {CRYPTO_NAME_BLOCKCHAIN}.</p>
          </div>
        </div>

        {/* Info Message */}
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4"/>
          This will update the order status to "Cancelled" on the {CRYPTO_NAME_BLOCKCHAIN}
        </div>
      </CardContent>
    </Card>
  )
}

export default RefuseDelivery
