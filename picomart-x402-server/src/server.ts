import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { InMemoryQuoteStore, RedisQuoteStore } from "./quoteStore.js";

const config = loadConfig();
const store = config.redisUrl === "memory://" ? new InMemoryQuoteStore(config.now) : await RedisQuoteStore.connect(config.redisUrl);
const app = await createApp({ config, store });
const server = app.listen(config.port, () => console.log(`Picomart x402 server listening on ${config.port}`));

async function shutdown() {
  server.close();
  await store.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
