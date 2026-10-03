import {useState} from 'react';
import {Link, NavLink} from 'react-router-dom';
import {Menu, Search, ArrowUpRight} from 'lucide-react';
import {useShop} from '@/lib/shop/context';
import {shopAssetUrl} from '@/lib/shop/config';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';

export function ShopHeader() {
  const {config, path} = useShop();
  const [open, setOpen] = useState(false);
  const links = [{label: 'Shop all', to: '/products'}, ...config.collections.map(collection => ({label: collection.name, to: `/collections/${collection.id}`})), {label: 'About the shop', to: '/about'}];
  return <>
    <div className="shop-announcement"><span>Discover the collection</span><span>Continue your order in Picomart <ArrowUpRight size={13}/></span></div>
    <header className="shop-header shop-container">
      <Link className="shop-brand" to={path('/')}>
        {config.branding.logo ? <img src={shopAssetUrl(config.branding.logo)} alt=""/> : <span className="shop-brand-mark" aria-hidden="true">{config.branding.name.charAt(0)}</span>}
        <span>{config.branding.name}</span>
      </Link>
      <nav className="shop-desktop-nav" aria-label="Main navigation">
        {links.slice(0, 4).map(link => <NavLink key={link.to} to={path(link.to)}>{link.label}</NavLink>)}
      </nav>
      <div className="shop-header-actions">
        <Link className="shop-search-link" aria-label="Search products" to={path('/products?q=')}><Search size={20}/></Link>
        <div className="shop-mobile-nav">
          <Modal title="Explore the shop" description={config.branding.name} sheet open={open} onOpenChange={setOpen}
            trigger={<Button variant="icon" aria-label="Open navigation"><Menu size={23}/></Button>}>
            <nav className="shop-menu-links" aria-label="Mobile navigation">
              {links.map(link => <Link key={link.to} to={path(link.to)} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight size={18}/></Link>)}
            </nav>
          </Modal>
        </div>
      </div>
    </header>
  </>;
}
