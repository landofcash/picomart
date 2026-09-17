<div align="center">
  <img src="../picomart-seller/public/logo-192x192.png" width="88" height="88" alt="Picomart logo" />

# Picomart Quote Service

**Signed order terms and verified Tempo payment evidence.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

The HTTP service for the `picomart-order` agent handoff. It resolves current catalog products, prices PathUSD orders, signs quote commitments with Ed25519, and verifies purchase evidence against the configured Tempo contract. Quotes certify the service's terms; the contract does not enforce catalog prices.

## Local setup

```powershell
npm ci
Copy-Item .env.example .env.local
npm run generate-quote-key
npm run build
npm test
npm start
```

Use Node.js 24.11 or later. Save generated signing material in server secrets, separately from all wallet keys. `npm run dev` runs source with `.env.local`.

Required values are `PICOMART_SYNC_ORIGIN`, `PICOMART_RESOURCE_ORIGIN`, `PICOMART_CATALOG_ORIGINS`, `PICOMART_QUOTE_SIGNING_KID`, `PICOMART_QUOTE_SIGNING_KEY_PKCS8`, and `PICOMART_QUOTE_PUBLIC_KEY`.

| Setting | Purpose |
| --- | --- |
| `PORT` | Defaults to `3402`. |
| `PICOMART_TEMPO_RPC_URL` | Tempo RPC for payment-evidence checks. |
| `PICOMART_REDIS_URL` | `memory://` locally; private Redis required in production. |
| `PICOMART_CORS_ORIGINS` | Exact allowed browser origins. |
| `PICOMART_QUOTE_PUBLIC_KEYS` | Additional trusted keys for rotation/recovery. |
| `PICOMART_RECOVERY_SECONDS` | Recovery window; defaults to `86400`. |
| `PICOMART_SYNC_RETRY_SECONDS` | Evidence retry delay; defaults to `5`. |

Use bare HTTPS origins, with HTTP localhost/127.0.0.1 allowed locally. Install the public keyring in MCP and the buyer app.

## API

- `GET /healthz` checks service/storage health.
- `POST /api/v2/moderato/order-quotes` returns HTTP 402 signed payment requirements.
- `POST /api/v2/moderato/order-quotes/resolve` resolves the handoff.
- `POST /api/v2/moderato/orders/:orderSeed/confirm` verifies purchase evidence.

Quotes expire after ten minutes. Reusing a seed with different inputs conflicts. Receipt confirmation and indexing may finish at different times; retry according to the returned status.

Quote requests describe product selections and delivery requirements. Buyer-side zkbytes encryption handles private order messages. This service does not sign wallet payments. Keep recovery data, signing secrets, and credentials private.

Include the vendored protocol archive in independent builds. See [MCP setup](../picomart-mcp/README.md).
