import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/context/WalletContext'
import { fetchSellerOrders, type Order } from '@/lib/syncService'
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  HandCoins,
  Package,
  RefreshCw,
  ShoppingCart,
  Truck,
  User,
  Wallet2,
  type LucideIcon,
} from 'lucide-react'
import CopyableField from '@/components/CopyableField'
import TokenIcon from '@/components/TokenIcon'
import { priceToDisplayString } from '@/lib/tokenUtils'
import { formatUtcDate } from '@/lib/dateUtils'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import { getHederaAccountIdFromEvmAddress } from '@/lib/hedera/hederaUtils'

interface OrderStatusVisual {
  Icon: LucideIcon
}

function getOrderStatusVisual(status: string): OrderStatusVisual {
  switch (status) {
    case '1':
      return { Icon: Package }
    case '2':
      return { Icon: Wallet2 }
    case '3':
      return { Icon: Truck }
    case '4':
      return { Icon: CheckCircle2 }
    case '5':
      return { Icon: RefreshCw }
    case '6':
      return { Icon: HandCoins }
    case '7':
      return { Icon: ArrowRight }
    case '8':
      return { Icon: AlertCircle }
    default:
      return { Icon: Package }
  }
}

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

function isHederaAccountId(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value.trim())
}

async function resolveBuyerAccountId(identifier: string): Promise<string> {
  const normalizedIdentifier = identifier.trim()
  if (!normalizedIdentifier) {
    return ''
  }

  if (isHederaAccountId(normalizedIdentifier)) {
    return normalizedIdentifier
  }

  try {
    const accountId = await getHederaAccountIdFromEvmAddress(normalizedIdentifier)
    return accountId.toString()
  } catch (error) {
    console.warn('Failed to resolve buyer account id:', normalizedIdentifier, error)
    return normalizedIdentifier
  }
}

function MyOrdersPage() {
  const { walletAddress, walletCanTransact, walletKind, walletBootstrapMessage } = useWallet()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [buyerAccountIds, setBuyerAccountIds] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = async () => {
    if (!walletAddress || (walletKind === 'internal' && !walletCanTransact)) {
      setOrders([])
      setBuyerAccountIds({})
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const sellerOrders = await fetchSellerOrders(walletAddress)
      const uniqueBuyerIds = [...new Set(sellerOrders.map(order => order.buyer).filter(Boolean))]
      const resolvedBuyerEntries = await Promise.all(
        uniqueBuyerIds.map(async (buyerId) => [buyerId, await resolveBuyerAccountId(buyerId)] as const),
      )
      setBuyerAccountIds(Object.fromEntries(resolvedBuyerEntries))
      const sortedSellerOrders = [...sellerOrders].sort(
        (a, b) => parseTimestamp(b.createdDate) - parseTimestamp(a.createdDate),
      )
      setOrders(sortedSellerOrders)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [walletAddress, walletCanTransact, walletKind])

  const handleViewDetails = (order: Order) => {
    navigate('/order-details', { state: { order } })
  }

  if (!walletAddress) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              My Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Please connect your wallet to view your orders.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (walletKind === 'internal' && !walletCanTransact) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              My Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {walletBootstrapMessage ?? 'Activate and fund this internal wallet before loading on-chain order data.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              My Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading orders...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              My Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                When customers place orders for your products, they will appear here.
                You'll be able to track order status, manage fulfillment, and communicate with buyers.
              </p>
            </div>

            <div className="border-t pt-6">
              <h4 className="font-semibold mb-3">Features Available:</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• View incoming customer orders</li>
                <li>• Track order status and payment confirmations</li>
                <li>• Manage order fulfillment and shipping</li>
                <li>• Communicate with buyers</li>
                <li>• Export order data and analytics</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="px-4 py-8 sm:py-16">
      <Card className="w-full max-w-7xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            My Orders ({orders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {orders.map((order) => {
              const statusVisual = getOrderStatusVisual(order.status)
              const StatusIcon = statusVisual.Icon

              return (
                <div
                  key={order.seed}
                  className="group p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm transition group-hover:scale-[1.02] group-hover:bg-primary/15 group-hover:shadow-md"
                      aria-hidden="true"
                    >
                      <StatusIcon className="h-8 w-8" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Column 1: Order ID & Status */}
                        <div className="space-y-1">
                          <div className="flex items-start gap-2">
                            <div className="text-sm font-medium text-muted-foreground">Order ID:</div>
                            <CopyableField value={order.seed} small={false}/>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Status:</span>
                            <OrderStatusBadge status={order.status} />
                          </div>
                        </div>

                  {/* Column 2: Customer & Amount */}
                        <div className="space-y-1">
                          <div className="flex items-start gap-2">
                            <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm font-medium text-muted-foreground">Customer:</div>
                            <CopyableField value={buyerAccountIds[order.buyer] ?? order.buyer} small={false}/>
                          </div>

                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">Amount:</span>
                            <div className="flex items-center gap-1">
                              <TokenIcon assetId={order.priceToken} size={16} />
                              <span className="font-semibold text-green-600 text-sm">
                                {priceToDisplayString(order.priceToken, parseInt(order.amount))}
                              </span>
                            </div>
                          </div>
                        </div>

                  {/* Column 3: Created & Updated */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">Created:</span>
                            <span className="text-sm">
                              {formatUtcDate(parseTimestamp(order.createdDate))}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">Updated:</span>
                            <span className="text-sm">
                              {formatUtcDate(parseTimestamp(order.updatedDate))}
                            </span>
                          </div>
                        </div>

                  {/* Column 4: Action Buttons */}
                        <div className="flex flex-col justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(order)}
                            className="h-8"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="text-sm text-destructive">{error}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default MyOrdersPage
