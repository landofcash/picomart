import {createContext, useContext} from 'react';
import type {createCatalogStore} from './store';

export const CatalogContext = createContext<ReturnType<typeof createCatalogStore> | null>(null);
export function useCatalogStore() {
  const store = useContext(CatalogContext);
  if (!store) throw new Error('Catalog provider is missing');
  return store;
}
