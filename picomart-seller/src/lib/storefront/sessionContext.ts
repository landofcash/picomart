import {createContext, useContext} from 'react';
import type {BuilderClient} from './client';
export const StorefrontSessionContext = createContext<{client: BuilderClient; signOut: () => void} | null>(null);
export function useStorefrontSession() {
  const value = useContext(StorefrontSessionContext);
  if (!value) throw new Error('Storefront session is required');
  return value;
}
