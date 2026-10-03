import {Link} from 'react-router-dom';
import {ArrowUpRight} from 'lucide-react';
import {useShop} from '@/lib/shop/context';

export function ShopFooter() {
  const {config, path} = useShop();
  return <footer className="shop-footer"><div className="shop-container">
    <div className="shop-footer-top"><div><Link className="shop-brand" to={path('/')}>{config.branding.name}</Link><p>{config.branding.description}</p></div>
      <nav aria-label="Footer navigation"><Link to={path('/products')}>Shop all</Link><Link to={path('/about')}>About the shop</Link>
        {config.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={14}/></a>)}
      </nav>
    </div>
    <div className="shop-footer-bottom"><span>© {new Date().getFullYear()} {config.branding.name}</span><a href="https://picomart.zkbytes.com" target="_blank" rel="noopener noreferrer">Powered by Picomart <ArrowUpRight size={13}/></a></div>
  </div></footer>;
}
