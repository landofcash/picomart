FROM node:24.11.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci
COPY . .
ARG VITE_TEMPO_COMMERCE_ENABLED=false
ARG VITE_PICOMART_SYNC_ORIGIN=https://sync.picomart.zkbytes.com
ARG VITE_ZKBYTES_API_ORIGIN
ARG VITE_ZKBYTES_DOWNLOAD_ORIGIN
ARG VITE_PICOMART_X402_ORIGIN=https://x402.picomart.zkbytes.com
ARG VITE_PICOMART_QUOTE_PUBLIC_KEYS={}
RUN npm run build

FROM node:24.11.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node scripts/serve.mjs ./scripts/serve.mjs
USER node
CMD ["node", "scripts/serve.mjs"]
