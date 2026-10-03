import {useEffect, useMemo, type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import type {NetworkId} from '@/context/wallet/types';
import {CatalogContext} from './context';
import {CATALOG_STALE_MS, createCatalogStore} from './store';

export function CatalogProvider({seed, network, children}: {seed: string; network: NetworkId; children: ReactNode}) {
  const store = useMemo(() => createCatalogStore(seed, network), [seed, network]);
  const {pathname} = useLocation();
  useEffect(() => { void store.refresh(); }, [store, pathname]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void store.refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, CATALOG_STALE_MS);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [store]);
  return <CatalogContext.Provider value={store}>{children}</CatalogContext.Provider>;
}
