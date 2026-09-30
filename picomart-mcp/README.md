<div align="center">
  <img src="../logo.png" width="88" height="88" alt="Picomart logo" />

# Picomart MCP

**Let an agent prepare the order. Keep payment with the buyer.**

![Tempo](https://img.shields.io/badge/Blockchain-Tempo-111827?style=flat-square)
![PathUSD](https://img.shields.io/badge/Payments-PathUSD-047857?style=flat-square)

</div>

A local stdio MCP server for Tempo order preparation and status. It requests a signed quote and returns a browser approval link. The buyer reviews and signs payment with the built-in wallet; MCP never receives wallet signing keys.

## Build and connect

```powershell
npm ci
Copy-Item .env.example .env.local
npm run build
npm test
npm start
```

Use Node.js 24.11 or later. Register `node` plus the absolute path to `dist/server.js` in your MCP client. Supply environment values through the client, or use the package start script with `.env.local`.

| Variable | Purpose |
| --- | --- |
| `PICOMART_X402_ORIGIN` | Quote service origin. |
| `PICOMART_SYNC_ORIGIN` | Sync origin for order evidence. |
| `PICOMART_FRONTEND_ORIGIN` | Buyer origin for approval links. |
| `PICOMART_QUOTE_PUBLIC_KEYS` | JSON map of key IDs to public base64url Ed25519 keys. |
| `PICOMART_MCP_DATA_DIR` | Optional recovery-data directory. |

Origins must be bare HTTPS origins; HTTP localhost/127.0.0.1 are allowed locally. The example uses ports `3402`, `3000`, and `5173`. Configure matching public keys in MCP and the buyer app.

## Tools and privacy

- `create_picomart_order` prepares product selections, a signed quote, and buyer approval.
- `get_picomart_order_status` reconciles the order against Sync evidence.

Recovery files use a network-specific `tempo-moderato-v2` subdirectory. Keep recovery data and approval fragments private. The agent sees delivery details supplied to it; buyer-side encryption protects the order messages stored through zkbytes.

Install from project source with the vendored protocol archive. Hosted availability and registry publication are separate deployment choices. See the [quote service](../picomart-x402-server/README.md) and [buyer app](../picomart-frontend/README.md).
