import React, {useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {MessageSquare, CheckCircle2, AlertCircle, Key, Check, Loader2, X, Shield} from 'lucide-react'
import {type Order} from '@/lib/syncService'
import {useWallet} from '@/context/WalletContext'
import {sha256, b64FromBytes} from '@/utils/encoding'
import {decryptWithECIES, encryptAES} from '@/utils/encryption'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {CRYPTO_NAME, CRYPTO_NAME_BLOCKCHAIN, signPrefix} from '@/config'
import {formatCryptoError} from '@/lib/cryptoFormat'
import {getChainAdapter} from "@/lib/crypto/cryptoUtils.ts";

interface ConfirmDeliveryProps {
  order: Order
  onDeliveryConfirmed?: (shipmentCode: string, customInfo: string) => void
  onCancel?: () => void
}

interface SignedPayloadData {
  payloadHashSeller: string
  encryptedDeliveryCommentData: string
  originalShipmentCode: string
  originalCustomInfo: string
}

const ConfirmDelivery: React.FC<ConfirmDeliveryProps> = ({
                                                           order,
                                                           onDeliveryConfirmed,
                                                           onCancel
                                                         }) => {
  const {walletAdapter, walletAddress, signMessage, walletCanTransact, walletBootstrapMessage, walletKind} = useWallet()
  const [shipmentCode, setShipmentCode] = useState('')
  const [customInfo, setCustomInfo] = useState('')

  // Two-step process state
  const [signedPayloadData, setSignedPayloadData] = useState<SignedPayloadData | null>(null)
  const [isPayloadSigned, setIsPayloadSigned] = useState(false)
  const [isSigningPayload, setIsSigningPayload] = useState(false)

  // Transaction state
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false)
  const [transactionError, setTransactionError] = useState<string | null>(null)
  const [signingError, setSigningError] = useState<string | null>(null)


  // Check if current form data matches signed data
  const isFormDataChanged = () => {
    if (!signedPayloadData) return false
    return (
      shipmentCode !== signedPayloadData.originalShipmentCode ||
      customInfo !== signedPayloadData.originalCustomInfo
    )
  }

  // Determine the current step based on state
  const currentStep = isPayloadSigned && !isFormDataChanged() ? 2 : 1

  // Reset signed state when form data changes
  const handleFormChange = (field: 'shipmentCode' | 'customInfo', value: string) => {
    if (field === 'shipmentCode') {
      setShipmentCode(value)
    } else {
      setCustomInfo(value)
    }

    // Reset signed state if data has changed
    if (isPayloadSigned && signedPayloadData) {
      const newShipmentCode = field === 'shipmentCode' ? value : shipmentCode
      const newCustomInfo = field === 'customInfo' ? value : customInfo

      if (
        newShipmentCode !== signedPayloadData.originalShipmentCode ||
        newCustomInfo !== signedPayloadData.originalCustomInfo
      ) {
        setIsPayloadSigned(false)
        setSignedPayloadData(null)
        setSigningError(null)
        setTransactionError(null)
      }
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
        "Sign seed for delivery payload encryption"
      )

      // Generate the seller's key pair from signed data
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signedBytes)))
      const keyPair = await generateKeyPairFromB64(signedBase64)

      // Decrypt the symmetric AES key using the seller's private key
      const decryptedSymKey = await decryptWithECIES(keyPair.privateKey, order.encryptedSymKeySeller)

      // Prepare the delivery payload (combine shipmentCode and customInfo into JSON)
      const deliveryPayload = JSON.stringify({
        shipmentCode: shipmentCode || null,
        customInfo: customInfo || null,
        timestamp: Date.now(),
        orderSeed: order.seed
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
        originalShipmentCode: shipmentCode,
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
   * Step 2: Confirm delivery on the blockchain
   */
  const handleConfirmDelivery = async () => {
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

    setIsConfirmingDelivery(true)
    setTransactionError(null)

    try {
      // Call the blockchain method to start delivering the order
      const txId = await getChainAdapter().startDeliveringOrderOnBlockchain(
        walletAdapter,
        order.seed,
        signedPayloadData.payloadHashSeller,
        signedPayloadData.encryptedDeliveryCommentData
      )

      console.log('Delivery confirmed! Transaction ID:', txId)
      alert(`Delivery confirmed successfully!\nTransaction ID: ${txId}`)

      // Call the callback if provided
      if (onDeliveryConfirmed) {
        onDeliveryConfirmed(shipmentCode, customInfo)
      }

      // Reset form and signed state
      setShipmentCode('')
      setCustomInfo('')
      setIsPayloadSigned(false)
      setSignedPayloadData(null)

    } catch (error) {
      console.error('Failed to confirm delivery:', error)
      setTransactionError(formatCryptoError(error))
    } finally {
      setIsConfirmingDelivery(false)
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
    setIsConfirmingDelivery(false)
    setSigningError(null)
    setTransactionError(null)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600"/>
            Confirm Delivery
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
        <div className="bg-green-50 p-4 rounded border-l-4 border-green-200 text-sm text-green-700 space-y-3">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0"/>
            <p>
              The <strong>Shipment Code</strong> and <strong>Custom Information</strong> you enter
              will be encrypted and stored on {CRYPTO_NAME}. Only you and the buyer can decrypt and view it.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Key className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0"/>
            <p>
              The confirmation involves <strong>2 steps</strong>: <br/>
              <strong>1.</strong> Sign the seed to encrypt the payload <br/>
              <strong>2.</strong> Approve the transaction<br/>
              Please prepare your crypto wallet to sign both steps. </p>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="shipmentCode" className="text-sm font-medium">
              Shipment Code <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input id="shipmentCode" type="text" value={shipmentCode}
                   onChange={(e) => handleFormChange('shipmentCode', e.target.value)}
                   placeholder="Enter tracking/shipment code (optional)" className="w-full"
                   disabled={isSigningPayload || isConfirmingDelivery}/>
          </div>

          <div className="space-y-2">
            <label htmlFor="customInfo" className="text-sm font-medium">
              Custom Information
            </label>
            <textarea id="customInfo" value={customInfo}
                      onChange={(e) => handleFormChange('customInfo', e.target.value)}
                      placeholder="Additional delivery notes, special instructions, or any other relevant information..."
                      rows={4} disabled={isSigningPayload || isConfirmingDelivery}
                      className="flex h-auto w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"/>
          </div>
        </div>

        {/* Two-Step Process */}
        <div className="space-y-4">
          {/* Step 1: Sign Delivery Payload */}
          <div className="flex items-center gap-3">
            <div className="shrink-0">
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
                Sign Delivery Payload </p>
              <p className="text-sm text-muted-foreground">
                Create secure delivery identifier and encrypt delivery info </p>
            </div>
          </div>

          {/* Step 2: Send Blockchain Transaction */}
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center`}>
                <span className="text-sm font-medium">2</span>
              </div>
            </div>
            <div className="flex-1">
              <p className={`font-medium text-foreground`}>Send Transaction </p>
              <p className="text-sm text-muted-foreground">Confirm delivery </p>
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
                  Sign Delivery Payload
                </Button>
              </div>
            )}

            {isSigningPayload && (
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                <p className="text-muted-foreground">Please sign the delivery payload in your wallet</p>
                <p className="text-xs text-muted-foreground">This creates a secure delivery identifier</p>
                <Button variant="outline" size="sm" onClick={handleRetry} className="mt-2">
                  <X className="mr-2 h-4 w-4"/>
                  Cancel Signing
                </Button>
              </div>
            )}

            {currentStep === 2 && !isConfirmingDelivery && (
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">Ready to confirm delivery on the {CRYPTO_NAME_BLOCKCHAIN}</p>
                <Button onClick={handleConfirmDelivery} disabled={isConfirmingDelivery}
                        className="bg-green-600 hover:bg-green-700 mt-4">
                  <CheckCircle2 className="mr-2 h-4 w-4"/>
                  Confirm Delivery
                </Button>
              </div>
            )}

            {isConfirmingDelivery && (
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                <p className="text-muted-foreground">
                  Please confirm the delivery transaction in your wallet </p>
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
                      disabled={isSigningPayload || isConfirmingDelivery}>
                Reset Process
              </Button>
            </div>
          )}
        </div>

        <div className="bg-red-50 p-4 rounded border-l-4 border-red-400 text-sm text-red-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0"/>
            <p>
              You are about to <strong>confirm the start of the delivery process</strong>. This will encrypt the
              shipment details
              and store them on {CRYPTO_NAME}. The buyer will be notified and able to decrypt the delivery
              info.
              <br/><br/>
              <strong>This action is irreversible.</strong> Once confirmed, <strong>funds will be released to the
              seller</strong>.
              Make sure the delivery is properly initiated before proceeding. </p>
          </div>
        </div>

        {/* Info Message */}
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4"/>
          This will update the order status to "Shipped"
        </div>
      </CardContent>
    </Card>
  )
}

export default ConfirmDelivery
