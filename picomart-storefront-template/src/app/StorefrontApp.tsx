import {useEffect, useState} from 'react';
import {Route, Routes, useLocation} from 'react-router-dom';
import {CatalogProvider} from '@/lib/catalog/CatalogProvider';
import {loadStorefrontConfig, shopAssetUrl} from '@/lib/shop/config';
import {ShopContext} from '@/lib/shop/context';
import type {StorefrontConfig} from '@/lib/shop/schema';
import {getCatalogMetadataUrl} from '@/lib/syncService';
import {Button} from '@/components/ui/button';
import AppVersion from '@/components/AppVersion';
import {ShopHeader} from '@/storefront/sections/ShopHeader';
import {ShopFooter} from '@/storefront/sections/ShopFooter';
import {ShopHomePage} from '@/storefront/pages/ShopHomePage';
import {ProductsPage} from '@/storefront/pages/ProductsPage';
import {ProductDetailsPage} from '@/storefront/pages/ProductDetailsPage';
import {ShopInfoPage} from '@/storefront/pages/ShopInfoPage';
import {NotFoundPage} from '@/storefront/pages/NotFoundPage';
import './storefront-base.css';
import '@/storefront/theme.css';

export default function StorefrontApp() {
  const [config, setConfig] = useState<StorefrontConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const {pathname} = useLocation();
  useEffect(() => {
    const controller = new AbortController();
    void loadStorefrontConfig(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setConfig(value);
      document.title = value.branding.name;
      document.querySelector('meta[name="description"]')?.setAttribute('content', value.branding.description);
      document.getElementById('picomart-catalog-data')?.setAttribute('href', getCatalogMetadataUrl(value.catalogSeed, value.network));
      if (value.branding.favicon) document.querySelector('link[rel="icon"]')?.setAttribute('href', shopAssetUrl(value.branding.favicon));
    }).catch(() => { if (!controller.signal.aborted) setError('This shop could not be loaded. Please try again.'); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  if (!config) return <div className="shop-root"><main className="shop-state" aria-live="polite">
    <h1>{error ? 'Shop unavailable' : 'Opening the shop…'}</h1>
    {error && <><p>{error}</p><Button onClick={() => {setError(null); setAttempt(value => value + 1);}}>Try again</Button></>}
  </main><AppVersion/></div>;
  const path = (route: string) => route;
  return <ShopContext.Provider value={{config, path}}>
    <CatalogProvider key={`${config.network}:${config.catalogSeed}`} seed={config.catalogSeed} network={config.network}>
      <div className="shop-root">
        <a className="shop-skip-link" href="#shop-main">Skip to content</a>
        <ShopHeader/>
        <main id="shop-main" tabIndex={-1}>
          <Routes>
            <Route index element={<ShopHomePage/>}/>
            <Route path="products" element={<ProductsPage/>}/>
            <Route path="collections/:collectionId" element={<ProductsPage/>}/>
            <Route path="products/:productId" element={<ProductDetailsPage/>}/>
            <Route path="about" element={<ShopInfoPage/>}/>
            <Route path="*" element={<NotFoundPage/>}/>
          </Routes>
        </main>
        <ShopFooter/>
        <AppVersion/>
      </div>
    </CatalogProvider>
  </ShopContext.Provider>;
}
