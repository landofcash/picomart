import {QrCode, ShoppingCart, Settings, Package} from 'lucide-react'
import {Button} from './components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from './components/ui/card'
import {Link} from 'react-router-dom'
import WalletAuth from './components/WalletAuth'
import BrandLockup from './components/BrandLockup'
import AppFooter from './components/AppFooter'
import TempoNetworkIndicator from './components/TempoNetworkIndicator'

function App() {
  return (
    <div className="min-h-screen bg-background flex items-start justify-center pb-2 sm:px-4 sm:pb-16">
      <Card className="w-full max-w-md overflow-hidden rounded-none border-0 bg-background pt-0 shadow-none sm:rounded-2xl sm:border sm:shadow-sm">
        <div>
        <TempoNetworkIndicator className="hidden sm:block"/>
        <CardHeader className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white py-6 text-center">
          <CardTitle className="flex justify-center">
            <BrandLockup
              size="hero"
              className="justify-center"
              wordmarkClassName="text-slate-950"
              logoClassName="drop-shadow-[0_14px_24px_rgba(15,23,42,0.08)]"
            />
          </CardTitle>
          <CardDescription className="text-lg sm:text-xl mt-2">
            Scan. Shop. Pay in a flash.
          </CardDescription>
        </CardHeader>
        </div>
        <CardContent className="space-y-4">
          <Link to="/scan" className="block w-full">
            <Button className="w-full" size="lg">
              <QrCode className="mr-2 h-5 w-5"/>
              Scan QR
            </Button>
          </Link>
          <Link to="/cart" className="block w-full">
            <Button variant="outline" className="w-full" size="lg">
              <ShoppingCart className="mr-2 h-5 w-5"/>
              View Cart
            </Button>
          </Link>
          <Link to="/orders" className="block w-full">
            <Button variant="outline" className="w-full" size="lg">
              <Package className="mr-2 h-5 w-5"/>
              My Orders
            </Button>
          </Link>

          {/* Wallet components stacked vertically for mobile */}
          <div className="flex flex-col gap-3">
            <WalletAuth/>
          </div>

          {/* Settings button on its own line with icon and text */}
          <Link to="/settings" className="block w-full">
            <Button variant="outline" size="lg" className="w-full">
              <Settings className="mr-2 h-5 w-5"/>
              Settings
            </Button>
          </Link>
        </CardContent>
        <AppFooter/>
      </Card>
    </div>
  )
}

export default App
