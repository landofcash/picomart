import {type JSX, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Eye, Loader2, Unlock} from 'lucide-react'
import {useWallet} from '@/context/WalletContext'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {decryptAES, decryptWithECIES} from '@/utils/encryption'
import {b64FromBytes, sha256} from '@/utils/encoding'
import ExpandableData from '@/components/ExpandableData'
import CopyableField from '@/components/CopyableField'
import TokenIcon from '@/components/TokenIcon'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import ApprovedShopBadge from '@/components/ApprovedShopBadge'
import AddressDisplay from '@/components/AddressDisplay'
import {formatUtcDate} from '@/lib/dateUtils'
import {safePriceToDisplayString as priceToDisplayString} from '@/lib/tokenUtils'
import {signPrefix} from '@/config'
import {formatCryptoError} from '@/lib/cryptoFormat.ts'
import {getChainAdapter} from '@/lib/crypto/cryptoUtils.ts'
import {loadBuyerEncryptedPayloadForDecryption, loadSellerEncryptedPayloadForDecryption} from '@/lib/crypto/providers/hederaAdapter.ts'
import type {Order} from '@/lib/syncService.ts'

interface OrderItemDisplayProps {
  order: Order
  onOrderUpdated?: () => Promise<void> | void
}

type DecryptionStatus = 'idle' | 'loading' | 'success' | 'error'

interface DecryptedBoxResult {
  decryptedText: string | null
  error: string | null
  payloadHash: string
  encryptedData: string
  notFound: boolean
}

function OrderItemDisplay({order, onOrderUpdated}: OrderItemDisplayProps) {
  const {
    walletAddress,
    signMessage,
    walletAdapter,
    walletCanTransact,
    walletBootstrapMessage,
    walletKind,
  } = useWallet()
  const [decryptionStatus, setDecryptionStatus] = useState<DecryptionStatus>('idle')
  const [decryptionError, setDecryptionError] = useState<string>('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string>('')
  const [actionSuccess, setActionSuccess] = useState<string>('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [buyerDecryptionResult, setBuyerDecryptionResult] = useState<DecryptedBoxResult | null>(null)
  const [sellerDecryptionResult, setSellerDecryptionResult] = useState<DecryptedBoxResult | null>(null)
  const [debugExpanded, setDebugExpanded] = useState(false)
  const [signedSeed, setSignedSeed] = useState<string>('')
  const [keyPair, setKeyPair] = useState<{ publicKey: string; privateKey: string } | null>(null)
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null)

  const chainAdapter = getChainAdapter()
  const price = BigInt(order.price)
  const priceToken = order.priceToken
  const canDecrypt = order.status !== '1'
  const showCancel = order.status === '2'
  const showConfirmReceipt = order.status === '3'
  const showRefundRequest = order.status === '3'

  const resetDecryptionState = () => {
    setDecryptionStatus('idle')
    setDecryptionError('')
    setBuyerDecryptionResult(null)
    setSellerDecryptionResult(null)
    setSignedSeed('')
    setKeyPair(null)
    setAesKey(null)
    setDebugExpanded(false)
  }

  const decryptOrderData = async (
    encryptedData: string,
    decryptedAESKey: CryptoKey
  ): Promise<DecryptedBoxResult> => {
    const result: DecryptedBoxResult = {
      decryptedText: null,
      error: null,
      payloadHash: '',
      encryptedData: '',
      notFound: true,
    }

    try {
      const decryptedText = await decryptAES(decryptedAESKey, encryptedData)
      result.encryptedData = encryptedData
      result.decryptedText = decryptedText
      result.notFound = false
      result.payloadHash = b64FromBytes(await sha256(new TextEncoder().encode(decryptedText)))
      return result
    } catch (err) {
      console.error('Decryption error:', err)
      result.error = formatCryptoError(err)
      return result
    }
  }

  const handleDecryptPayload = async () => {
    if (!walletAddress || !walletAdapter) {
      setDecryptionError('Please connect your wallet to decrypt order data')
      setDecryptionStatus('error')
      return
    }

    setDecryptionStatus('loading')
    setDecryptionError('')
    setActionError('')

    try {
      const messageToSign = signPrefix + order.seed
      const signed = await signMessage(
        messageToSign,
        'Sign order seed to decrypt order data'
      )
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signed)))
      setSignedSeed(signedBase64)

      const generatedKeyPair = await generateKeyPairFromB64(signedBase64)
      setKeyPair(generatedKeyPair)

      const decryptedAESKey = await decryptWithECIES(generatedKeyPair.privateKey, order.encryptedSymKeyBuyer)
      setAesKey(decryptedAESKey)

      const encryptedBuyerData = await loadBuyerEncryptedPayloadForDecryption(walletAdapter, order.seed, order.messages)
      let buyerResult: DecryptedBoxResult = {
        decryptedText: null,
        error: null,
        payloadHash: '',
        encryptedData: '',
        notFound: true,
      }

      if (encryptedBuyerData.isFound && encryptedBuyerData.data) {
        buyerResult = await decryptOrderData(encryptedBuyerData.data, decryptedAESKey)
      }
      setBuyerDecryptionResult(buyerResult)

      const encryptedSellerData = await loadSellerEncryptedPayloadForDecryption(walletAdapter, order.seed, order.messages)
      let sellerResult: DecryptedBoxResult = {
        decryptedText: null,
        error: null,
        payloadHash: '',
        encryptedData: '',
        notFound: true,
      }

      if (encryptedSellerData.isFound && encryptedSellerData.data) {
        sellerResult = await decryptOrderData(encryptedSellerData.data, decryptedAESKey)
      }
      setSellerDecryptionResult(sellerResult)

      if (buyerResult.error || (sellerResult.error && !sellerResult.notFound)) {
        setDecryptionError(buyerResult.error || sellerResult.error || 'Decryption failed')
        setDecryptionStatus('error')
        return
      }

      setDecryptionStatus('success')
    } catch (err) {
      console.error('Overall decryption error:', err)
      setDecryptionError(formatCryptoError(err))
      setDecryptionStatus('error')
    }
  }

  const handleDecryptionToggle = async () => {
    if (decryptionStatus === 'idle') {
      await handleDecryptPayload()
      return
    }

    if (decryptionStatus === 'loading') {
      return
    }

    resetDecryptionState()
  }

  const handleAction = async (action: () => Promise<string>, successMessage: string) => {
    if (!walletAddress || !walletAdapter) {
      setActionError('Please connect your wallet to continue')
      return
    }

    if (walletKind === 'internal' && !walletCanTransact) {
      setActionError(walletBootstrapMessage ?? 'This wallet is not ready for transactions yet.')
      return
    }

    setActionLoading(true)
    setActionError('')
    setActionSuccess('')

    try {
      const txId = await action()
      setActionSuccess(`${successMessage} Transaction ID: ${txId}`)
      setShowCancelConfirm(false)

      if (onOrderUpdated) {
        try {
          await onOrderUpdated()
        } catch (refreshError) {
          console.error('Order refresh failed after successful action:', refreshError)
        }
      }
    } catch (err) {
      console.error('Order action failed:', err)
      setActionError(formatCryptoError(err))
    } finally {
      setActionLoading(false)
    }
  }

  const renderJsonAsKeyValue = (jsonString: string): JSX.Element => {
    try {
      const parsedData = JSON.parse(jsonString)
      return renderObjectAsKeyValue(parsedData)
    } catch (err) {
      return (
        <div className="text-xs text-destructive">
          Failed to parse JSON: {err instanceof Error ? err.message : 'Unknown error'}
        </div>
      )
    }
  }

  const renderObjectAsKeyValue = (obj: object, prefix = ''): JSX.Element => {
    return (
      <div className="space-y-1">
        {Object.entries(obj).map(([key, value]) => {
          const fullKey = prefix ? `${prefix}.${key}` : key

          if (value === null || value === undefined) {
            return (
              <div key={fullKey} className="text-xs">
                <span className="font-medium">{key}:</span> <span className="text-muted-foreground">null</span>
              </div>
            )
          }

          if (typeof value === 'object' && !Array.isArray(value)) {
            return (
              <div key={fullKey} className="text-xs">
                <div className="font-medium mb-1">{key}:</div>
                <div className="ml-4 border-l-2 border-muted pl-2">
                  {renderObjectAsKeyValue(value, fullKey)}
                </div>
              </div>
            )
          }

          if (Array.isArray(value)) {
            return (
              <div key={fullKey} className="text-xs">
                <div className="font-medium mb-1">{key}: [{value.length} items]</div>
                <div className="ml-4 border-l-2 border-muted pl-2 space-y-1">
                  {value.map((item, index) => (
                    <div key={`${fullKey}[${index}]`}>
                      <div className="font-medium text-muted-foreground">[{index}]:</div>
                      <div className="ml-2">
                        {typeof item === 'object' && item !== null
                          ? renderObjectAsKeyValue(item, `${fullKey}[${index}]`)
                          : <span>{String(item)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div key={fullKey} className="text-xs">
              <span className="font-medium">{key}:</span> <span>{String(value)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Card className="border-2">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">Order:</span>
              <CopyableField value={order.seed} length={12} small/>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatUtcDate(Number(order.createdDate))}
            </p>
          </div>
          <OrderStatusBadge status={order.status}/>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span>Total:</span>
            <div className="flex items-center gap-2 font-medium">
              <TokenIcon assetId={priceToken} size={16}/>
              <span>{priceToDisplayString(priceToken, price)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm">
            <span>Shop:</span>
            <div className="flex items-center gap-2">
              <AddressDisplay value={order.sellerWallet} length={16} small preferAccountId/>
              <ApprovedShopBadge walletAddress={order.sellerWallet}/>
            </div>
          </div>

          {order.updatedDate !== order.createdDate && (
            <div className="text-xs text-muted-foreground">
              Updated: {formatUtcDate(Number(order.updatedDate))}
            </div>
          )}
        </div>

        {(showCancel || showConfirmReceipt || showRefundRequest || canDecrypt) && (
          <div className="pt-4 border-t space-y-3">
            {(showConfirmReceipt || showRefundRequest || showCancel) && (
              <div className="space-y-2">
                {actionSuccess && (
                  <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0"/>
                    <span>{actionSuccess}</span>
                  </div>
                )}

                {actionError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0"/>
                    <span>{actionError}</span>
                  </div>
                )}

                {showConfirmReceipt && (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={actionLoading}
                    onClick={() => handleAction(
                      () => chainAdapter.confirmOrderOnBlockchain(walletAdapter!, order.seed),
                      'Order confirmed and funds released to the seller.'
                    )}
                  >
                    {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Confirm Receipt
                  </Button>
                )}

                {showRefundRequest && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={actionLoading}
                    onClick={() => handleAction(
                      () => chainAdapter.requestRefundOnBlockchain(walletAdapter!, order.seed),
                      'Refund request submitted.'
                    )}
                  >
                    {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Request Refund
                  </Button>
                )}

                {showCancel && !showCancelConfirm && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={actionLoading}
                    onClick={() => {
                      setShowCancelConfirm(true)
                      setActionError('')
                      setActionSuccess('')
                    }}
                  >
                    Cancel Order
                  </Button>
                )}

                {showCancel && showCancelConfirm && (
                  <div className="space-y-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                    <p className="text-sm text-muted-foreground">
                      Cancel this paid order and return the funds to the buyer wallet?
                    </p>
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={actionLoading}
                      onClick={() => handleAction(
                        () => chainAdapter.cancelOrderOnBlockchain(walletAdapter!, order.seed),
                        'Order canceled and funds returned to the buyer.'
                      )}
                    >
                      {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                      Confirm Cancel
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      disabled={actionLoading}
                      onClick={() => setShowCancelConfirm(false)}
                    >
                      Back
                    </Button>
                  </div>
                )}
              </div>
            )}

            {canDecrypt && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDecryptionToggle}
                  disabled={decryptionStatus === 'loading'}
                  className="w-full"
                >
                  {decryptionStatus === 'loading'
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    : decryptionStatus === 'idle'
                      ? <Unlock className="mr-2 h-4 w-4"/>
                      : <Eye className="mr-2 h-4 w-4"/>}
                  {decryptionStatus === 'idle'
                    ? 'View Order Details'
                    : decryptionStatus === 'loading'
                      ? 'Decrypting...'
                      : 'Hide Order Details'}
                </Button>

                {decryptionStatus === 'error' && (
                  <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4"/>
                      <span className="text-sm font-medium">Decryption failed</span>
                    </div>
                    {decryptionError && (
                      <div className="text-sm text-destructive whitespace-pre-wrap">
                        {decryptionError}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Hide the details panel and try again to request a fresh signature.
                    </p>
                  </div>
                )}

                {decryptionStatus === 'success' && (buyerDecryptionResult || sellerDecryptionResult) && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                      <Eye className="h-4 w-4"/>
                      <span className="text-sm font-medium">Order details decrypted</span>
                    </div>

                    {buyerDecryptionResult && (
                      <div className="bg-muted/50 p-3 rounded-md space-y-2">
                        <h4 className="font-medium text-sm text-blue-600">Buyer Payload</h4>
                        {buyerDecryptionResult.notFound ? (
                          <p className="text-xs text-muted-foreground">
                            Buyer payload reference not found. This likely indicates an issue with the order record.
                          </p>
                        ) : buyerDecryptionResult.error ? (
                          <p className="text-xs text-destructive">
                            Error decrypting buyer payload: {buyerDecryptionResult.error}
                          </p>
                        ) : buyerDecryptionResult.decryptedText ? (
                          renderJsonAsKeyValue(buyerDecryptionResult.decryptedText)
                        ) : (
                          <p className="text-xs text-muted-foreground">No buyer payload available</p>
                        )}
                      </div>
                    )}

                    {sellerDecryptionResult && (
                      <div className="bg-muted/50 p-3 rounded-md space-y-2">
                        <h4 className="font-medium text-sm text-purple-600">Seller Payload</h4>
                        {sellerDecryptionResult.notFound ? (
                          <p className="text-xs text-muted-foreground">
                            Seller payload reference not found. This is normal until the seller submits delivery data.
                          </p>
                        ) : sellerDecryptionResult.error ? (
                          <p className="text-xs text-destructive">
                            Error decrypting seller payload: {sellerDecryptionResult.error}
                          </p>
                        ) : sellerDecryptionResult.decryptedText ? (
                          renderJsonAsKeyValue(sellerDecryptionResult.decryptedText)
                        ) : (
                          <p className="text-xs text-muted-foreground">No seller payload available</p>
                        )}
                      </div>
                    )}

                    {signedSeed && (
                      <div className="border-t pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDebugExpanded(!debugExpanded)}
                          className="w-full flex items-center justify-center gap-2"
                        >
                          {debugExpanded ? (
                            <>
                              <ChevronUp className="h-4 w-4"/>
                              Hide Debug Info
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4"/>
                              Show Debug Info
                            </>
                          )}
                        </Button>

                        {debugExpanded && (
                          <div className="space-y-3 mt-3">
                            <div className="space-y-3">
                              <h5 className="font-medium text-sm text-green-600">Common Decryption Information</h5>

                              <div className="p-3 bg-muted rounded-md">
                                <h3 className="font-semibold text-yellow-600 mb-2 text-sm">Signed Seed (base64)</h3>
                                <ExpandableData value={signedSeed}/>
                              </div>

                              {keyPair && (
                                <div className="p-3 bg-muted rounded-md space-y-2">
                                  <div>
                                    <p className="text-sm font-medium">Public Key:</p>
                                    <p className="text-xs font-mono break-all">{keyPair.publicKey}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Private Key:</p>
                                    <ExpandableData value={keyPair.privateKey}/>
                                  </div>
                                </div>
                              )}

                              {aesKey && (
                                <div className="p-3 bg-muted rounded-md">
                                  <h3 className="font-semibold text-blue-600 mb-2 text-sm">Decrypted AES Key</h3>
                                  <ExpandableData value={aesKey}/>
                                </div>
                              )}
                            </div>

                            {buyerDecryptionResult && !buyerDecryptionResult.notFound && (
                              <div className="space-y-3">
                                <h5 className="font-medium text-sm text-blue-600">Buyer Debug Information</h5>

                                {buyerDecryptionResult.payloadHash && (
                                  <div className="p-3 bg-muted rounded-md">
                                    <p className="text-sm font-medium">Buyer Payload Hash:</p>
                                    <p className="text-xs font-mono break-all">{buyerDecryptionResult.payloadHash}</p>
                                  </div>
                                )}

                                {buyerDecryptionResult.encryptedData && (
                                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                                    <h3 className="font-semibold text-blue-700 mb-2 text-sm">Encrypted Buyer Data</h3>
                                    <ExpandableData value={buyerDecryptionResult.encryptedData}/>
                                  </div>
                                )}
                              </div>
                            )}

                            {sellerDecryptionResult && !sellerDecryptionResult.notFound && (
                              <div className="space-y-3">
                                <h5 className="font-medium text-sm text-purple-600">Seller Debug Information</h5>

                                {sellerDecryptionResult.payloadHash && (
                                  <div className="p-3 bg-muted rounded-md">
                                    <p className="text-sm font-medium">Seller Payload Hash:</p>
                                    <p className="text-xs font-mono break-all">{sellerDecryptionResult.payloadHash}</p>
                                  </div>
                                )}

                                {sellerDecryptionResult.encryptedData && (
                                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
                                    <h3 className="font-semibold text-purple-700 mb-2 text-sm">Encrypted Seller Data</h3>
                                    <ExpandableData value={sellerDecryptionResult.encryptedData}/>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default OrderItemDisplay
