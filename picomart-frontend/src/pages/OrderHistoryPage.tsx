import {ArrowLeft, Package, Loader2, AlertCircle, RefreshCw, ShoppingBag} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Link} from 'react-router-dom'
import {useCallback, useEffect, useState} from 'react'
import AppShellCard from '@/components/AppShellCard'
import {useWallet} from '@/context/WalletContext'
import OrderItemDisplay from '@/components/OrderItemDisplay'
import {getCurrentConfig} from "@/config.ts";
import type {BuyerOrderGroup, Order} from '@/lib/syncService.ts'

interface OrdersResponse {
  success: boolean
  data: BuyerOrderGroup
}

function OrderHistoryPage() {
  const {walletAddress, network} = useWallet()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const fetchOrders = useCallback(async () => {
    if (!walletAddress) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const config = getCurrentConfig()
      const response = await fetch(`${config.apiUrl}/orders/buyer/${walletAddress}`)

      if (!response.ok) {
        if (response.status === 404) {
          // No orders found for this wallet
          setOrders([])
          return
        }
        throw new Error(`Failed to fetch orders: ${response.status} ${response.statusText}`)
      }

      const data: OrdersResponse = await response.json()

      if (!data.success) {
        throw new Error('API returned unsuccessful response')
      }

      // Filter orders by current network
      if (data.data.networkName === network) {
        const sortedOrders = [...data.data.orders].sort(
          (a, b) => Number(b.createdDate) - Number(a.createdDate)
        )
        setOrders(sortedOrders)
      } else {
        setOrders([])
      }
    } catch (err) {
      console.error('Error fetching orders:', err)
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [walletAddress, network])

  useEffect(() => {
    fetchOrders()
  }, [walletAddress, network, fetchOrders])

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">My Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!walletAddress && (
            <div className="text-center text-muted-foreground py-8">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50"/>
              <p className="text-lg font-medium mb-2">Connect your wallet</p>
              <p className="text-sm">Please connect your wallet to view your order history.</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mr-2"/>
              <span>Loading orders...</span>
            </div>
          )}

          {error && (
            <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5"/>
                <div>
                  <p className="font-medium">Failed to load orders</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={fetchOrders} className="mt-3">
                <RefreshCw className="h-4 w-4 mr-2"/>
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && walletAddress && orders.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-50"/>
              <p className="text-lg font-medium mb-2">No orders yet</p>
              <p className="text-sm">Your order history will appear here once you make your first purchase.</p>
              <p className="text-xs mt-2 text-muted-foreground">
                Network: {network}
              </p>
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <div className="space-y-4">
              {orders.map((order) => (
                <OrderItemDisplay key={order.seed} order={order} onOrderUpdated={fetchOrders}/>
              ))}

              <div className="text-center pt-4">
                <Button variant="outline" size="sm" onClick={fetchOrders}>
                  <RefreshCw className="h-4 w-4 mr-2"/>
                  Refresh Orders
                </Button>
              </div>
            </div>
          )}

          <div className="pt-4">
            <Link to="/" className="block w-full">
              <Button className="w-full" size="lg">
                <ArrowLeft className="mr-2 h-5 w-5"/>
                Back to Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </AppShellCard>
    </div>
  )
}

export default OrderHistoryPage
