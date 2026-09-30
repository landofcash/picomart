<div align="center">
  <img src="../../logo.png" width="88" height="88" alt="Picomart logo" />

# Picomart Storefront Harness

**Validate shops before publication.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

Isolated tooling for template builds, generated revisions, browser acceptance, and Bunny publication checks. It uses the Tempo storefront runtime separately from the seller-facing builder.

## Local checks

```powershell
npm ci
npm run typecheck
npm test
```

Use Node.js 24.11 or later. Copy `.env.example` to `.env.local` for provider-backed checks. Keep output, state, credentials, and artifacts ignored.

## Integration commands

`sandbox:prepare`, `sandbox:build`, `sandbox:generate`, and `sandbox:cleanup` manage Railway build environments. `publish` and `hosting:select` write harness revisions to configured storage. Use isolated prefixes and explicit sandbox environments; these commands require external resources and can incur provider costs.

The [harness resolver](resolver/README.md) serves harness publications. Merchant publication uses the [builder](../../picomart-storefront-builder/README.md)'s journal and public listener.

The [template](../../picomart-storefront-template/README.md) includes protected catalog runtime, compact links, and generation instructions. Provider checks validate configured deployments independently of local tests.
