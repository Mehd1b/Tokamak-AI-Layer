import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export async function agentRoutes(app: FastifyInstance, ctx: AppContext) {
  // ── GET /api/v1/agent/info ─────────────────────────────
  app.get("/api/v1/agent/info", async (_req, reply) => {
    if (ctx.config.agentId === 0n) {
      return reply.send({
        registered: false,
        message: "Agent not registered. Run: pnpm register",
      });
    }

    try {
      const info = await ctx.talIntegration.getAgentInfo(ctx.config.agentId);
      return reply.send({
        registered: true,
        agentId: ctx.config.agentId.toString(),
        owner: info.owner,
        agentURI: info.agentURI,
        operator: info.operator,
      });
    } catch (error) {
      ctx.logger.error({ error }, "Failed to fetch agent info");
      return reply.code(500).send({ error: "Failed to fetch agent info" });
    }
  });

  // ── GET /api/v1/agent/reputation ───────────────────────
  app.get("/api/v1/agent/reputation", async (_req, reply) => {
    if (ctx.config.agentId === 0n) {
      return reply.send({ feedbackCount: "0", averageScore: 0 });
    }

    try {
      const rep = await ctx.talIntegration.getReputation(ctx.config.agentId);
      return reply.send({
        agentId: ctx.config.agentId.toString(),
        feedbackCount: rep.feedbackCount.toString(),
        averageScore: rep.averageScore,
      });
    } catch (error) {
      ctx.logger.error({ error }, "Failed to fetch reputation");
      return reply.code(500).send({ error: "Failed to fetch reputation" });
    }
  });

  // ── GET /api/v1/agent/stats ────────────────────────────
  app.get("/api/v1/agent/stats", async (_req, reply) => {
    const executions = [...ctx.executionCache.values()];
    const completed = executions.filter((e) => e.status === "confirmed");
    const failed = executions.filter((e) => e.status === "failed");

    return reply.send({
      totalStrategies: ctx.strategyCache.size,
      totalExecutions: executions.length,
      completedExecutions: completed.length,
      failedExecutions: failed.length,
      successRate: executions.length > 0
        ? completed.length / executions.length
        : 0,
    });
  });

  // ── GET /api/v1/agent/capabilities ─────────────────────
  app.get("/api/v1/agent/capabilities", async (_req, reply) => {
    return reply.send({
      name: "TAL Trading Agent",
      version: "0.2.0",
      description:
        "Autonomous quantitative trading agent on the Tokamak AI Layer (ERC-8004). Generates LLM-driven strategies across four modes (scalp, swing, position, investment) with on-chain Uniswap V3 analysis, risk management, fee escrow, and downloadable auto-executing bots.",
      capabilities: [
        {
          id: "trade-analysis",
          name: "Quantitative Strategy Generation",
          description:
            "Accepts natural-language prompts with automatic horizon inference (1h–1y). Scores tokens across 9 indicators (RSI, MACD, Bollinger Bands, VWAP, momentum, liquidity depth, fee APY, volume trend, TVL stability). Generates strategies via Claude with mode-specific guidance. Investment mode includes portfolio allocation, DCA scheduling, rebalancing, and exit criteria. Returns unsigned swap calldata and risk metrics.",
          endpoint: "POST /api/v1/trade/analyze",
        },
        {
          id: "trade-execution",
          name: "Trade Execution",
          description:
            "Broadcasts user-signed transactions to Ethereum mainnet and monitors to confirmation. Parses Uniswap V3 Swap event logs. Requires SIWA authentication. Agent never holds private keys.",
          endpoint: "POST /api/v1/trade/execute",
        },
        {
          id: "bot-download",
          name: "Downloadable Trading Bot",
          description:
            "Generates a self-contained Node.js bot (.zip) with auto-executing stop-loss/take-profit/trailing-stop listener, ERC-20 approval handling, DCA scheduler, portfolio rebalancer, and pre-configured strategy. Runs via npm start or Docker.",
          endpoint: "GET /api/v1/trade/:strategyId/download",
        },
        {
          id: "fee-escrow",
          name: "On-Chain Fee Escrow",
          description:
            "Integrates with TaskFeeEscrow contract on Thanos L2. Verifies payment, confirms task completion to release escrowed fees, and supports refunds for failed tasks.",
          endpoint: "Automatic (via taskRef in request)",
        },
      ],
      supportedChains: [1],
      supportedDexes: ["Uniswap V3"],
      supportedTokens: ["WETH", "USDC", "USDT", "DAI", "WBTC", "UNI", "LINK", "AAVE", "MKR", "SNX"],
      tradingModes: ["scalp", "swing", "position", "investment"],
      riskTolerances: ["conservative", "moderate", "aggressive"],
      authMethod: "SIWA (Sign-In With Agent)",
    });
  });
}
