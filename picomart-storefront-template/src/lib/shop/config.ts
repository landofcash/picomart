import {StorefrontConfigSchema, type StorefrontConfig} from './schema';

export function shopAssetUrl(asset: string): string {
  return asset.startsWith('https://') ? asset : `${import.meta.env.BASE_URL}${asset}`;
}

export async function loadStorefrontConfig(signal?: AbortSignal): Promise<StorefrontConfig> {
  // Dedicated builds pin public configuration to the same HTML/revision as the assets.
  const embedded = document.getElementById('picomart-storefront-config');
  if (embedded) return StorefrontConfigSchema.parse(JSON.parse(embedded.textContent || 'null'));
  const response = await fetch(`${import.meta.env.BASE_URL}storefront.json`, {signal, cache: 'no-cache'});
  if (!response.ok) throw new Error('Shop configuration is unavailable.');
  return StorefrontConfigSchema.parse(await response.json());
}
