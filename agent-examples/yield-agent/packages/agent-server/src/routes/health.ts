import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { HealthResponse } from "../schemas.js";

const startTime = Date.now();

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/v1/health", {
    schema: {
      response: { 200: HealthResponse },
    },
    handler: async (_req, reply) => {
      return reply.send({
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        poolCount: ctx.poolCache.length,
        snapshotCount: ctx.snapshotCache.size,
        taskCount: ctx.taskCache.size,
        timestamp: Date.now(),
      });
    },
  });
}
