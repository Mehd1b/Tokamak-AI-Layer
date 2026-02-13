import type { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { isAddress, type Address, type Hex } from "viem";
import type { AppContext } from "../context.js";
import { siwaAuthMiddleware } from "@tal-trading-agent/siwa-auth";
import { TOKENS } from "@tal-trading-agent/shared";
import type { TradeRequest } from "@tal-trading-agent/shared";
import { inferHorizonFromPrompt } from "./horizonParser.js";

// ── Request schemas ─────────────────────────────────────

const AnalyzeBody = Type.Object({
  prompt: Type.String({ minLength: 10 }),
  budget: Type.String({ description: "Budget in wei as string" }),
  budgetToken: Type.Optional(Type.String({ description: "ERC-20 address, defaults to WETH" })),
  walletAddress: Type.String(),
  horizon: Type.Optional(Type.Union([
    Type.Literal("1h"),
    Type.Literal("4h"),
    Type.Literal("1d"),
    Type.Literal("1w"),
    Type.Literal("1m"),
    Type.Literal("3m"),
    Type.Literal("6m"),
    Type.Literal("1y"),
  ])),
  riskTolerance: Type.Optional(Type.Union([
    Type.Literal("conservative"),
    Type.Literal("moderate"),
    Type.Literal("aggressive"),
  ])),
  taskRef: Type.Optional(Type.String({ description: "On-chain task reference (bytes32 hex) for escrow confirmation" })),
});

const ExecuteBody = Type.Object({
  strategyId: Type.String(),
  signedTransaction: Type.String({ description: "Serialized signed tx hex" }),
});

export async function tradeRoutes(app: FastifyInstance, ctx: AppContext) {
  const siwaAuth = siwaAuthMiddleware(ctx.siwaProvider);

  // ── POST /api/v1/trade/analyze ─────────────────────────
  app.post<{ Body: typeof AnalyzeBody.static }>(
    "/api/v1/trade/analyze",
    { schema: { body: AnalyzeBody } },
    async (req, reply) => {
      const body = req.body;

      // Validate wallet address
      if (!isAddress(body.walletAddress)) {
        return reply.code(400).send({ error: "Invalid wallet address" });
      }

      const budgetToken = (body.budgetToken && isAddress(body.budgetToken)
        ? body.budgetToken
        : TOKENS.WETH) as Address;

      // Infer horizon from the natural language prompt if not explicitly provided
      const inferredHorizon = body.horizon ?? inferHorizonFromPrompt(body.prompt);

      const request: TradeRequest = {
        prompt: body.prompt,
        budget: BigInt(body.budget),
        budgetToken,
        walletAddress: body.walletAddress as Address,
        horizon: inferredHorizon ?? "1w",
        riskTolerance: body.riskTolerance ?? "moderate",
        chainId: 1,
      };

      ctx.logger.info(
        { wallet: request.walletAddress, budget: body.budget, horizon: request.horizon },
        "Trade analysis requested",
      );

      // 1. Get top token candidates
      const topTokens = Object.values(TOKENS).slice(0, 8);

      // 2. Score tokens via pool analysis + quant
      const candidates = await ctx.tokenScorer.scoreTokens(topTokens, budgetToken, request.horizon);

      // 3. Generate strategy via LLM
      const strategy = await ctx.strategyEngine.generateStrategy(request, candidates);

      // 4. Validate via risk manager
      const validation = ctx.riskManager.validateStrategy(strategy);
      if (!validation.valid) {
        ctx.logger.warn({ errors: validation.errors }, "Strategy failed risk check, adjusting");
        const adjusted = ctx.riskManager.adjustForRisk(strategy);
        ctx.strategyCache.set(adjusted.id, adjusted);

        // Confirm escrow even for risk-adjusted strategies (analysis was still delivered)
        let adjustedConfirmTxHash: string | undefined;
        if (body.taskRef) {
          try {
            const txHash = await ctx.talIntegration.confirmTask(body.taskRef as Hex);
            adjustedConfirmTxHash = txHash;
          } catch (escrowErr) {
            ctx.logger.warn({ taskRef: body.taskRef, error: escrowErr }, "Failed to confirm escrow for adjusted strategy");
          }
        }

        return reply.send({
          strategy: serializeStrategy(adjusted),
          riskWarnings: validation.warnings,
          riskAdjusted: true,
          ...(adjustedConfirmTxHash ? { feeConfirmed: true, confirmTxHash: adjustedConfirmTxHash } : {}),
        });
      }

      // 5. Build unsigned swap calldata for each trade
      const unsignedSwaps = strategy.trades.map((trade) =>
        ctx.swapBuilder.buildFromTradeAction(trade, request.walletAddress),
      );

      ctx.strategyCache.set(strategy.id, strategy);

      // Confirm escrow if a taskRef was provided (paid analysis)
      let confirmTxHash: string | undefined;
      if (body.taskRef) {
        try {
          const txHash = await ctx.talIntegration.confirmTask(body.taskRef as Hex);
          confirmTxHash = txHash;
          ctx.logger.info({ strategyId: strategy.id, taskRef: body.taskRef, txHash }, "Escrow confirmed");
        } catch (escrowErr) {
          ctx.logger.warn(
            { strategyId: strategy.id, taskRef: body.taskRef, error: escrowErr },
            "Failed to confirm escrow (analysis was still delivered)",
          );
        }
      }

      return reply.send({
        strategy: serializeStrategy(strategy),
        unsignedSwaps: unsignedSwaps.map((s) => ({
          to: s.to,
          data: s.data,
          value: s.value.toString(),
          gasEstimate: s.gasEstimate.toString(),
          description: s.description,
        })),
        riskWarnings: validation.warnings,
        riskAdjusted: false,
        ...(confirmTxHash ? { feeConfirmed: true, confirmTxHash } : {}),
      });
    },
  );

  // ── POST /api/v1/trade/execute (requires SIWA auth) ────
  app.post<{ Body: typeof ExecuteBody.static }>(
    "/api/v1/trade/execute",
    { preHandler: [siwaAuth], schema: { body: ExecuteBody } },
    async (req, reply) => {
      const { strategyId, signedTransaction } = req.body;
      const session = req.siwaSession!;

      const strategy = ctx.strategyCache.get(strategyId);
      if (!strategy) {
        return reply.code(404).send({ error: "Strategy not found or expired" });
      }

      // Verify the strategy belongs to the authenticated wallet
      if (strategy.request.walletAddress.toLowerCase() !== session.address.toLowerCase()) {
        return reply.code(403).send({ error: "Strategy belongs to a different wallet" });
      }

      ctx.logger.info(
        { strategyId, wallet: session.address },
        "Trade execution requested",
      );

      // Broadcast the pre-signed transaction
      const { txHash } = await ctx.tradeExecutor.broadcastSignedTx(signedTransaction as Hex);

      // Wait for confirmation
      const result = await ctx.tradeExecutor.waitForReceipt(txHash);
      ctx.executionCache.set(strategyId, result);

      return reply.send({
        txHash,
        status: result.status,
        amountIn: result.amountIn.toString(),
        amountOut: result.amountOut.toString(),
        gasUsed: result.gasUsed.toString(),
      });
    },
  );

  // ── GET /api/v1/trade/:strategyId ──────────────────────
  app.get<{ Params: { strategyId: string } }>(
    "/api/v1/trade/:strategyId",
    async (req, reply) => {
      const strategy = ctx.strategyCache.get(req.params.strategyId);
      if (!strategy) {
        return reply.code(404).send({ error: "Strategy not found" });
      }
      return reply.send({ strategy: serializeStrategy(strategy) });
    },
  );

  // ── GET /api/v1/trade/:strategyId/status ───────────────
  app.get<{ Params: { strategyId: string } }>(
    "/api/v1/trade/:strategyId/status",
    async (req, reply) => {
      const execution = ctx.executionCache.get(req.params.strategyId);
      if (!execution) {
        const strategy = ctx.strategyCache.get(req.params.strategyId);
        if (!strategy) {
          return reply.code(404).send({ error: "Strategy not found" });
        }
        return reply.send({ status: "awaiting_execution", strategyId: req.params.strategyId });
      }
      return reply.send({
        status: execution.status,
        txHash: execution.txHash,
        amountIn: execution.amountIn.toString(),
        amountOut: execution.amountOut.toString(),
      });
    },
  );

  // ── GET /api/v1/trade/:strategyId/download ─────────────
  // Returns a zip file containing a self-contained bot repo
  app.get<{ Params: { strategyId: string } }>(
    "/api/v1/trade/:strategyId/download",
    async (req, reply) => {
      const strategy = ctx.strategyCache.get(req.params.strategyId);
      if (!strategy) {
        return reply.code(404).send({ error: "Strategy not found" });
      }

      const { generateBotZip } = await import("../zip/botGenerator.js");
      const zipBuffer = await generateBotZip(strategy);

      reply.header("Content-Type", "application/zip");
      reply.header(
        "Content-Disposition",
        `attachment; filename="trading-bot-${strategy.id}.zip"`,
      );
      return reply.send(zipBuffer);
    },
  );
}

// ── Helpers ──────────────────────────────────────────────

function serializeStrategy(s: import("@tal-trading-agent/shared").TradingStrategy) {
  return {
    id: s.id,
    mode: s.mode,
    analysis: s.analysis,
    trades: s.trades.map((t) => ({
      ...t,
      amountIn: t.amountIn.toString(),
      minAmountOut: t.minAmountOut.toString(),
    })),
    investmentPlan: s.investmentPlan,
    llmReasoning: s.llmReasoning,
    riskMetrics: {
      ...s.riskMetrics,
      stopLossPrice: s.riskMetrics.stopLossPrice.toString(),
      takeProfitPrice: s.riskMetrics.takeProfitPrice.toString(),
    },
    estimatedReturn: s.estimatedReturn,
    generatedAt: s.generatedAt,
    expiresAt: s.expiresAt,
  };
}
