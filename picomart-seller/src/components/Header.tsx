import {Link} from 'react-router-dom';
import {Home,PackageSearch,ShoppingCart,Store,Settings} from 'lucide-react';
import TempoNetworkIndicator from './TempoNetworkIndicator';
import WalletAuth from './WalletAuth';
import {useWallet} from '@/context/WalletContext';
export default function Header(){const {walletAddress}=useWallet();return <header className="sticky top-0 z-50 bg-background text-foreground border-b border-border bg-no-repeat bg-center print:hidden">
  <div className="relative z-10 max-w-7xl mx-auto min-h-16 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 py-3">
    <Link to="/" className="cursor-pointer inline-flex items-center gap-2"><img src="/logo.svg" alt="" className="w-9 h-9"/><h1 className="text-xl font-bold">Picomart Seller</h1></Link>
    {walletAddress&&<nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm md:text-base font-medium tracking-wide order-3 w-full md:order-none md:w-auto">{[
      {to:'/',label:'Dashboard',Icon:Home},{to:'/edit-product-catalogue',label:'Create Catalog',Icon:PackageSearch},
      {to:'/my-orders',label:'My Orders',Icon:ShoppingCart},{to:'/storefronts',label:'Storefronts',Icon:Store},
    ].map(({to,label,Icon})=><Link key={to} to={to} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"><Icon className="h-5 w-5"/>{label}</Link>)}</nav>}
    <div className="flex items-center gap-2"><TempoNetworkIndicator/><Link to="/settings" className="p-2 text-muted-foreground hover:text-foreground" aria-label="Settings"><Settings className="h-5 w-5"/></Link><WalletAuth/></div>
  </div>
</header>;}
