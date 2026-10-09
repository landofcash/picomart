import {useEffect} from 'react';
import {Route, Routes, useLocation} from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import AboutPage from '@/pages/AboutPage';
import {APP_NAME, APP_VERSION, DEFAULT_CATALOG_SEED} from '@/config';
import {getCatalogMetadataUrl} from '@/lib/syncService';
import './promo.css';

export default function PromoApp() {
  const location = useLocation();
  useEffect(() => {
    const disclosure = document.getElementById('picomart-ai-ordering');
    const link = document.getElementById('picomart-catalog-data-link');
    const descriptor = document.getElementById('picomart-catalog-data');
    const params = new URLSearchParams(location.search);
    const pathSegment = location.pathname.split('/').filter(Boolean)[0];
    let seed = pathSegment || params.get('seed') || DEFAULT_CATALOG_SEED;
    try { seed = decodeURIComponent(seed); } catch { /* Preserve malformed input for the catalog error. */ }
    const unavailable = pathSegment === 'about' || (params.get('network') || params.get('n')) === 'mainnet';
    if (disclosure) disclosure.hidden = pathSegment === 'about';
    if (unavailable) { link?.removeAttribute('href'); descriptor?.removeAttribute('href'); }
    else {
      const url = getCatalogMetadataUrl(seed, 'moderato');
      link?.setAttribute('href', url); descriptor?.setAttribute('href', url);
    }
    if (link) link.textContent = unavailable ? 'Product data is unavailable' : 'Product data (JSON)';
    document.title = 'Picomart Promo Catalogue';
    return () => { if (disclosure) disclosure.hidden = true; };
  }, [location]);
  return <div className="promo-root min-h-screen flex flex-col"><div className="w-full flex-1"><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/about" element={<AboutPage/>}/>
    <Route path="/:seed" element={<HomePage/>}/>
    <Route path="*" element={<div className="p-12"><h1>Page not found</h1><a href={import.meta.env.BASE_URL}>Back to the catalog</a></div>}/>
  </Routes></div><footer className="px-4 py-2 text-center text-[10px] leading-4 text-muted-foreground print:hidden">
    {APP_NAME} Catalogs · v{APP_VERSION}
  </footer></div>;
}
