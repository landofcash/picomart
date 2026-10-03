import {useCatalog} from '@/lib/catalog/useCatalog';
import {Button} from '@/components/ui/button';

export function CatalogStatus() {
  const {loading, error, data, refresh} = useCatalog();
  if (error) return <div className="shop-state" role="alert"><h2>Products are unavailable right now</h2><p>Please try loading the catalog again.</p><Button onClick={() => void refresh()}>Try again</Button></div>;
  if (loading && !data) return <div className="shop-loading" role="status" aria-label="Loading products"><div className="shop-skeleton"/><div className="shop-skeleton"/><div className="shop-skeleton"/></div>;
  return null;
}
