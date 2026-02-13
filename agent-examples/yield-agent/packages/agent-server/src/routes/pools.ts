import type { FastifyInstance } from "fastify";
import { RiskScorer } from "@tal-yield-agent/agent-core";
import type { AppContext } from "../context.js";
import { PoolIdParams, PoolSearchQuery, ErrorResponse } from "../schemas.js";

const riskScorer = new RiskScorer();

export async function poolRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * GET /api/v1/pools — List all tracked pools
   */
  app.get("/api/v1/pools", {
    handler: async (_req, reply) => {
      const pools = ctx.poolCache.map((pool) => ({
        ...pool,
        riskScore: riskScorer.scorePool(pool).overall,
      }));

      return reply.send({
        pools,
        count: pools.length,
        timestamp: Date.now(),
      });
    },
  });

  /**
   * GET /api/v1/pools/search — Search and filter pools
   */
  app.get<{ Querystring: PoolSearchQuery }>("/api/v1/pools/search", {
    schema: {
      querystring: PoolSearchQuery,
    },
    handler: async (req, reply) => {
      const { protocol, chain, minAPY, maxRisk, minTVL, limit = 20, offset = 0 } = req.query;

      let filtered = ctx.poolCache;

      if (protocol) {
        filtered = filtered.filter((p) => p.protocol.toLowerCase().includes(protocol.toLowerCase()));
      }
      if (chain !== undefined) {
        filtered = filtered.filter((p) => p.chain === chain);
      }
      if (minAPY !== undefined) {
        filtered = filtered.filter((p) => p.currentAPY >= minAPY);
      }
      if (minTVL !== undefined) {
        filtered = filtered.filter((p) => p.tvl >= minTVL);
      }

      // Score and optionally filter by risk
      const scored = filtered.map((pool) => ({
        ...pool,
        riskScore: riskScorer.scorePool(pool).overall,
      }));

      const results = maxRisk !== undefined
        ? scored.filter((p) => p.riskScore <= maxRisk)
        : scored;

      // Paginate
      const paginated = results.slice(offset, offset + limit);

      return reply.send({
        pools: paginated,
        total: results.length,
        limit,
        offset,
      });
    },
  });

  /**
   * GET /api/v1/pools/:poolId — Pool detail
   */
  app.get<{ Params: PoolIdParams }>("/api/v1/pools/:poolId", {
    schema: {
      params: PoolIdParams,
      response: {
        404: ErrorResponse,
      },
    },
    handler: async (req, reply) => {
      const pool = ctx.poolCache.find((p) => p.poolId === req.params.poolId);
      if (!pool) {
        return reply.code(404).send({ error: "not_found", message: "Pool not found" });
      }

      const riskScore = riskScorer.scorePool(pool);

      return reply.send({
        ...pool,
        riskScore: riskScore.overall,
        riskBreakdown: riskScore.breakdown,
        riskConfidence: riskScore.confidence,
      });
    },
  });
}
