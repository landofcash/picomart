FROM node:24.11.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
USER node
CMD ["node", "src/main.ts"]
