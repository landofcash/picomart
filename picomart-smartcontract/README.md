<div align="center">
  <img src="../logo.png" width="88" height="88" alt="Picomart logo" />

# Picomart Escrow

**Catalogs, payments, and settlement on Tempo.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

The `Picomart` Solidity contract registers catalogs and holds PathUSD payments through fulfillment and settlement. It records public keys, identity IDs, and message-reference commitments. Plaintext delivery details remain outside the contract.

## Build and validate

```powershell
npm ci
npm run compile
npm test
npm run check:tempo-abi
```

Solidity `0.8.37` is pinned with the Osaka EVM target, optimizer runs `200`, and `viaIR=true`. `npm run export:tempo` regenerates shared ABI/build metadata; repack the protocol after export changes.

## Lifecycle

Catalogs can be created, updated, or deleted. Orders can be created unpaid/paid, paid later, canceled, moved to delivery, confirmed, or submitted for refund resolution. The owner resolves refunds and manages allowed payment tokens.

Each decision stage lasts five days, with a maximum lifecycle horizon of twenty days. Message retention targets thirty days, subject to storage limits. Timeout resolution requires a contract call: unpaid orders cancel, unfulfilled payments refund the payer, unconfirmed deliveries settle to the seller, and unresolved refund requests refund the payer.

## Configured deployment

| Setting | Value |
| --- | --- |
| Chain ID | `42431` |
| Contract | `0x3c91183f0454eAB6eFf6F570AC402bE278Dbd6f4` |
| Deployment block | `37694566` |
| PathUSD | `0x20C0000000000000000000000000000000000000` |

These are recorded configuration values, not a fresh RPC verification.

Store the deployer `PRIVATE_KEY` and separate public `TEMPO_ADMIN_ADDRESS` in the ignored `.env`. The administrator's private key is not needed by deployment. Fund the deployer's PathUSD fee balance.

`npm run preflight:tempo` checks chain, token metadata, build hashes, admin, and funding without submitting a transaction. The existing `deploy:testnet` script deploys to the configured Tempo network only with `TEMPO_DEPLOY_ENABLED=1`. Inspect transaction/manifest records under `deployments/` before retrying an uncertain result.

The browser `/tempo-contract` route provides method-level diagnostics. See the [shared protocol](../picomart-order-protocol/README.md) for ABI distribution.
