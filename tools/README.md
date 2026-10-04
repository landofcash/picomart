# Development tools

These tools support local protocol packaging, storefront generation, and Tempo UI regression checks.

- `prepare-order-protocol.mjs` builds the shared protocol and refreshes its vendored package in every app that depends on it. Run `node tools/prepare-order-protocol.mjs --list-consumers` to inspect the consumers without changing files. Use `--offline` when all dependencies are already cached.
- `storefront-harness/` contains the storefront generation and acceptance workflow. See its [README](storefront-harness/README.md) for setup. Its local `npm run typecheck` and `npm test` do not require cloud credentials.
- `verify-tempo-compact-links.mjs` checks compact QR links, cart persistence, wallet dialogs, settings, and layouts against isolated buyer and seller Vite servers.
- `verify-tempo-catalog-unlock.mjs` checks catalog publication and signing with a locked wallet, including cancellation and wallet changes.

Install the buyer, seller, and storefront template dependencies before running the browser checks. Install Chromium with `npx playwright install chromium` from `picomart-storefront-template`, or set `PLAYWRIGHT_CHANNEL` to an installed browser channel such as `msedge`.

Start separate Vite servers from the buyer and seller folders using `npm run dev -- --host 127.0.0.1 --port 5186 --strictPort` and `npm run dev -- --host 127.0.0.1 --port 5187 --strictPort`, respectively. From the repository root, run:

```sh
node tools/verify-tempo-compact-links.mjs
node tools/verify-tempo-catalog-unlock.mjs
```

Optional positional arguments override the buyer and seller origins for the compact-link check, or the seller origin for the unlock check. Wallets, catalog storage, and contract writes are mocked. These checks do not submit transactions or upload catalogs. Screenshots are saved under the ignored `output/playwright/ui-restoration/` folder.

Deployment configuration and deployment checks are maintained as a separate commit batch.
