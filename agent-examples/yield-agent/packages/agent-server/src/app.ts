import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { AppContext } from "./context.js";
import { verifyEIP712Signature } from "./middleware/eip712-auth.js";
import {
  healthRoutes,
  strategyRoutes,
  poolRoutes,
  agentRoutes,
  validationRoutes,
  snapshotRoutes,
  compatRoutes,
} from "./routes/index.js";

export async function buildApp(ctx: AppContext) {
  const app = Fastify({
    logger: false, // We use our own pino logger
  });

  // CORS
  await app.register(cors, { origin: true });

  // Global rate limiting: 100 requests per minute per IP/API-key
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.headers["x-api-key"] as string) ?? req.ip,
    errorResponseBuilder: () => ({ error: "rate_limit_exceeded", message: "Rate limit exceeded", statusCode: 429 }),
  });

  // Tighter rate limit for task submission endpoints (10 POST per minute)
  app.addHook("onRequest", async (req, reply) => {
    const taskPaths = ["/api/tasks", "/api/v1/strategy/request"];
    if (req.method === "POST" && taskPaths.includes(req.url)) {
      // Use the built-in rate limit with a group key to apply a separate bucket
      const key = `task:${(req.headers["x-api-key"] as string) ?? req.ip}`;
      const now = Date.now();

      // Simple sliding window counter stored on the app instance
      const counters = (app as any).__taskRateLimits ??= new Map<string, { count: number; resetAt: number }>();
      let entry = counters.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + 60_000 };
        counters.set(key, entry);
      }
      entry.count++;
      if (entry.count > 10) {
        return reply.code(429).send({ error: "rate_limit_exceeded", message: "Too many task submissions, please try again later", statusCode: 429 });
      }
    }
  });

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

  // EIP-712 auth on write endpoints (only when EIP712_AUTH env is enabled)
  // Uses preHandler so that req.body is available (parsed after onRequest)
  if (ctx.config.EIP712_AUTH) {
    app.addHook("preHandler", async (req, reply) => {
      const writePaths = ["/api/v1/strategy/request", "/api/v1/validate/submit"];
      if (req.method === "POST" && writePaths.includes(req.url)) {
        await verifyEIP712Signature(req, reply);
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
  await compatRoutes(app, ctx);

  return app;
}
