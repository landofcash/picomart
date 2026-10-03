import {Link} from 'react-router-dom';
import {useShop} from '@/lib/shop/context';

export function NotFoundPage() {
  const {path} = useShop();
  return <section className="shop-state"><p className="shop-eyebrow">404</p><h1>Page not found</h1><p>Explore the shop to find what you're looking for.</p><Link className="shop-button shop-button-primary" to={path('/')}>Back to the shop</Link></section>;
}
