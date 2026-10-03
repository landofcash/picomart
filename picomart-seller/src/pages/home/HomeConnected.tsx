import {Link} from 'react-router-dom'
import {ShoppingCart, PackageSearch, Globe, FileText, Wallet} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import TempoCatalogsPage from '@/pages/TempoCatalogsPage'
import {APP_NAME, CRYPTO_NAME} from '@/config'

function HomeConnected() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-6xl space-y-8">
        {/* Main Hero Card */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl sm:text-4xl font-bold">{APP_NAME} Seller</CardTitle>
            <CardDescription className="text-sm sm:text-xl mt-2">
              Manage your products
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="text-sm sm:text-base grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full">
              <Link to="/edit-product-catalogue" className="w-full">
                <Button className="w-full" size="lg">
                  <PackageSearch className="mr-2 h-5 w-5"/>
                  Create Catalog
                </Button>
              </Link>

              <Link to="/my-orders" className="w-full">
                <Button className="w-full" size="lg">
                  <ShoppingCart className="mr-2 h-5 w-5"/>
                  My Orders
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Product Catalogues List */}
        <TempoCatalogsPage embedded/>

        {/* Seller Capabilities (no CTA here, since already connected) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-purple-500"/>
              What You Can Do as a Seller
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-500"/>
                  <h4 className="font-medium">Catalog Management</h4>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Create product catalogs</li>
                  <li>• Store catalog link on-chain</li>
                  <li>• Print price tags with QR-Codes</li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-green-500"/>
                  <h4 className="font-medium">Order Processing</h4>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• View incoming customer orders</li>
                  <li>• Access encrypted delivery information</li>
                  <li>• Confirm or refuse deliveries</li>
                  <li>• Track order status in real-time</li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-purple-500"/>
                  <h4 className="font-medium">{CRYPTO_NAME} Benefits</h4>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Transparent transaction history</li>
                  <li>• Secure encrypted communications</li>
                  <li>• No intermediary</li>
                  <li>• Global accessibility</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default HomeConnected
