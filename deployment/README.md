# Picomart deployment

Railway project: [picomart.zkbytes.com](https://railway.com/project/83922d85-60c2-4870-af61-ba680bec9290). The hosted services use the `production` environment. Blockchain network selection is separate from this environment.

The buyer, seller, promo, sync, x402, and private Redis services deploy from `landofcash/picomart`, branch `main`. Each service has its own source directory and watch paths. Wait for CI is enabled on all six connected services so that `Validate Picomart` must pass before deploying a push.

`services.json` records the public deployment targets and expected service settings. Credentials live in Railway variables and ignored local environment files. Frontend `VITE_*` settings are public build-time values and require a rebuild after changes. The apps use their vendored order-protocol archive; rebuild and commit those archives when updating the shared package.

After connecting the core services to GitHub, run `node deployment/enable-autodeploy-ci.mjs` to inspect their triggers. Run it with `--apply` to enable Wait for CI on the matching `main` triggers. This requires an authenticated Railway CLI and deliberately excludes the inactive storefront builder.

The sync service uses Bunny catalog storage. The x402 service uses a separate Ed25519 quote-signing key and private Redis with a persistent `/data` volume. Neither service receives deployer or administrator wallet keys. Redis has no public domain or TCP proxy.

The storefront builder is prepared but inactive until its private/public Bunny zones, model credentials, sandbox token, and checkpoint are configured. Its coordinator requires a `/coordinator` volume and one replica. Generated previews and published shops use separate domains and ports. Set the GitHub repository variable `STOREFRONT_DEPLOY_ENABLED=true` only after configuring the `Picomart / Storefronts / production` GitHub environment and its scoped `RAILWAY_TOKEN`. The builder deploys through its checkpoint preparation workflow; do not enable a second deployment trigger for it.

MCP uses a local stdio transport and is installed in the agent client; it is not a hosted Railway service. The storefront template is a build input, not a standalone hosted service.

Service settings are configured through the Railway API. New Railway services no longer accept `railway.toml`; the current repository does not rely on it. DNS records and unfinished manual setup are recorded in the ignored local deployment checklist.
