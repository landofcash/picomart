<div align="center">
  <img src="../logo.png" width="88" height="88" alt="Picomart logo" />

# Picomart Seller

**One catalog. Online and offline sales.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

Create your catalog, share an online storefront, and print QR codes for products, counters, flyers, or events. Manage orders from both sales channels in the seller portal. Tempo escrow secures payments; zkbytes encryption protects private order and delivery messages. A compact wallet popup keeps account management close to the current screen.

## Develop

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev -- --port 5174
```

Use Node.js 24.11 or later. Set `VITE_TEMPO_COMMERCE_ENABLED=true`, `VITE_PICOMART_SYNC_ORIGIN=http://localhost:3000`, and your public zkbytes API/download origins. Start Sync and configure its Bunny uploads for catalog publication. Port `5174` is in Sync's default upload-origin allowlist.

## Merchant flow

1. Create/import a built-in wallet and retain a recovery backup.
2. Add products with PathUSD prices and images.
3. Publish catalog files, then sign the catalog registration on Tempo.
4. Publish and share a storefront for online sales, or print compact catalog/product QR codes for in-person sales. Use both with the same catalog.
5. Decrypt incoming orders, post delivery updates/refusals, and follow settlement.

Locked wallets open the unlock dialog when a signature is needed. Backup, protection, locking, addresses, and balances are available in the popup; the header button shows the address. Network selection lives in Settings.

Storefront management uses `VITE_STOREFRONT_BUILDER_ORIGIN` for a configured builder. `/tempo-wallet` and `/tempo-contract` are separate diagnostics.

## Check and serve

```powershell
npm test -- --run
npm run build
npm run preview
```

`npm run lint` runs ESLint; `npm start` serves production output. Include the vendored protocol archive for independent installation. Storage and deployment secrets belong in backend services.

See the [overview](../README.md) and [Sync setup](../picomart-sync/README.md).
