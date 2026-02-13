import IORedis from "ioredis";
import { loadWorkerConfig } from "./config.js";
import { createWorkerLogger } from "./logger.js";
import { WorkerOrchestrator } from "./worker.js";
import { EventListener } from "./event-listener.js";

async function main() {
  const config = loadWorkerConfig();
  const logger = createWorkerLogger(config.LOG_LEVEL);

  const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
  });

  const orchestrator = new WorkerOrchestrator({
    config,
    logger,
    connection,
  });

  const eventListener = new EventListener({
    config,
    logger,
    connection,
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    await eventListener.stop();
    await orchestrator.stop();
    connection.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await orchestrator.start();
  await eventListener.start();

  logger.info("Worker and event listener running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
