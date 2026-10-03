import {createContext, useContext} from 'react';
import type {StorefrontConfig} from './schema';

export const ShopContext = createContext<{config: StorefrontConfig; path: (route: string) => string} | null>(null);
export function useShop() {
  const shop = useContext(ShopContext);
  if (!shop) throw new Error('Shop provider is missing');
  return shop;
}
