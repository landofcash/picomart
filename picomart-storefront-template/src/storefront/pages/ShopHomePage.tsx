import {Link} from 'react-router-dom';
import {ArrowRight, ArrowUpRight} from 'lucide-react';
import {useShop} from '@/lib/shop/context';
import {useCatalog} from '@/lib/catalog/useCatalog';
import {ProductImage} from '@/components/commerce/ProductImage';
import {ProductPrice} from '@/components/commerce/ProductPrice';
import {ProductGrid} from '../sections/ProductGrid';
import {CatalogStatus} from '../sections/CatalogStatus';

export function ShopHomePage() {
  const {config, path} = useShop();
  const {products, loading, error} = useCatalog();
  const selected = [...new Set(config.featuredProductIds)].flatMap(id => products.filter(product => product.ProductId === id));
  const featured = selected.length ? selected : products.slice(0, 4);
  const hero = featured[0];
  return <>
    <section className="shop-hero shop-container" aria-labelledby="shop-headline">
      <div className="shop-hero-copy">
        <p className="shop-eyebrow">{config.branding.eyebrow || 'The collection'}</p>
        <h1 id="shop-headline">{config.branding.headline}</h1>
        <p className="shop-hero-description">{config.branding.description}</p>
        <Link className="shop-button shop-button-primary" to={path('/products')}>Explore the shop <ArrowRight size={18}/></Link>
        <div className="shop-hero-note"><span className="shop-small-rule"/>Browse here. Continue your order in Picomart.</div>
      </div>
      <div className="shop-hero-visual">
        <span className="shop-hero-caption">From the catalog</span>
        {hero ? <Link to={path(`/products/${hero.ProductId}`)} aria-label={`Discover ${hero.Name}`}>
          <ProductImage src={hero.Image} name={hero.Name} priority/>
          <div className="shop-hero-product"><div><span>{hero.Name}</span><ProductPrice product={hero} network={config.network}/></div><span className="shop-round-arrow"><ArrowUpRight size={23}/></span></div>
        </Link> : <div className="shop-hero-placeholder" aria-hidden="true"><span>{config.branding.name.charAt(0)}</span></div>}
      </div>
    </section>
    <section className="shop-section shop-container" aria-labelledby="featured-heading">
      <div className="shop-section-heading"><div><p className="shop-eyebrow">A closer look</p><h2 id="featured-heading">Explore the collection</h2></div><Link className="shop-text-link" to={path('/products')}>View all products <ArrowRight size={17}/></Link></div>
      <CatalogStatus/>
      {!error && featured.length > 0 && <ProductGrid products={featured}/>}
      {!error && !loading && !products.length && <p className="shop-empty">New products will appear here when the catalog is updated.</p>}
    </section>
    {config.collections.length > 0 && !error && <section className="shop-section shop-container" aria-labelledby="collections-heading">
      <div className="shop-section-heading"><div><p className="shop-eyebrow">Find your favorites</p><h2 id="collections-heading">Shop by collection</h2></div></div>
      <div className="shop-collection-grid">{config.collections.map(collection => {
        const items = products.filter(product => collection.productIds.includes(product.ProductId));
        return <Link className="shop-collection-card" key={collection.id} to={path(`/collections/${collection.id}`)}>
          <div><h3>{collection.name}</h3><p>{collection.description || 'Explore the selection'}</p>{!loading && <span>{items.length} {items.length === 1 ? 'product' : 'products'}</span>}</div><ArrowUpRight size={25}/>
        </Link>;
      })}</div>
    </section>}
    {config.branding.story && <section className="shop-story shop-container"><div><p className="shop-eyebrow">Behind the shop</p><h2>{config.branding.name}</h2></div><div><p>{config.branding.story}</p><Link className="shop-text-link" to={path('/about')}>About the shop <ArrowRight size={17}/></Link></div></section>}
  </>;
}
