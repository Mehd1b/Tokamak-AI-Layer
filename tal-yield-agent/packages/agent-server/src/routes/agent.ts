import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { ErrorResponse } from "../schemas.js";

export async function agentRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * GET /api/v1/agent/reputation — Agent reputation summary
   */
  app.get("/api/v1/agent/reputation", {
    schema: {
      response: { 404: ErrorResponse, 500: ErrorResponse },
    },
    handler: async (_req, reply) => {
      const agentId = ctx.config.AGENT_ID;
      if (agentId === undefined) {
        return reply.code(404).send({ error: "not_configured", message: "AGENT_ID not configured" });
      }

      try {
        const reputation = await ctx.talClient.getReputation(agentId);
        return reply.send({
          agentId: agentId.toString(),
          feedbackCount: reputation.feedbackCount.toString(),
          clients: reputation.clients,
          summary: {
            totalValue: reputation.summary.totalValue.toString(),
            count: reputation.summary.count.toString(),
            min: reputation.summary.min.toString(),
            max: reputation.summary.max.toString(),
          },
        });
      } catch (err) {
        ctx.logger.error({ err }, "Failed to fetch reputation");
        return reply.code(500).send({
          error: "reputation_fetch_failed",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  });

  /**
   * GET /api/v1/agent/stats — Agent delivery stats
   */
  app.get("/api/v1/agent/stats", {
    handler: async (_req, reply) => {
      const tasks = [...ctx.taskCache.values()];
      const completed = tasks.filter((t) => t.status === "completed");
      const failed = tasks.filter((t) => t.status === "failed");
      const pending = tasks.filter((t) => t.status === "pending" || t.status === "processing");

      // Compute average generation time
      const completionTimes = completed
        .filter((t) => t.completedAt)
        .map((t) => t.completedAt! - t.createdAt);
      const avgGenTime = completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;

      // Compute average blended APY across completed strategies
      const apys = completed
        .filter((t) => t.report)
        .map((t) => t.report!.expectedAPY.blended);
      const avgAPY = apys.length > 0
        ? apys.reduce((a, b) => a + b, 0) / apys.length
        : 0;

      return reply.send({
        agentId: ctx.config.AGENT_ID?.toString() ?? "not_configured",
        totalTasks: tasks.length,
        completedTasks: completed.length,
        failedTasks: failed.length,
        pendingTasks: pending.length,
        successRate: tasks.length > 0 ? completed.length / tasks.length : 0,
        avgGenerationTimeMs: Math.round(avgGenTime),
        avgBlendedAPY: Number(avgAPY.toFixed(4)),
        poolsTracked: ctx.poolCache.length,
        snapshotsCached: ctx.snapshotCache.size,
      });
    },
  });
}
