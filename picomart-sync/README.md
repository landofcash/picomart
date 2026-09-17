<div align="center">
  <img src="../picomart-seller/public/logo-192x192.png" width="88" height="88" alt="Picomart logo" />

# Picomart Sync

**Tempo events, catalog resolution, and storage uploads.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

Sync indexes the configured Tempo contract from its deployment block and projects catalogs, orders, and message references into queryable responses. It also accepts wallet-signed catalog/image uploads to Bunny Storage.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Use Node.js 24.11 or later. The default port is `3000`. Chain, contract, and deployment-block checks live in `src/tempoSync.ts`. Startup uses the Tempo indexer; RPC connectivity is required for current chain data.

## API

Commerce routes use `/api/v1/moderato`, including catalog, wallet, order, and message queries. Catalog lookup by seed supplies the registered seller identity and catalog URL. Storage uploads use `/api/cdn`; `/api/cdn/status` reports upload enablement and configuration readiness.

Transaction confirmation and indexed history are separate evidence: a confirmed transaction may appear in Sync later. The service rebuilds projections from contract events.

## Enable catalog publication

Configure server-side values in `.env`:

| Variable | Purpose |
| --- | --- |
| `BUNNY_UPLOAD_ENABLED` | Set `true` to accept uploads. |
| `BUNNY_STORAGE_ZONE` | Catalog/image storage zone. |
| `BUNNY_STORAGE_ACCESS_KEY` | Storage-zone access password. |
| `BUNNY_STORAGE_ENDPOINT` | Correct regional storage endpoint. |
| `BUNNY_PUBLIC_BASE_URL` | Public CDN origin for uploaded content. |
| `CATALOG_UPLOAD_ORIGINS` | Exact seller browser origins allowed to upload. |

The default allowlist includes `http://localhost:5174`. Requests authenticate signed upload data; the seller app verifies public CDN bytes. Configuration readiness alone does not prove storage connectivity.

## Checks and production

```powershell
npm run build
npm test
npm start
```

`npm run verify:tempo-sync` runs configured verification and requires relevant RPC/API access. Preserve service data across restarts and include the vendored protocol archive in independent deployments. This service needs no deployer or admin private key.
