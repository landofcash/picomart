import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {Plugin, HtmlTagDescriptor} from 'vite';
import {StorefrontConfigSchema} from '../src/lib/shop/schema';
import {getConfig} from '../src/config';

/** Compile public settings into the initial HTML of a dedicated shop build. */
export function storefrontPlugin(enabled: boolean): Plugin {
  let base = '/';
  let configPath = '';
  return {
    name: 'picomart-storefront',
    configResolved(config) { base = config.base; configPath = path.join(config.publicDir, 'storefront.json'); },
    configureServer(server) {
      server.watcher.add(configPath);
      server.watcher.on('change', file => {
        if (file === configPath) server.ws.send({type: 'full-reload'});
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!enabled) return;
        const shop = StorefrontConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
        const escape = (text: string) => text.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]!));
        const metadataUrl = `${getConfig(shop.network).apiUrl}/catalogs/${encodeURIComponent(shop.catalogSeed)}`;
        const favicon = shop.branding.favicon || 'logo-32x32.png';
        const tags: HtmlTagDescriptor[] = [
          {tag: 'meta', attrs: {name: 'description', content: shop.branding.description}},
          {tag: 'meta', attrs: {property: 'og:title', content: shop.branding.name}},
          {tag: 'meta', attrs: {property: 'og:description', content: shop.branding.description}},
          {tag: 'meta', attrs: {property: 'og:type', content: 'website'}},
          {tag: 'meta', attrs: {name: 'twitter:card', content: shop.branding.shareImage ? 'summary_large_image' : 'summary'}},
          {tag: 'link', attrs: {rel: 'icon', href: favicon.startsWith('https://') ? favicon : base + favicon}},
          {tag: 'link', attrs: {id: 'picomart-catalog-data', rel: 'alternate', type: 'application/json', title: `${shop.branding.name} catalog`, href: metadataUrl}},
          {tag: 'script', attrs: {id: 'picomart-storefront-config', type: 'application/json'}, children: JSON.stringify(shop).replace(/</g, '\\u003c')},
        ];
        if (shop.branding.shareImage) tags.push({tag: 'meta', attrs: {property: 'og:image', content: shop.branding.shareImage}});
        return {
          html: html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(shop.branding.name)}</title>`)
            .replace(/<meta\s+name="(?:description|keywords)"[\s\S]*?\/>/g, '')
            .replace(/<link\s[^>]*rel="(?:icon|apple-touch-icon)"[^>]*\/>/g, '')
            .replace(/<link\s+id="picomart-catalog-data"[\s\S]*?\/>/, ''),
          // Keep charset before potentially long merchant metadata/configuration.
          tags: tags.map(tag => ({...tag, injectTo: 'head'})),
        };
      },
    },
  };
}
