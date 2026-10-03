import {Link, useParams} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import {useShop} from '@/lib/shop/context';
import {useCatalog} from '@/lib/catalog/useCatalog';
import {ProductImage} from '@/components/commerce/ProductImage';
import {ProductPrice} from '@/components/commerce/ProductPrice';
import {BuyerAppLink} from '@/components/commerce/BuyerAppLink';
import {ProductQr} from '@/components/commerce/ProductQr';
import {CatalogStatus} from '../sections/CatalogStatus';
import {ProductGrid} from '../sections/ProductGrid';

export function ProductDetailsPage() {
  const {config, path} = useShop();
  const {products, data, loading, error} = useCatalog();
  const {productId} = useParams();
  const product = products.find(item => item.ProductId === productId);
  if (error || (!data && loading)) return <div className="shop-container shop-page"><CatalogStatus/></div>;
  if (!product) return <div className="shop-container shop-state"><h1>Product unavailable</h1><p>This product is no longer in the shop's current catalog.</p><Link className="shop-button shop-button-primary" to={path('/products')}>Explore other products</Link></div>;
  const others = products.filter(item => item.ProductId !== productId).slice(0, 4);
  return <div className="shop-container shop-page">
    <nav className="shop-breadcrumbs" aria-label="Breadcrumb"><Link to={path('/')}>Home</Link><span>/</span><Link to={path('/products')}>Shop all</Link><span>/</span><span>{product.Name}</span></nav>
    <section className="shop-product-detail"><ProductImage src={product.Image} name={product.Name} priority/>
      <div className="shop-product-description"><p className="shop-eyebrow">{config.branding.name}</p><h1>{product.Name}</h1><p className="shop-detail-price"><ProductPrice product={product} network={config.network}/></p>
        <p className="shop-product-copy">{product.Description}</p>
        <div className="shop-buy-actions"><BuyerAppLink catalogSeed={config.catalogSeed} productId={product.ProductId} network={config.network}/><ProductQr catalogSeed={config.catalogSeed} productId={product.ProductId} network={config.network}/></div>
        <p className="shop-muted shop-buy-note">Choose quantity and complete your order in the Picomart app.{' This catalog uses Tempo Moderato testnet.'}</p>
        <Link className="shop-text-link" to={path('/products')}><ArrowLeft size={16}/> Back to the collection</Link>
      </div>
    </section>
    {others.length > 0 && <section className="shop-section"><div className="shop-section-heading"><h2>More from this shop</h2></div><ProductGrid products={others}/></section>}
  </div>;
}
