import {Link, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {Search, RefreshCw} from 'lucide-react';
import {useShop} from '@/lib/shop/context';
import {useCatalog} from '@/lib/catalog/useCatalog';
import {Button} from '@/components/ui/button';
import {ProductGrid} from '../sections/ProductGrid';
import {CatalogStatus} from '../sections/CatalogStatus';
import {NotFoundPage} from './NotFoundPage';

export function ProductsPage() {
  const {config, path} = useShop();
  const {products, loading, error, refresh} = useCatalog();
  const {collectionId} = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const collection = config.collections.find(item => item.id === collectionId);
  if (collectionId && !collection) return <NotFoundPage/>;
  const query = search.get('q') ?? '';
  const sort = search.get('sort') ?? 'catalog';
  const filtered = products.filter(product => (!collection || collection.productIds.includes(product.ProductId)) && `${product.Name} ${product.Description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if (sort === 'name') filtered.sort((a, b) => a.Name.localeCompare(b.Name));
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value); else next.delete(key);
    setSearch(next, {replace: true});
  };
  return <section className="shop-container shop-page">
    <nav className="shop-breadcrumbs" aria-label="Breadcrumb"><Link to={path('/')}>Home</Link><span>/</span><span>{collection?.name || 'Shop all'}</span></nav>
    <div className="shop-page-heading"><div><p className="shop-eyebrow">The catalog</p><h1>{collection?.name || 'Shop all'}</h1><p className="shop-muted">{collection?.description || 'Discover every product in the current collection.'}</p></div><Button disabled={loading} aria-label="Refresh products" onClick={() => void refresh()}><RefreshCw size={16}/><span>Refresh</span></Button></div>
    <div className="shop-filters">
      <label className="shop-search-field"><span className="sr-only">Search products</span><Search size={18} aria-hidden="true"/><input type="search" placeholder="Search the collection" value={query} onChange={event => update('q', event.target.value)}/></label>
      <label><span className="sr-only">Collection</span><select aria-label="Collection" value={collectionId || ''} onChange={event => navigate(path(`${event.target.value ? `/collections/${event.target.value}` : '/products'}${search.size ? `?${search}` : ''}`))}><option value="">All collections</option>{config.collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span className="sr-only">Sort products</span><select aria-label="Sort products" value={sort} onChange={event => update('sort', event.target.value)}><option value="catalog">Catalog order</option><option value="name">Name: A to Z</option></select></label>
    </div>
    <CatalogStatus/>
    {!error && <><p className="shop-results-count" role="status">{loading ? 'Refreshing products…' : `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}`}</p><ProductGrid products={filtered}/></>}
    {!loading && !error && !filtered.length && <div className="shop-state"><h2>{query ? 'No matching products' : 'No products here yet'}</h2><p>{query ? 'Try another search or explore a different collection.' : 'Check back when the shop updates its catalog.'}</p>{query && <Button onClick={() => update('q', '')}>Clear search</Button>}</div>}
  </section>;
}
