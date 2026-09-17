<div align="center">
  <img src="../../../picomart-seller/public/logo-192x192.png" width="88" height="88" alt="Picomart logo" />

# Picomart Storefront Resolver

**Read-only delivery of validated shop revisions.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

A read-only resolver for harness revisions in Bunny Storage under the fixed `phase2/shops` convention. This validation utility is separate from the builder's production journal and listener.

## Routes and integrity

Shops use `/s/:shopId/`, with product, collection, and about routes. The resolver accepts GET/HEAD and exposes `/healthz`. Unknown assets return not found instead of storefront HTML.

Revision metadata comes from authenticated primary storage. CDN files are checked against recorded size and SHA256 hash. HTML/configuration use `no-store`; immutable assets use long-lived caching. Changed bytes require a new filename.

## Configure and run

Set `BUNNY_PUBLIC_STORAGE_ENDPOINT`, `BUNNY_PUBLIC_STORAGE_ZONE`, `BUNNY_PUBLIC_STORAGE_KEY`, `BUNNY_PUBLIC_BASE_URL`, and `PORT`. Prefer a read-only public-zone credential. This service needs no wallet, model, private-zone, or sandbox credentials and makes no storage writes.

```powershell
npm ci
npm start
```

Run the parent [harness](../README.md) checks before deployment. The bundle contains this package and its Docker/Railway configuration.
