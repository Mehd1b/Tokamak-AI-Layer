import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export async function strategyRoutes(app: FastifyInstance, ctx: AppContext) {
  // ── GET /api/v1/strategy/active ────────────────────────
  app.get("/api/v1/strategy/active", async (_req, reply) => {
    const now = Date.now();
    const active = [...ctx.strategyCache.entries()]
      .filter(([, s]) => s.expiresAt > now)
      .map(([id, s]) => ({
        id,
        horizon: s.request.horizon,
        confidence: s.analysis.confidence,
        marketCondition: s.analysis.marketCondition,
        tradesCount: s.trades.length,
        expectedReturn: s.estimatedReturn.expected,
        expiresAt: s.expiresAt,
        executed: ctx.executionCache.has(id),
      }));

    return reply.send({ strategies: active, count: active.length });
  });

  // ── GET /api/v1/strategy/:id/risk ──────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/v1/strategy/:id/risk",
    async (req, reply) => {
      const strategy = ctx.strategyCache.get(req.params.id);
      if (!strategy) {
        return reply.code(404).send({ error: "Strategy not found" });
      }

      const validation = ctx.riskManager.validateStrategy(strategy);

      return reply.send({
        strategyId: req.params.id,
        riskScore: strategy.riskMetrics.score,
        maxDrawdown: strategy.riskMetrics.maxDrawdown,
        positionSizePercent: strategy.riskMetrics.positionSizePercent,
        validation,
      });
    },
  );

  // ── POST /api/v1/strategy/:id/approve ──────────────────
  app.post<{ Params: { id: string } }>(
    "/api/v1/strategy/:id/approve",
    async (req, reply) => {
      const strategy = ctx.strategyCache.get(req.params.id);
      if (!strategy) {
        return reply.code(404).send({ error: "Strategy not found" });
      }

      // Build unsigned swaps for the client to sign
      const unsignedSwaps = strategy.trades.map((trade) =>
        ctx.swapBuilder.buildFromTradeAction(trade, strategy.request.walletAddress),
      );

      return reply.send({
        strategyId: req.params.id,
        approved: true,
        unsignedSwaps: unsignedSwaps.map((s) => ({
          to: s.to,
          data: s.data,
          value: s.value.toString(),
          gasEstimate: s.gasEstimate.toString(),
          description: s.description,
        })),
        message: "Sign the transaction(s) and submit to /api/v1/trade/execute",
      });
    },
  );
}
