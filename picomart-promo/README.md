<div align="center">
  <img src="../logo.png" width="88" height="88" alt="Picomart logo" />

# Picomart Catalog

**Bring your catalog to counters, products, and events.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

Browse and share a catalog with flipbook/swipe layouts, product details, and compact buyer-app QR links. Print QR codes for products, counters, flyers, or events so customers can scan and order in person. For online sales, sellers can publish a dedicated merchant storefront from the same catalog. This app reads Tempo registrations through Sync and opens the buyer app for wallet, cart, and checkout.

## Develop

```powershell
npm ci
npm run dev
```

Use Node.js 24.11 or later. The first URL path segment selects the catalog seed, with `?seed=` as an alternative. Without a seed, the app uses its configured fixture. API, buyer origin, CDN, and network values live in `src/config.ts`.

Discovery uses `/api/v1/moderato/catalogs/seed/:catalogSeed`. Prices use six-decimal PathUSD. Printed product links retain 45-character fragments; catalog-only fragments are 23 characters. Checkout belongs to the buyer app.

`/setup-codex.html` explains source-based MCP setup. Generated merchant shops use the separate [storefront template](../picomart-storefront-template/README.md).

## Validate and serve

```powershell
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm test
```

Browser tests use port `4175`. Set `PLAYWRIGHT_CHANNEL=msedge` on Windows for installed Edge. `npm start` serves production output. Browser artifacts belong in ignored `output/playwright/`.
