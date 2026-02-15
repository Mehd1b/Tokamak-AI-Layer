import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { AppContext } from "./context.js";
import { healthRoutes } from "./routes/health.js";
import { tradeRoutes } from "./routes/trade.js";
import { strategyRoutes } from "./routes/strategy.js";
import { agentRoutes } from "./routes/agent.js";
import { authRoutes } from "./routes/auth.js";
import { a2aRoutes } from "./routes/a2a.js";
import { positionRoutes } from "./routes/positions.js";
import { lendingRoutes } from "./routes/lending.js";

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use our own pino logger
  });

  // CORS
  await app.register(cors, { origin: true });

  // Rate limiting: 100 req/min
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (req) => {
      const apiKey = req.headers["x-api-key"];
      if (typeof apiKey === "string") return apiKey;
      return req.ip;
    },
  });

  // Optional API key auth
  if (ctx.config.apiKeys.size > 0) {
    app.addHook("onRequest", async (req, reply) => {
      // Skip health check and A2A agent card discovery
      if (req.url === "/health" || (req.method === "GET" && req.url === "/api/agents/trader")) return;

      const key = req.headers["x-api-key"];
      if (typeof key !== "string" || !ctx.config.apiKeys.has(key)) {
        reply.code(401).send({ error: "Unauthorized", message: "Invalid API key" });
      }
    });
  }

  // Register routes
  await healthRoutes(app, ctx);
  await tradeRoutes(app, ctx);
  await strategyRoutes(app, ctx);
  await agentRoutes(app, ctx);
  await authRoutes(app, ctx);
  await a2aRoutes(app, ctx);
  await positionRoutes(app, ctx);
  await lendingRoutes(app, ctx);

  return app;
}
