import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createContext } from "./context.js";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const ctx = createContext(config, logger);

  const app = await buildApp(ctx);

  try {
    const address = await app.listen({ port: config.PORT, host: config.HOST });
    logger.info({ address }, "Server started");
  } catch (err) {
    logger.fatal({ err }, "Server failed to start");
    process.exit(1);
  }
}

main();
