<div align="center">
  <img src="public/logo-32x32.png" width="88" height="88" alt="Picomart logo" />

# Picomart Storefront Template

**Your catalog, ready to shop online.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

The online sales channel for a Picomart catalog. Customers browse a merchant storefront and open the buyer app to order and pay; printed QR codes offer an in-person path to the same catalog and checkout. Products and exact PathUSD prices come from the current catalog.

This canonical self-contained starter includes shop presentation, the protected Tempo catalog runtime, static tooling, fixtures, and browser checks. Payment and wallet interaction happen in the buyer app.

## Develop and build

Use Node.js `24.11.0` and npm `11.17.0`, as recorded in the [manifest](template/template-manifest.json).

```powershell
npm ci
npm run dev
npm run build
npm run preview
```

Routes include `/`, `/products`, `/collections/:collectionId`, `/products/:productId`, and `/about`. Development reads `public/storefront.json`; production embeds validated configuration in each revision. Branding changes require rebuilding.

For hosting under a URL path:

```powershell
npm run build -- --base=/s/my-shop/
npm run preview -- --base=/s/my-shop/
```

The host must return the revision's HTML for direct shop routes. Products refresh from the live catalog; failed refreshes display an error instead of substituting stale prices.

## Customize

- Edit [public/storefront.json](public/storefront.json) for catalog identity, branding, collections, featured products, and supplied links.
- Put merchant assets in `public/shop-assets/` and resolve them through `shopAssetUrl()`.
- Generated edits are limited to `src/storefront/pages/`, `src/storefront/sections/`, and `src/storefront/theme.css`.
- Preserve schemas, pricing, catalog identity, compact links, QR helpers, dependencies, and validation tooling.

The [generation contract](template/generation-guide.txt) defines the editing boundary. Network/catalog bindings are explicit; query parameters and browser preferences cannot override them. Maintain one starter and separate merchant revision artifacts.

## Validate and package

```powershell
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm test
```

Tests use ports `4173` and `4174`, with path-hosted production output, desktop/mobile layouts, catalog updates, exact amounts, compact QR links, and direct navigation. Set `PLAYWRIGHT_CHANNEL=msedge` on Windows for installed Edge.

Package without credentials, dependencies, output, or local state. The manifest records version and normalized lockfile hash. Template changes require refreshing the builder's archive and matching checkpoint before hosted generation.
