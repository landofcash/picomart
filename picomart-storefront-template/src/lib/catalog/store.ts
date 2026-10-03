import type {NetworkId} from '@/context/wallet/types';
import {loadCatalog, type LoadedCatalog} from './load';

export const CATALOG_STALE_MS = 60_000;
export type CatalogState = {data: LoadedCatalog | null; loading: boolean; error: string | null};

/** One instance per mounted shop identity; shared by every section through context. */
export function createCatalogStore(seed: string, network: NetworkId) {
  let state: CatalogState = {data: null, loading: true, error: null};
  let updatedAt = 0;
  let active: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: CatalogState) => { state = next; listeners.forEach(listener => listener()); };

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    refresh(force = false) {
      if (active) return active;
      if (!force && Date.now() - updatedAt < CATALOG_STALE_MS) return Promise.resolve();
      publish({...state, loading: true, error: null});
      active = loadCatalog(seed, network, AbortSignal.timeout(20_000))
        .then(data => { updatedAt = Date.now(); publish({data, loading: false, error: null}); })
        .catch((error: unknown) => {
          // Do not present stale product prices as current after a failed refresh.
          publish({data: null, loading: false, error: error instanceof Error ? error.message : 'Catalog could not be loaded'});
        })
        .finally(() => { active = null; });
      return active;
    },
  };
}
