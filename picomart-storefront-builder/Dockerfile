FROM node:24.11.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev

FROM node:24.11.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node vendor ./vendor
COPY --chown=node:node src ./src
COPY --chown=node:node build-assets ./build-assets
USER node
CMD ["node", "src/main.ts"]
