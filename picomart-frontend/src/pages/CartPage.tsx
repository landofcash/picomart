import {ArrowLeft, Trash2, Store, QrCode, ShoppingCart, AlertTriangle} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {CardContent, CardHeader, CardSlim, CardTitle} from '@/components/ui/card'
import {Link, useLocation, useNavigate} from 'react-router-dom'
import {useEffect, useMemo, useState} from 'react'
import {type CartItem, getCartItems, clearCart, saveCartItems} from '@/lib/cartStorage'
import {priceToDisplayString, getSupportedTokens} from '@/lib/tokenUtils'
import TokenIcon from '@/components/TokenIcon'
import AddressDisplay from '@/components/AddressDisplay'
import ApprovedShopBadge from '@/components/ApprovedShopBadge'
import AppShellCard from '@/components/AppShellCard'
import {useOrder} from '@/context/OrderContext'
import {useWallet} from '@/context/WalletContext'
import {cartItemKey, groupCartByCatalog} from '@/lib/cartIdentity'
import {validateCatalogCheckout} from '@/lib/catalogCheckout'
import CatalogIdentity from '@/components/CatalogIdentity'

type LocationState = {
  highlightedItemKey?: string
} | null

type CartItemWithNetwork = CartItem

function CartPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {setOrder} = useOrder()
  const {network} = useWallet()
  const state = location.state as LocationState
  const [cartItems, setCartItems] = useState<CartItemWithNetwork[]>([])
  const [highlightedItemKey, setHighlightedItemKey] = useState<string | null>(null)
  const [removedUnsupportedCount, setRemovedUnsupportedCount] = useState<number>(0)
  const [checkoutMessage, setCheckoutMessage] = useState('')

  useEffect(() => {
    const loaded = getCartItems() as CartItemWithNetwork[]

    // Build a set of supported coin types
    const supported = new Set(getSupportedTokens().map(t => t.tokenId))

    // Filter only the active network; another network may support different tokens.
    const cleaned = loaded.filter(it => it.network !== network || supported.has(it.priceToken))
    const removed = loaded.length - cleaned.length
    setRemovedUnsupportedCount(removed)
    if (removed > 0) {
      // Persist the cleaned cart so future visits remain stable
      saveCartItems(cleaned as CartItem[])
    }

    setCartItems(cleaned)

    // Set the highlighted item if provided in the navigation state
    if (state?.highlightedItemKey) {
      setHighlightedItemKey(state.highlightedItemKey)
    }
  }, [state?.highlightedItemKey, network])

  const visibleItems = useMemo(
    () => cartItems.filter(item => item.network === network),
    [cartItems, network]
  )

  // Clear highlight after 3 seconds
  useEffect(() => {
    if (!highlightedItemKey) return

    const timeout = setTimeout(() => {
      setHighlightedItemKey(null)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [highlightedItemKey])

  const handleClearCart = () => {
    clearCart()
    setCartItems([])
  }

  const handleUpdateQuantity = (key: string, newQuantity: number) => {
    if (!Number.isSafeInteger(newQuantity) || newQuantity < 1) return

    const updatedItems = getCartItems().map(item =>
      cartItemKey(item) === key
        ? {...item, quantity: newQuantity}
        : item
    )

    setCartItems(updatedItems)
    saveCartItems(updatedItems as CartItem[])
  }

  const handleRemoveItem = (key: string) => {
    const updatedItems = getCartItems().filter(
      item => cartItemKey(item) !== key
    )
    setCartItems(updatedItems)
    saveCartItems(updatedItems as CartItem[])
  }

  const handleCheckoutCatalog = (items: CartItem[]) => {
    let selection: ReturnType<typeof validateCatalogCheckout>
    try {
      selection = validateCatalogCheckout(items)
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : 'Invalid catalog checkout.')
      return
    }
    setCheckoutMessage('')

    // Create default delivery info
    const defaultDeliveryInfo = {
      fullName: '',
      address: '',
      city: '',
      postalCode: '',
      country: '',
      phone: '',
      email: '',
      deliveryComments: '',
      noPhysicalDelivery: false
    }

    // Store a cloned snapshot of only this catalog.
    setOrder({
      cartItems: selection.items,
      deliveryInfo: defaultDeliveryInfo,
      tokenTotals: selection.tokenTotals
    })

    // Navigate to the order page
    navigate('/order')
  }

  const groupedItems = useMemo(() => groupCartByCatalog(visibleItems), [visibleItems])

  // Calculate total by token type for all items (for display purposes)
  const globalTokenTotals = useMemo(() => {
    return visibleItems.reduce((totals, item) => {
      const tokenType = item.priceToken
      const itemTotal = item.price * BigInt(item.quantity)
      totals[tokenType] = (totals[tokenType] || 0n) + itemTotal
      return totals
    }, {} as Record<string, bigint>)
  }, [visibleItems])

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">Your Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkoutMessage && <p role="status" className="text-sm text-amber-800">{checkoutMessage}</p>}
          {removedUnsupportedCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
              <div className="text-sm">
                {removedUnsupportedCount} item{removedUnsupportedCount > 1 ? 's' : ''} in your cart use unsupported tokens and were removed.
              </div>
            </div>
          )}
          {visibleItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Your cart is empty </div>
          ) : (
            <>
              <div className="space-y-6">
                {groupedItems.map(shop => (
                  <CardSlim key={shop.key} className="gap-0">
                    {[...shop.catalogs.entries()].map(([key, items], catalogIndex) => {
                      const catalogTokenTotals = items.reduce((totals, item) => {
                        const tokenType = item.priceToken
                        const itemTotal = item.price * BigInt(item.quantity)
                        totals[tokenType] = (totals[tokenType] || 0n) + itemTotal
                        return totals
                      }, {} as Record<string, bigint>)

                      return (
                      <CardContent key={key} className={`px-0 space-y-3 mb-6 ${catalogIndex > 0 ? 'border-t pt-4' : ''}`}>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <div className="flex items-center gap-2 font-semibold">
                            <Store className="h-5 w-5 shrink-0 text-primary"/>
                            <AddressDisplay value={shop.wallet} length={20} preferAccountId />
                            <ApprovedShopBadge walletAddress={shop.wallet}/>
                          </div>
                          <CatalogIdentity seed={items[0].seed}/>
                        </div>
                        {/* Items for this catalog */}
                        <div className="space-y-3 mb-6">
                          {items.map(item => {
                            const itemNetwork = item.network
                            return (
                              <div key={cartItemKey(item)} className={`flex items-start gap-2 transition-all duration-1000 ${
                                highlightedItemKey === cartItemKey(item)
                                  ? 'animate-pulse bg-primary/10 shadow-lg scale-105'
                                  : 'bg-muted/30'
                              }`}>
                                {/* Product Image - Now a clickable link */}
                                <Link to="/product-details" state={{
                                  productSeed: item.seed,
                                  itemId: item.id,
                                  network: itemNetwork
                                }} className="flex-shrink-0">
                                  <img src={item.image} alt={item.name}
                                       className="w-16 h-16 object-cover rounded-md hover:opacity-80 transition-opacity cursor-pointer"/>
                                </Link>

                                <div className="flex-1 min-w-0 flex flex-col">
                                  <h3 className="font-medium line-clamp-2">{item.name}</h3>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <TokenIcon assetId={item.priceToken} size={16}/>
                                      <span>
                                        {priceToDisplayString(item.priceToken, item.price, false)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" size="icon"
                                              aria-label={`Decrease quantity of ${item.name}`}
                                              onClick={() => handleUpdateQuantity(cartItemKey(item), item.quantity - 1)}>
                                        -
                                      </Button>
                                      <span className="w-8 text-center">{item.quantity}</span>
                                      <Button variant="outline" size="icon"
                                              aria-label={`Increase quantity of ${item.name}`}
                                              onClick={() => handleUpdateQuantity(cartItemKey(item), item.quantity + 1)}>
                                        +
                                      </Button>
                                      <Button variant="ghost" size="icon" className="text-destructive"
                                              aria-label={`Remove ${item.name}`}
                                              onClick={() => handleRemoveItem(cartItemKey(item))}>
                                        <Trash2 className="h-4 w-4"/>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Catalog total and checkout */}
                        <div className="pt-3 border-t space-y-3">
                          <div className="space-y-2">
                            {Object.entries(catalogTokenTotals).map(([tokenType, total], index) => (
                              <div key={tokenType} className="flex items-center justify-between">
                                <span className="font-medium">
                                  {index === 0 ? 'Catalog Total:' : ''}
                                </span>
                                <div className="flex items-center gap-2">
                                  <TokenIcon assetId={tokenType} size={20}/>
                                  <span className="font-bold">
                                    {priceToDisplayString(tokenType, total)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Checkout only this catalog */}
                          <Button size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => handleCheckoutCatalog(items)}>
                            <ShoppingCart className="mr-2 h-5 w-5"/>
                            Checkout catalog
                          </Button>
                        </div>
                      </CardContent>
                      )
                    })}
                  </CardSlim>
                ))}
              </div>

              {/* Global Actions */}
              <div className="pt-4 border-t space-y-4">
                {/* Global Total (for reference) */}
                <div className="space-y-2">
                  {Object.entries(globalTokenTotals).map(([tokenType, total], index) => (
                    <div key={tokenType} className="flex items-center justify-between">
                      <span className="font-medium">
                        {index === 0 ? 'Grand Total:' : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        <TokenIcon assetId={tokenType} size={20}/>
                        <span className="font-bold">
                          {priceToDisplayString(tokenType, total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buttons Row - Clear Cart (1/4 width, left) and Scan Another Code (3/4 width, right) */}
                <div className="flex items-start gap-4">
                  {/* Clear Cart Button - 1/4 width, same height as the scan button */}
                  <Button variant="destructive" size="sm" onClick={handleClearCart}
                          className="w-1/4 h-20 flex flex-col items-center justify-center">
                    <Trash2 className="h-4 w-4 mb-1"/>
                    <span className="text-xs">Clear Cart</span>
                  </Button>

                  {/* Scan Another Code Button - 3/4 width, 2 rows height */}
                  <Link to="/scan" className="block w-3/4">
                    <Button className="w-full h-20" size="lg">
                      <QrCode className="mr-2 h-5 w-5"/>
                      Scan Another Code
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </AppShellCard>
    </div>
  )
}

export default CartPage
