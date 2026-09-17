<div align="center">
  <img src="public/logo-192x192.png" width="88" height="88" alt="Picomart logo" />

# Picomart Buyer

**Shop online or scan in person. Pay from your phone.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

Open checkout from a seller's online storefront or scan a printed catalog/product QR code. Collect products in a local cart, review delivery details, and pay in PathUSD through Tempo escrow. Both paths use the same buyer app. The built-in wallet supports creation, import, password protection, locking, and backup. Order and delivery messages use zkbytes encryption.

## Develop

Use Node.js 24.11 or later.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev -- --port 5173
```

Set `VITE_TEMPO_COMMERCE_ENABLED=true`, `VITE_PICOMART_SYNC_ORIGIN=http://localhost:3000`, and your public `VITE_ZKBYTES_API_ORIGIN` and `VITE_ZKBYTES_DOWNLOAD_ORIGIN`. Start Sync separately. Restart Vite after changes; rebuild hosted output when build-time values change.

## Buyer flow

- `/` opens home or the catalog/product selected by a compact QR fragment.
- `/scan` reads QR codes; `/cart` saves selections locally for later checkout.
- `/order` reviews the order; `/pay-crypto` approves payment.
- `/orders` shows history, delivery updates, confirmation, and refund actions.
- `/wallet` manages the wallet; `/settings` contains network selection.
- `/tempo-wallet` and `/tempo-contract` provide diagnostics.
- `/agent-orders/approve` reviews an agent-prepared order before payment.

Catalog fragments are 23 characters; product fragments are 45. Wallet changes preserve the cart; checkout validates wallet, token, and deployment. Agent approval also requires `VITE_PICOMART_X402_ORIGIN` and a matching public `VITE_PICOMART_QUOTE_PUBLIC_KEYS` keyring.

## Check and serve

```powershell
npm test -- --run
npm run build
npm run preview
```

`npm run lint` runs ESLint; `npm start` serves production output. Include the vendored protocol archive for independent installation. Browser values are public: private keys and storage credentials belong in backend services.

See the [project overview](../README.md) for local service setup.
