import {useSyncExternalStore} from 'react';
import {useCatalogStore} from './context';

export function useCatalog() {
  const store = useCatalogStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return {...state, products: state.data?.products ?? [], refresh: () => store.refresh(true)};
}
