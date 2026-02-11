import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppContext } from "./context.js";
import {
  healthRoutes,
  strategyRoutes,
  poolRoutes,
  agentRoutes,
  validationRoutes,
  snapshotRoutes,
} from "./routes/index.js";

export async function buildApp(ctx: AppContext) {
  const app = Fastify({
    logger: false, // We use our own pino logger
  });

  // CORS
  await app.register(cors, { origin: true });

  // API key auth hook (optional — skipped if no keys configured)
  const apiKeys = ctx.config.API_KEYS
    ? new Set(ctx.config.API_KEYS.split(",").map((k) => k.trim()).filter(Boolean))
    : null;

  if (apiKeys && apiKeys.size > 0) {
    app.addHook("onRequest", async (req, reply) => {
      // Skip auth for health endpoint
      if (req.url === "/api/v1/health") return;

      const key = req.headers["x-api-key"];
      if (!key || !apiKeys.has(key as string)) {
        return reply.code(401).send({ error: "unauthorized", message: "Invalid or missing API key" });
      }
    });
  }

  // Register all routes
  await healthRoutes(app, ctx);
  await strategyRoutes(app, ctx);
  await poolRoutes(app, ctx);
  await agentRoutes(app, ctx);
  await validationRoutes(app, ctx);
  await snapshotRoutes(app, ctx);

  return app;
}
