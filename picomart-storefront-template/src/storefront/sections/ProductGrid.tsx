import {Link} from 'react-router-dom';
import {ArrowUpRight} from 'lucide-react';
import {ProductImage} from '@/components/commerce/ProductImage';
import {ProductPrice} from '@/components/commerce/ProductPrice';
import {useShop} from '@/lib/shop/context';
import type {Product} from '@/lib/productSchemas';

export function ProductGrid({products}: {products: Product[]}) {
  const {config, path} = useShop();
  return <div className="shop-product-grid">
    {products.map(product => <article key={product.ProductId} className="shop-product-card" data-testid="product-card">
      <Link to={path(`/products/${product.ProductId}`)} aria-label={`View ${product.Name}`}>
        <ProductImage src={product.Image} name={product.Name}/>
        <div className="shop-product-card-body"><h3>{product.Name}</h3><ArrowUpRight size={18} aria-hidden="true"/><p><ProductPrice product={product} network={config.network}/></p></div>
      </Link>
    </article>)}
  </div>;
}
