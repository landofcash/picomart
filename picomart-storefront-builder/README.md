<div align="center">
  <img src="../picomart-seller/public/logo-192x192.png" width="88" height="88" alt="Picomart logo" />

# Picomart Storefront Builder

**Turn your catalog into an online storefront.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

Build an online storefront from the same Picomart catalog used by printed QR codes. Customers browse the shop and open the buyer app for checkout; sellers manage both online and in-person orders in one portal.

This service provides authenticated storefront configuration, generation, private previews, publication, and rollback. Tempo signatures authenticate sellers; catalog registrations establish ownership. Durable records and artifacts live in private Bunny Storage.

## Local setup

Use Node.js 24.11 or later. Configure storage and allowed seller origins in `.env.local`.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run contracts:check
npm run seller-contracts:check
npm run build-assets:check -- --local
npm run dev
```

| Listener | Default |
| --- | --- |
| Management API | `http://127.0.0.1:4180` |
| Private previews | `http://127.0.0.1:4181` |
| Public storefronts | `http://127.0.0.1:4184` |

Generated content uses separate listeners from the management API. Set exact seller origins in `BUILDER_ORIGINS`. Health becomes ready after journal recovery.

## Authentication and management

Routes use `/api/v1/moderato`. Request a challenge for the seller's EVM address, verify the account/network/origin, sign it with the built-in wallet, and exchange it for a bearer token. Challenges are single-use. Tokens stay in client memory; only token hashes persist.

Shop routes create/list shops, update configuration with an expected version, queue/cancel jobs, list revisions, create preview URLs, and publish/roll back completed revisions. Resources are owner-scoped. Catalog ownership is checked through Sync and the configured Tempo deployment.

Mutations require a UUID `Idempotency-Key`. Retry an uncertain operation with the same key and identical body. Private source, prompts, logs, and provider output are not exposed by the management API.

## Storage and generation

Configure separate private/public Bunny zones through `BUNNY_PRIVATE_*` and `BUNNY_PUBLIC_*`. The private journal rebuilds metadata and idempotency receipts on startup. One coordinator owns each prefix; `BUILDER_COORDINATOR_COUNT=1` is not a distributed lock. Hosted coordinators need persistent deployment storage and non-overlapping replacement.

Generation is disabled by default. Enable `BUILDER_WORKER_ENABLED` only after preparing a matching Railway sandbox checkpoint, model settings, and scoped credentials. `RAILWAY_SANDBOX_ENVIRONMENT_ID` is independent of the management service's hosting environment. Use `npm start` rather than a watcher with generation enabled.

Completed revisions commit after artifact uploads. Generation never changes publication automatically. Publication/rollback are separate operations. An uncertain journal write requires recovery and retry with the original idempotency key.

## Validate

```powershell
npm run typecheck
npm test
npm run contracts:check
npm run seller-contracts:check
npm run build-assets:check -- --local
```

Without `--local`, the asset check also requires a recorded checkpoint. `storage:smoke` and `worker:smoke` are configured integration checks that can write to external services. Template changes require updating the local source digest, archive, and any enabled checkpoint together.

See the [template](../picomart-storefront-template/README.md) and [harness](../tools/storefront-harness/README.md).
