import React, {useState} from 'react'
import {useLocation, Link} from 'react-router-dom'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {
  ArrowLeft,
  Package,
  User,
  Calendar,
  Clock,
  Hash,
  Key,
  Shield,
  FileText,
  Lock,
  AlertCircle,
  CheckCircle2,
  Copy,
  Unlock,
  MapPin,
  Phone,
  Mail,
  ShoppingBag,
  Download,
  Eye,
  Truck,
  XCircle
} from 'lucide-react'
import {type Order} from '@/lib/syncService'
import CopyableField from '@/components/CopyableField'
import TokenIcon from '@/components/TokenIcon'
import {priceToDisplayString, getTokenByType} from '@/lib/tokenUtils'
import {formatUtcDate} from '@/lib/dateUtils'
import {useWallet} from '@/context/WalletContext'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {decryptAES, decryptWithECIES} from '@/utils/encryption'
import {CRYPTO_NAME_BLOCKCHAIN, signPrefix} from '@/config'
import ConfirmDelivery from '@/components/ConfirmDelivery'
import RefuseDelivery from '@/components/RefuseDelivery'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import AddressWithName from "@/components/AddressWithName.tsx";
import {loadBuyerEncryptedPayloadForDecryption} from "@/lib/crypto/providers/hederaAdapter.ts";

// Helper function to safely parse timestamp strings to numbers
function parseTimestamp(timestamp: string): number {
  try {
    const parsed = parseInt(timestamp, 10)
    return isNaN(parsed) ? 0 : parsed
  } catch (error) {
    console.error('Error parsing timestamp:', error)
    return 0
  }
}

// Interface for the decrypted order data structure
interface DecryptedOrderData {
  deliveryInfo: {
    fullName: string
    address: string
    city: string
    postalCode: string
    country: string
    phone: string
    email: string
    deliveryComments?: string
  }
  cartItems: Array<{
    id: string
    name: string
    price: string
    priceToken: string
    quantity: number
  }>
}

// View Content Modal Component
interface ViewContentModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
}

const ViewContentModal: React.FC<ViewContentModalProps> = ({isOpen, onClose, title, content}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50" onClick={onClose}>
      <div className="relative w-full max-w-4xl mx-4 max-h-[80vh] bg-card border rounded-2xl shadow-lg flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{title}</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={copied}>
              {copied ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500"/>
                  Copied! </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2"/>
                  Copy All </>
              )}
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl">
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-muted p-4 rounded-lg">
            <pre className="text-sm whitespace-pre-wrap break-words font-mono">
              {content}
            </pre>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Length: {content.length} characters
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderDetailsPage() {
  const location = useLocation()

  const {walletAddress, walletAdapter, signMessage} = useWallet()
  const order = location.state?.order as Order | undefined

  // Encrypted buyer payload loaded on-demand for decryption.
  const [encryptedPayloadFromBox, setEncryptedPayloadFromBox] = useState<string | null>(null)
  const [isLoadingPayloadFromBox, setIsLoadingPayloadFromBox] = useState(false)
  const [payloadLoadError, setPayloadLoadError] = useState<string | null>(null)

  // Decrypted delivery info state
  const [decryptedDeliveryInfo, setDecryptedDeliveryInfo] = useState<string | null>(null)
  const [parsedOrderData, setParsedOrderData] = useState<DecryptedOrderData | null>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptionError, setDecryptionError] = useState<string | null>(null)

  // View modal state
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [viewModalContent, setViewModalContent] = useState('')
  const [viewModalTitle, setViewModalTitle] = useState('')

  // Delivery action state
  const [showConfirmDelivery, setShowConfirmDelivery] = useState(false)
  const [showRefuseDelivery, setShowRefuseDelivery] = useState(false)

  // Helper function to check if delivery actions should be shown
  const shouldShowDeliveryActions = () => {
    if (!order) return false
    // Only show delivery actions for  Paid (2) statuses
    return order.status === '2'
  }

  const handleDecryptDeliveryInfo = async () => {
    if (!walletAddress) {
      setDecryptionError('Wallet not connected')
      return
    }

    if (!walletAdapter) {
      setDecryptionError('Wallet adapter not available')
      return
    }

    if (!order) {
      setDecryptionError('Order data not available')
      return
    }

    setIsDecrypting(true)
    setIsLoadingPayloadFromBox(true)
    setDecryptionError(null)
    setPayloadLoadError(null)
    setDecryptedDeliveryInfo(null)
    setParsedOrderData(null)

    try {
      // Sign the catalog seed with the wallet to generate the seller's key pair
      const dataToSign = signPrefix + order.catalogSeed
      const signedBytes = await signMessage(
        dataToSign,
        "Sign seed for delivery info decryption"
      )

      // Generate the seller's key pair from signed data
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signedBytes)))
      const keyPair = await generateKeyPairFromB64(signedBase64)

      const decodedPayload = await loadBuyerEncryptedPayloadForDecryption(walletAdapter, order.seed, order.messages)
      if (!decodedPayload.isFound || !decodedPayload.data) {
        setPayloadLoadError(`Failed to read delivery data "${order.seed}", not found`)
        return
      }
      setEncryptedPayloadFromBox(decodedPayload.data)

      // Decrypt the symmetric key using the seller's private key
      const decryptedSymKey = await decryptWithECIES(keyPair.privateKey, order.encryptedSymKeySeller)

      // Decrypt the delivery payload using the decrypted symmetric key
      const decryptedPayload = await decryptAES(decryptedSymKey, decodedPayload.data)
      setDecryptedDeliveryInfo(decryptedPayload)

      // Try to parse the decrypted payload as JSON
      try {
        const parsedData = JSON.parse(decryptedPayload) as DecryptedOrderData
        setParsedOrderData(parsedData)
      } catch (parseError) {
        console.warn('Failed to parse decrypted payload as JSON:', parseError)
        // If parsing fails, we'll just show the raw decrypted text
      }

    } catch (error) {
      setDecryptionError(error instanceof Error ? error.message : 'Failed to decrypt delivery info')
    } finally {
      setIsDecrypting(false)
      setIsLoadingPayloadFromBox(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  // Function to download the file
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], {type: mimeType})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Format delivery info as human-readable text
  const formatDeliveryInfoAsText = (data: DecryptedOrderData): string => {
    let text = '=== CUSTOMER DELIVERY INFORMATION ===\n\n'

    text += `Full Name: ${data.deliveryInfo.fullName}\n`
    text += `Phone: ${data.deliveryInfo.phone}\n`
    text += `Email: ${data.deliveryInfo.email}\n\n`

    text += `Address: ${data.deliveryInfo.address}\n`
    text += `City: ${data.deliveryInfo.city}\n`
    text += `Postal Code: ${data.deliveryInfo.postalCode}\n`
    text += `Country: ${data.deliveryInfo.country}\n\n`

    if (data.deliveryInfo.deliveryComments) {
      text += `Delivery Comments: ${data.deliveryInfo.deliveryComments}\n\n`
    }

    text += '=== ORDERED ITEMS ===\n\n'

    data.cartItems.forEach((item, index) => {
      text += `${index + 1}. ${item.name}\n`
      text += `   Item ID: ${item.id}\n`
      text += `   Price: ${priceToDisplayString(item.priceToken, parseInt(item.price))}\n`
      text += `   Quantity: ${item.quantity}\n\n`
    })

    return text
  }

  // Handle view as text
  const handleViewAsText = () => {
    if (!parsedOrderData) return

    const textContent = formatDeliveryInfoAsText(parsedOrderData)
    setViewModalContent(textContent)
    setViewModalTitle('Delivery Information - Text Format')
    setIsViewModalOpen(true)
  }

  // Handle view as JSON
  const handleViewAsJson = () => {
    if (!parsedOrderData) return

    const jsonContent = JSON.stringify(parsedOrderData, null, 2)
    setViewModalContent(jsonContent)
    setViewModalTitle('Delivery Information - JSON Format')
    setIsViewModalOpen(true)
  }

  // Handle export as text
  const handleExportAsText = () => {
    if (!parsedOrderData) return

    const textContent = formatDeliveryInfoAsText(parsedOrderData)
    const filename = `delivery-info-${order?.seed || 'order'}.txt`
    downloadFile(textContent, filename, 'text/plain')
  }

  // Handle export as JSON
  const handleExportAsJson = () => {
    if (!parsedOrderData) return

    const jsonContent = JSON.stringify(parsedOrderData, null, 2)
    const filename = `delivery-info-${order?.seed || 'order'}.json`
    downloadFile(jsonContent, filename, 'application/json')
  }

  // Handle export as CSV
  const handleExportAsCsv = () => {
    if (!parsedOrderData) return

    let csvContent = 'Field,Value\n'

    // Add delivery info
    csvContent += `"Full Name","${parsedOrderData.deliveryInfo.fullName}"\n`
    csvContent += `"Phone","${parsedOrderData.deliveryInfo.phone}"\n`
    csvContent += `"Email","${parsedOrderData.deliveryInfo.email}"\n`
    csvContent += `"Address","${parsedOrderData.deliveryInfo.address}"\n`
    csvContent += `"City","${parsedOrderData.deliveryInfo.city}"\n`
    csvContent += `"Postal Code","${parsedOrderData.deliveryInfo.postalCode}"\n`
    csvContent += `"Country","${parsedOrderData.deliveryInfo.country}"\n`

    if (parsedOrderData.deliveryInfo.deliveryComments) {
      csvContent += `"Delivery Comments","${parsedOrderData.deliveryInfo.deliveryComments}"\n`
    }

    csvContent += '\n"=== CART ITEMS ==="\n'
    csvContent += 'Item Name,Item ID,Price,Price Token,Quantity\n'

    parsedOrderData.cartItems.forEach(item => {
      csvContent += `"${item.name}","${item.id}","${item.price}","${item.priceToken}","${item.quantity}"\n`
    })

    const filename = `delivery-info-${order?.seed || 'order'}.csv`
    downloadFile(csvContent, filename, 'text/csv')
  }

  // Callback handlers for delivery actions
  const handleDeliveryConfirmed = (shipmentCode: string, customInfo: string) => {
    console.log('Delivery confirmed callback:', {shipmentCode, customInfo})
    setShowConfirmDelivery(false)
    // You can add additional logic here, such as refreshing the order data
    // or navigating to a different page
  }

  const handleDeliveryRefused = (customInfo: string) => {
    console.log('Delivery refused callback:', {customInfo})
    setShowRefuseDelivery(false)
    // You can add additional logic here, such as refreshing the order data
    // or navigating to a different page
  }

  // Handle showing confirm delivery
  const handleShowConfirmDelivery = () => {
    setShowConfirmDelivery(true)
    setShowRefuseDelivery(false)
  }

  // Handle showing refuse delivery
  const handleShowRefuseDelivery = () => {
    setShowRefuseDelivery(true)
    setShowConfirmDelivery(false)
  }

  // Handle canceling delivery actions
  const handleCancelDeliveryAction = () => {
    setShowConfirmDelivery(false)
    setShowRefuseDelivery(false)
  }

  if (!order) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive">Order Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              The order details could not be loaded. This might happen if you navigated directly to this page. </p>
            <Link to="/my-orders">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2"/>
                Back to Orders
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Get token information for display
  const getTokenDisplay = (coinType: string) => {
    try {
      const token = getTokenByType(coinType)
      return `${token.name} (${coinType})`
    } catch {
      return `Token (${coinType})`
    }
  }

  return (
    <div className="px-4 py-8 sm:py-16">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6"/>
                Order Details
              </CardTitle>

              <Link to="/my-orders" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto">
                  <ArrowLeft className="h-4 w-4 mr-2"/>
                  Back to Orders
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary"/>
                <span className="text-sm font-medium text-muted-foreground">Order ID:</span>
                <CopyableField value={order.seed} length={15} mdLength={63}/>
              </div>
              <OrderStatusBadge status={order.status}/>
            </div>
          </CardContent>
        </Card>

        {/* Main Order Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Order Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5"/>
                Order Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Catalog Seed:</span>
                  <CopyableField value={order.catalogSeed} length={22} mdLength={22} small={true}/>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Price Token:</span>
                  <div className="flex items-center gap-2">
                    <TokenIcon assetId={order.priceToken} size={20}/>
                    <span className="text-sm">{getTokenDisplay(order.priceToken)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Amount:</span>
                  <div className="flex items-center gap-2">
                    <TokenIcon assetId={order.priceToken} size={18}/>
                    <span className="font-semibold text-green-600">
                      {priceToDisplayString(order.priceToken, parseInt(order.amount))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeline moved here */}
              <div className="border-t pt-4 mt-6">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4"/>
                  Timeline </h4>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground"/>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Created</div>
                      <div className="text-sm">{formatUtcDate(parseTimestamp(order.createdDate))}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground"/>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Last Updated</div>
                      <div className="text-sm">{formatUtcDate(parseTimestamp(order.updatedDate))}</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Participants */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5"/>
                Participants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Seller:</div>
                  <AddressWithName value={order.seller} length={30} mdLength={70}/>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Buyer:</div>
                  <AddressWithName value={order.buyer} length={30} mdLength={70}/>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Payer:</div>
                  {order.payer === "" ?
                    (<div className="text-sm">----</div>) : (
                      <AddressWithName value={order.payer} length={22} mdLength={70}/>
                    )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delivery Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5"/>
              Delivery Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-200 text-sm text-blue-700">
              <div className="flex items-start gap-3">
                <Lock className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0"/>
                <p>
                  The delivery address and the list of ordered items
                  are encrypted and securely stored on the {CRYPTO_NAME_BLOCKCHAIN} — accessible only to you and the buyer. </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Decrypt Delivery Information</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Decrypt the encrypted delivery payload to view order contents and customer delivery details </p>
              </div>

              <Button onClick={handleDecryptDeliveryInfo} disabled={isDecrypting || isLoadingPayloadFromBox || !walletAddress || !walletAdapter}
                        variant="default">
                {isDecrypting ? (
                  <>
                    <div
                      className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"/>
                    Decrypting... </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4 mr-2"/>
                    Decrypt Payload </>
                )}
              </Button>
            </div>

            {decryptionError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0"/>
                <div className="text-sm text-destructive">{decryptionError}</div>
              </div>
            )}

            {decryptedDeliveryInfo && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4"/>
                  <span className="text-sm font-medium">Payload decrypted successfully</span>
                </div>

                {parsedOrderData ? (
                  // Display formatted delivery information and cart items
                  <div className="space-y-6">
                    {/* Export and View Options */}
                    <div className="flex flex-wrap gap-2 p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 mr-4">
                        <span className="text-sm font-medium text-muted-foreground">Export:</span>
                        <Button variant="outline" size="sm" onClick={handleExportAsText}>
                          <Download className="h-3 w-3 mr-1"/>
                          Text
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportAsJson}>
                          <Download className="h-3 w-3 mr-1"/>
                          JSON
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportAsCsv}>
                          <Download className="h-3 w-3 mr-1"/>
                          CSV
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">View:</span>
                        <Button variant="outline" size="sm" onClick={handleViewAsText}>
                          <Eye className="h-3 w-3 mr-1"/>
                          Text
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleViewAsJson}>
                          <Eye className="h-3 w-3 mr-1"/>
                          JSON
                        </Button>
                      </div>
                    </div>

                    {/* Customer Delivery Information */}
                    <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                      <h4 className="font-semibold text-green-800 mb-4 flex items-center gap-2">
                        <MapPin className="h-5 w-5"/>
                        Customer Delivery Information </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-green-700 mb-1">Full Name</div>
                          <div className="text-sm bg-white p-2 rounded border">
                            {parsedOrderData.deliveryInfo.fullName}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-medium text-green-700 mb-1">Phone</div>
                          <div className="text-sm bg-white p-2 rounded border flex items-center gap-2">
                            <Phone className="h-3 w-3"/>
                            {parsedOrderData.deliveryInfo.phone}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-medium text-green-700 mb-1">Email</div>
                          <div className="text-sm bg-white p-2 rounded border flex items-center gap-2">
                            <Mail className="h-3 w-3"/>
                            {parsedOrderData.deliveryInfo.email}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-medium text-green-700 mb-1">Postal Code</div>
                          <div className="text-sm bg-white p-2 rounded border">
                            {parsedOrderData.deliveryInfo.postalCode}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div>
                          <div className="text-sm font-medium text-green-700 mb-1">Address</div>
                          <div className="text-sm bg-white p-2 rounded border">
                            {parsedOrderData.deliveryInfo.address}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium text-green-700 mb-1">City</div>
                            <div className="text-sm bg-white p-2 rounded border">
                              {parsedOrderData.deliveryInfo.city}
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-medium text-green-700 mb-1">Country</div>
                            <div className="text-sm bg-white p-2 rounded border">
                              {parsedOrderData.deliveryInfo.country}
                            </div>
                          </div>
                        </div>

                        {parsedOrderData.deliveryInfo.deliveryComments && (
                          <div>
                            <div className="text-sm font-medium text-green-700 mb-1">Delivery Comments</div>
                            <div className="text-sm bg-white p-3 rounded border whitespace-pre-wrap">
                              {parsedOrderData.deliveryInfo.deliveryComments}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Cart Items */}
                    <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
                      <h4 className="font-semibold text-blue-800 mb-4 flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5"/>
                        Ordered Items ({parsedOrderData.cartItems.length}) </h4>

                      <div className="space-y-3">
                        {parsedOrderData.cartItems.map((item) => (
                          <div key={item.id} className="bg-white p-4 rounded border">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h5 className="font-medium text-blue-900 mb-2">{item.name}</h5>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <span className="text-blue-700 font-medium">Item ID:</span>
                                    <div className="font-mono text-xs mt-1 break-all">
                                      {item.id}
                                    </div>
                                  </div>

                                  <div>
                                    <span className="text-blue-700 font-medium">Price:</span>
                                    <div className="flex items-center gap-1 mt-1">
                                      <TokenIcon assetId={item.priceToken} size={16}/>
                                      <span className="font-semibold text-green-600">
                                        {priceToDisplayString(item.priceToken, parseInt(item.price))}
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    <span className="text-blue-700 font-medium">Quantity:</span>
                                    <div className="mt-1">
                                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                                        {item.quantity}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Fallback: display raw decrypted text if parsing failed
                  <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-800">Decrypted Delivery Information (Raw):</span>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(decryptedDeliveryInfo)}>
                        <Copy className="h-3 w-3 mr-1"/>
                        Copy
                      </Button>
                    </div>
                    <div className="bg-white p-3 rounded border text-sm whitespace-pre-wrap">
                      {decryptedDeliveryInfo}
                    </div>
                    <div className="text-xs text-green-600 mt-2">
                      Length: {decryptedDeliveryInfo.length} characters
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {order.status === '1' && (
          <div className="bg-yellow-50 p-4 rounded border-l-4 border-yellow-400 text-sm text-yellow-800">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 mt-0.5 text-yellow-600 flex-shrink-0"/>
              <p>
                This order has not been paid yet. <strong>Delivery actions will become available once payment is
                completed.</strong>
              </p>
            </div>
          </div>
        )}

        {/* Delivery Actions - Only show for Initial (1) and Paid (2) statuses */}
        {shouldShowDeliveryActions() && !showConfirmDelivery && !showRefuseDelivery && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5"/>
                Delivery Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button onClick={handleShowConfirmDelivery} className="bg-green-600 hover:bg-green-700">
                  <Truck className="mr-2 h-4 w-4"/>
                  Confirm Delivery
                </Button>
                <Button onClick={handleShowRefuseDelivery} variant="destructive">
                  <XCircle className="mr-2 h-4 w-4"/>
                  Refuse Delivery
                </Button>
              </div>
              <p className="text-sm text-muted-foreground text-center mt-4">
                Choose an action to update the order status on the {CRYPTO_NAME_BLOCKCHAIN} </p>
            </CardContent>
          </Card>
        )}

        {/* Confirm Delivery Component */}
        {showConfirmDelivery && (
          <ConfirmDelivery order={order} onDeliveryConfirmed={handleDeliveryConfirmed}
                           onCancel={handleCancelDeliveryAction}/>
        )}

        {/* Refuse Delivery Component */}
        {showRefuseDelivery && (
          <RefuseDelivery order={order} onDeliveryRefused={handleDeliveryRefused}
                          onCancel={handleCancelDeliveryAction}/>
        )}

        {/* Cryptographic Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5"/>
              Cryptographic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Encrypted Delivery Payload */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4"/>
                Encrypted Delivery Payload </h4>

              <div className="mb-3 p-3 bg-muted/50 border rounded-lg">
                <div className="text-sm font-medium mb-1">Buyer Payload Hash</div>
                <CopyableField value={order.payloadHashBuyer} length={30} mdLength={70} small={true}/>
                <div className="text-xs text-muted-foreground mt-2">
                  The encrypted buyer payload is stored in HFS. It is fetched only when you click `Decrypt Payload`.
                </div>
              </div>

              {isLoadingPayloadFromBox && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                  <span className="text-sm text-blue-700">Loading encrypted buyer payload from HFS for {order.seed}</span>
                </div>
              )}

              {payloadLoadError && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0"/>
                  <div className="text-sm text-destructive">{payloadLoadError}</div>
                </div>
              )}

              {encryptedPayloadFromBox && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4"/>
                    <span className="text-sm font-medium">Encrypted buyer payload loaded from HFS for {order.seed}</span>
                  </div>

                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Encrypted Payload:</span>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(encryptedPayloadFromBox)}>
                        <Copy className="h-3 w-3 mr-1"/>
                        Copy
                      </Button>
                    </div>
                    <div className="bg-background p-3 rounded border font-mono text-xs break-all whitespace-pre-wrap">
                      {encryptedPayloadFromBox}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Length: {encryptedPayloadFromBox.length} characters
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Public Keys */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4"/>
                Public Keys </h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Buyer Public Key:</div>
                  <CopyableField value={order.buyerPubKey} length={30} mdLength={70} small={true}/>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Seller Public Key:</div>
                  <CopyableField value={order.sellerPubKey} length={30} mdLength={70} small={true}/>
                </div>
              </div>
            </div>

            {/* Encrypted Keys */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Key className="h-4 w-4"/>
                Encrypted Symmetric Keys </h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Buyer Encrypted Key:</div>
                  <CopyableField value={order.encryptedSymKeyBuyer} length={30} mdLength={70} small={true}/>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Seller Encrypted Key:</div>
                  <CopyableField value={order.encryptedSymKeySeller} length={30} mdLength={70} small={true}/>
                </div>
              </div>
            </div>

            {/* Hashes */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4"/>
                Data Hashes </h4>
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Symmetric Key Hash:</div>
                  <CopyableField value={order.symKeyHash} length={30} mdLength={70} small={true}/>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Buyer Payload Hash:</div>
                    <CopyableField value={order.payloadHashBuyer} length={30} mdLength={70} small={true}/>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Seller Payload Hash:</div>
                    <CopyableField value={order.payloadHashSeller} length={30} mdLength={70} small={true}/>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Details moved here */}
            <div className="border-t pt-6">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Hash className="h-4 w-4"/>
                Technical Details </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Version:</div>
                  <span className="text-sm bg-muted px-2 py-1 rounded">{order.version}</span>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Raw Price:</div>
                  <span className="text-sm font-mono">{order.price}</span>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Raw Timestamps:</div>
                  <div className="text-xs font-mono space-y-1">
                    <div>Created: {order.createdDate}</div>
                    <div>Updated: {order.updatedDate}</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Content Modal */}
      <ViewContentModal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title={viewModalTitle}
                        content={viewModalContent}/>
    </div>
  )
}

export default OrderDetailsPage
