import type { FastifyInstance } from "fastify";
import { isAddress, type Address } from "viem";
import type { AppContext } from "../context.js";

export async function positionRoutes(app: FastifyInstance, ctx: AppContext) {
  // ── GET /api/v1/positions ─────────────────────────────
  app.get("/api/v1/positions", async (_req, reply) => {
    const positions = ctx.positionManager.getOpenPositions();

    return reply.send({
      positions: positions.map((p) => ({
        id: p.id,
        direction: p.direction,
        positionType: p.positionType,
        collateralToken: p.collateralToken,
        debtToken: p.debtToken,
        collateralAmount: p.collateralAmount.toString(),
        debtAmount: p.debtAmount.toString(),
        leverageMultiplier: p.leverageMultiplier,
        healthFactor: p.healthFactor,
        liquidationPrice: p.liquidationPrice.toString(),
        entryPrice: p.entryPrice.toString(),
        openedAt: p.openedAt,
        status: p.status,
      })),
    });
  });

  // ── GET /api/v1/positions/:id ─────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/v1/positions/:id",
    async (req, reply) => {
      const position = ctx.positionManager.getPosition(req.params.id);
      if (!position) {
        return reply.code(404).send({ error: "Position not found" });
      }

      // Fetch live health factor if we have a wallet address in the position cache
      let liveHealthFactor: number | undefined;
      try {
        // Use the position's collateral token owner — in practice, we'd need the user address
        // For now, return the stored health factor
        liveHealthFactor = position.healthFactor;
      } catch {
        // Fall back to stored value
      }

      return reply.send({
        position: {
          id: position.id,
          direction: position.direction,
          positionType: position.positionType,
          collateralToken: position.collateralToken,
          debtToken: position.debtToken,
          collateralAmount: position.collateralAmount.toString(),
          debtAmount: position.debtAmount.toString(),
          leverageMultiplier: position.leverageMultiplier,
          healthFactor: liveHealthFactor ?? position.healthFactor,
          liquidationPrice: position.liquidationPrice.toString(),
          entryPrice: position.entryPrice.toString(),
          openedAt: position.openedAt,
          status: position.status,
        },
      });
    },
  );

  // ── POST /api/v1/positions/:id/close ──────────────────
  app.post<{ Params: { id: string }; Body: { recipient: string } }>(
    "/api/v1/positions/:id/close",
    async (req, reply) => {
      const { id } = req.params;
      const recipient = req.body?.recipient;

      if (!recipient || !isAddress(recipient)) {
        return reply.code(400).send({ error: "Valid recipient address required" });
      }

      try {
        const transactions = ctx.positionManager.buildCloseTransactions(
          id,
          recipient as Address,
        );

        return reply.send({
          positionId: id,
          transactions: transactions.map((tx) => ({
            type: tx.type,
            to: tx.to,
            data: tx.data,
            value: tx.value.toString(),
            gasEstimate: tx.gasEstimate.toString(),
            description: tx.description,
            token: tx.token,
            amount: tx.amount?.toString(),
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to build close transactions";
        return reply.code(400).send({ error: message });
      }
    },
  );

  // ── GET /api/v1/positions/:id/health ──────────────────
  app.get<{ Params: { id: string }; Querystring: { wallet?: string } }>(
    "/api/v1/positions/:id/health",
    async (req, reply) => {
      const position = ctx.positionManager.getPosition(req.params.id);
      if (!position) {
        return reply.code(404).send({ error: "Position not found" });
      }

      const wallet = req.query.wallet;
      if (!wallet || !isAddress(wallet)) {
        // Return stored health factor if no wallet provided
        return reply.send({
          positionId: req.params.id,
          healthFactor: position.healthFactor,
          liquidationPrice: position.liquidationPrice.toString(),
          source: "cached",
        });
      }

      try {
        const liveHealthFactor = await ctx.positionManager.checkHealthFactor(
          wallet as Address,
        );

        return reply.send({
          positionId: req.params.id,
          healthFactor: liveHealthFactor,
          liquidationPrice: position.liquidationPrice.toString(),
          source: "live",
          warning: liveHealthFactor < 1.5 ? "Health factor is low — consider adding collateral or closing position" : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to check health factor";
        return reply.code(500).send({ error: message });
      }
    },
  );
}
