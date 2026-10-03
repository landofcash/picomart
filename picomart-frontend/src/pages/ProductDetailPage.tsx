import {ArrowLeft, ShoppingCart, Loader2, ChevronDown, ChevronUp} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Link, useLocation, Navigate, useNavigate} from 'react-router-dom'
import {useEffect, useState} from 'react'
import {ProductCatalogueSchema, type Product} from '@/lib/productSchemas'
import {addItemToCart} from '@/lib/cartStorage'
import {cartItemKey} from '@/lib/cartIdentity'
import CatalogIdentity from '@/components/CatalogIdentity'
import { safePriceToDisplayString as priceToDisplayString, getSupportedTokens } from '@/lib/tokenUtils'
import TokenIcon from '@/components/TokenIcon'
import AppShellCard from '@/components/AppShellCard'
import {fetchProductBySeed, type ProductData} from "@/lib/syncService.ts";
import type {NetworkId} from "@/context/wallet/types.ts";
import {getCurrentConfig} from "@/config.ts";
import {normalizePublicKeyBase64} from "@/utils/encryption.ts";

interface ProductRaw {
  ProductId: string
  PriceToken: string
  Price: number // from JSON
  Name: string
  Description: string
  Image: string
}

type LocationState = {
  productSeed: string
  itemId: string
  network: NetworkId
} | null

function ProductDetailPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as LocationState
  const [productData, setProductData] = useState<ProductData | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  useEffect(() => {
    if (!state?.productSeed || !state?.itemId || !state?.network) return
    const fetchProductData = async () => {
      setLoading(true)
      setError('')
      try {
        if(state?.network !== getCurrentConfig().name){
          const errorText = `This product is on ${state.network} network.
           Please switch to ${state.network} network to view this product.`
          console.error(errorText)
          setError(errorText)
          return;
        }
        const productData = await fetchProductBySeed(state.productSeed)
        if (productData == null) {
          const errorText = `Product Catalogue with seed:${state.productSeed} not found.`
          console.error(errorText)
          setError(errorText)
          return;
        }
        let normalizedSellerPubKey: string
        try {
          normalizedSellerPubKey = normalizePublicKeyBase64(productData.sellerPubKey)
        } catch (keyError) {
          const errorText = keyError instanceof Error ? keyError.message : 'Seller public key is invalid.'
          console.error(errorText)
          setError(errorText)
          return
        }
        setProductData({
          ...productData,
          sellerPubKey: normalizedSellerPubKey,
        })
        const catalogueResponse = await fetch(productData.productsUrl)
        if (!catalogueResponse.ok) {
          const errorText = `Failed to fetch catalogue: ${catalogueResponse.status} ${catalogueResponse.statusText}`
          console.error(errorText)
          setError(errorText)
          return;
        }
        const catalogueData = await catalogueResponse.json() as ProductRaw[]
        // @ts-expect-ignore parsing JSON
        const catalogueWithBigIntPrices = catalogueData
          .map((productTemp) => ({
            ...productTemp,
            Price: BigInt(productTemp.Price) // Convert to bigint
          }))
        const parsedCatalogue = ProductCatalogueSchema.parse(catalogueWithBigIntPrices)
        // Find the specific product by itemId
        const foundProduct = parsedCatalogue
          .find(p => p.ProductId === state.itemId)
        if (!foundProduct) {
          const errorText = `Product with ID ${state.itemId} not found in catalogue`
          console.error(errorText)
          setError(errorText)
          return;
        }
        setProduct(foundProduct)
      } catch (err) {
        console.error('Error fetching product data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load product data')
      } finally {
        setLoading(false)
      }
    }
    fetchProductData()
  }, [state?.productSeed, state?.itemId, state?.network])

  const handleAddToCart = () => {
    if (!product || !productData || !state) return
    try {
      addItemToCart({
        id: product.ProductId,
        name: product.Name,
        price: product.Price,
        priceToken: product.PriceToken,
        quantity: 1,
        image: product.Image,

        shopWallet: productData.shopWallet,
        sellerPubKey: productData.sellerPubKey,
        seed: productData.seed,
        network: state.network,
      })

      // Navigate to the cart page with the highlighted item ID
      navigate('/cart', {state: {highlightedItemKey: cartItemKey({
        id: product.ProductId, seed: productData.seed, shopWallet: productData.shopWallet, network: state.network,
      })}})
    } catch (err) {
      console.error('Error adding to cart:', err)
      alert('Failed to add product to cart')
    }
  }

  const supportedCoinTypes = new Set(getSupportedTokens().map(t => t.tokenId))
  const isSupportedToken = product ? supportedCoinTypes.has(product.PriceToken) : true
  const hasValidSellerPubKey = productData ? productData.sellerPubKey.trim().length > 0 : false

  const toggleTechnicalDetails = () => {
    setShowTechnicalDetails(prev => !prev)
  }

  if (!state) {
    return <Navigate to="/scan" replace/>
  }

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/scan">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">Product Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin"/>
              <span className="ml-2">Loading product...</span>
            </div>
          )}

          {error && (
            <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {product && !loading && (
            <div className="space-y-4">
              {productData && <CatalogIdentity seed={productData.seed}/>}
              {/* Product Image */}
              <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                <img src={product.Image} alt={product.Name} className="w-full h-full object-cover" onError={(e) => {
                  // Fallback to placeholder if the image fails to load
                  e.currentTarget.src = 'https://images.pexels.com/photos/230544/pexels-photo-230544.jpeg'
                }}/>
              </div>

              {/* Product Info */}
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{product.Name}</h2>
                {product.Description && (
                  <p className="text-muted-foreground text-sm whitespace-pre-wrap">{product.Description}</p>
                )}

                <div className="flex items-center gap-2">
                  <TokenIcon assetId={product.PriceToken} size={20}/>
                  <span className="text-2xl font-bold text-primary">
                    {priceToDisplayString(product.PriceToken, product.Price)}
                  </span>
                </div>
              </div>

              {/* Unsupported token warning */}
              {!isSupportedToken && (
                <div className="p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-sm">
                  This product uses an unsupported payment token and cannot be added to the cart.
                </div>
              )}

              {productData && !hasValidSellerPubKey && (
                <div className="p-3 rounded-md border border-destructive bg-destructive/10 text-destructive text-sm">
                  This product is missing a valid seller encryption key and cannot be purchased.
                </div>
              )}

              {/* Add to Cart Button */}
              <Button className="w-full" size="lg" onClick={handleAddToCart} disabled={!isSupportedToken || !hasValidSellerPubKey}>
                <ShoppingCart className="mr-2 h-5 w-5"/>
                Add to Cart
              </Button>
            </div>
          )}

          {/* Technical Details Toggle Button */}
          <Button variant="outline" onClick={toggleTechnicalDetails}
                  className="w-full flex items-center justify-center gap-2">
            {showTechnicalDetails ? (
              <>
                <ChevronUp className="h-4 w-4"/>
                Hide Technical Details </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4"/>
                Show Technical Details </>
            )}
          </Button>

          {/* Technical Details - Conditionally Rendered */}
          {showTechnicalDetails && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <h3 className="font-medium text-sm">Technical Details</h3>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-medium text-muted-foreground">Product Seed:</span>
                  <p className="font-mono break-all">{state.productSeed}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Item ID:</span>
                  <p className="font-mono break-all">{state.itemId}</p>
                </div>
                {productData && (
                  <>
                    <div>
                      <span className="font-medium text-muted-foreground">Shop Wallet:</span>
                      <p className="font-mono break-all">{productData.shopWallet}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Seller PubKey:</span>
                      <p className="font-mono break-all text-xs">{productData.sellerPubKey}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Catalogue URL:</span>
                      <p className="font-mono break-all text-xs">
                        {productData.productsUrl}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </AppShellCard>
    </div>
  )
}

export default ProductDetailPage
