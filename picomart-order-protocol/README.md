<div align="center">
  <img src="../picomart-seller/public/logo-192x192.png" width="88" height="88" alt="Picomart logo" />

# @picomart/order-protocol

**One protocol across browser apps and services.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

Shared Tempo configuration, compact QR links, encrypted message-reference schemas, generated contract ABI, and signed agent-order handoffs. Consumers install a local vendored archive for reproducible independent builds.

## Entry points

| Import | Purpose |
| --- | --- |
| `@picomart/order-protocol/tempo` | Chain/token metadata, chain checks, and compact links. |
| `@picomart/order-protocol/tempo-protocol` | Receiving identities, canonical envelopes, and commitments. |
| `@picomart/order-protocol/tempo-contract` | Generated ABI, order-state values, and compiler/build metadata. |
| `@picomart/order-protocol/tempo-agent` | Quote schemas, signatures, and payment-evidence handoff. |

```ts
import { TEMPO_TOKENS, compactCatalogLink } from '@picomart/order-protocol/tempo';

const paymentToken = TEMPO_TOKENS.pathUSD;
// catalogSeed and productId are canonical 22-character identifiers.
const buyerUrl = compactCatalogLink(catalogSeed, productId, buyerOrigin);
```

PathUSD is the configured payment/fee token. AlphaUSD metadata does not grant checkout support. Both tokens have six decimals; presentation icon IDs `0` and `1` map to their images.

Compact fragments carry a catalog identifier, optional product identifier, and profile digit. The configured profile is `2`; unknown profiles are rejected. Receiving public keys are 32 bytes; schemas define the canonical message and recipient-envelope formats.

The base configuration's `deployment` field remains unset. Apps and services pin their own configured deployment and verify it against the shared chain and build metadata.

## Build and distribute

```powershell
npm ci
npm run build
npm test
npm run verify:tempo
```

Use Node.js 24.11 or later for repository development. `verify:tempo` performs read-only chain/token RPC checks and needs no private key. Tempo entry points provide ESM and CommonJS builds.

After source or ABI changes, run `node tools/prepare-order-protocol.mjs` from the repository root. It builds, packs, and distributes the same archive to consumer `vendor/` directories, updating dependencies and lockfiles. Registry publication is separate from local distribution.
