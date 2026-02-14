import type { FastifyInstance } from "fastify";
import { isAddress, type Address, type Hex } from "viem";
import type { AppContext } from "../context.js";
import { TOKENS } from "@tal-trading-agent/shared";
import type { TradeRequest, TradingStrategy } from "@tal-trading-agent/shared";
import { inferHorizonFromPrompt, inferRiskToleranceFromPrompt } from "./horizonParser.js";
import { inferBudgetFromPrompt } from "./budgetParser.js";

// ── A2A Protocol Types ──────────────────────────────────

interface A2AJsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface A2AMessage {
  role: "user" | "agent";
  parts: A2APart[];
}

interface A2ATextPart {
  type: "text";
  text: string;
}

interface A2ADataPart {
  type: "data";
  data: Record<string, unknown>;
  mimeType?: string;
}

type A2APart = A2ATextPart | A2ADataPart;

interface A2ATask {
  id: string;
  status: A2ATaskStatus;
  messages: A2AMessage[];
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
}

interface A2ATaskStatus {
  state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled";
  message?: A2AMessage;
}

interface A2AArtifact {
  name: string;
  description?: string;
  parts: A2APart[];
}

// ── In-memory task store ────────────────────────────────

const a2aTasks = new Map<string, A2ATask>();

// ── Route Registration ──────────────────────────────────

export async function a2aRoutes(app: FastifyInstance, ctx: AppContext) {
  // ── GET /api/agents/trader — Agent Card ───────────────
  app.get("/api/agents/trader", async (req, reply) => {
    const host = req.headers.host ?? "localhost:3000";
    const protocol = req.headers["x-forwarded-proto"] ?? "https";
    const baseUrl = `${protocol}://${host}`;

    return reply.send({
      name: "TAL Trading Agent",
      description:
        "Autonomous quantitative trading agent on the Tokamak AI Layer (ERC-8004). Accepts natural-language trading prompts, analyzes Uniswap V3 pool liquidity and DeFiLlama market data across 9 technical and DeFi indicators, then generates optimized strategies via Claude with extended thinking. Supports four trading modes — scalp, swing, position, and investment — with automatic horizon inference from plain English. Investment-mode strategies include portfolio allocation, DCA scheduling, drift-based rebalancing, and configurable exit criteria. All strategies come with unsigned Uniswap V3 swap calldata, risk validation with auto-adjustment, and a downloadable self-executing trading bot. On-chain fee escrow confirmation via TaskFeeEscrow ensures trustless payment settlement.",
      url: `${baseUrl}/api/agents/trader`,
      version: "0.2.0",
      provider: {
        organization: "Tokamak Network",
      },
      capabilities: {
        streaming: false,
        pushNotifications: false,
      },
      authentication: {
        schemes: ["apiKey"],
        credentials: "x-api-key header (optional, depends on server config)",
      },
      defaultInputModes: ["application/json", "text/plain"],
      defaultOutputModes: ["application/json", "text/plain"],
      skills: [
        {
          id: "trade-analysis",
          name: "Quantitative Strategy Generation",
          description:
            "Accepts a natural-language trading prompt and automatically infers budget, horizon (1h to 1y), and risk tolerance. Scores up to 10 blue-chip tokens (WETH, USDC, USDT, DAI, WBTC, UNI, LINK, AAVE, MKR, SNX) using on-chain Uniswap V3 pool data and DeFiLlama price history across 9 weighted indicators: RSI, MACD, Bollinger Bands, VWAP, momentum, liquidity depth, fee APY, volume trend, TVL stability, and smart money flow. Data quality scoring automatically down-weights unreliable technical signals and redistributes weight to DeFi fundamentals. Generates an optimized strategy via Claude with mode-specific guidance: scalp (hours, technical-first), swing (days, balanced), position (months, DeFi-first), or investment (6m–1y, portfolio allocation with DCA + rebalancing). Returns the strategy with unsigned swap calldata, risk metrics (score 0–100, max drawdown, stop-loss/take-profit), estimated returns (optimistic/expected/pessimistic), and an optional investment plan with allocations, DCA schedule, rebalancing triggers, and exit criteria. If a taskRef is provided, the agent confirms the on-chain fee escrow upon completion.",
          tags: ["defi", "trading", "uniswap", "strategy", "quantitative", "portfolio", "dca", "rebalancing"],
          examples: [
            "Invest $100,000 in promising tokens for the next 6 months",
            "Invest 1 ETH in promising DeFi tokens for the next week",
            "Conservative allocation of 0.5 ETH across blue-chip tokens for 3 months",
            "Aggressive short-term trade on high-momentum tokens for 4 hours",
            "Build a long-term DCA portfolio with monthly rebalancing for 1 year",
          ],
          inputModes: ["application/json", "text/plain"],
          outputModes: ["application/json"],
        },
        {
          id: "bot-download",
          name: "Downloadable Trading Bot",
          description:
            "Generates a self-contained Node.js trading bot as a downloadable .zip for any generated strategy. The bot includes: an auto-executing listener that monitors positions and triggers sell actions on stop-loss, take-profit, or trailing stop conditions; ERC-20 token approval handling for non-ETH swaps; a DCA scheduler for investment-mode strategies that spreads purchases over configurable periods with state persistence; a portfolio rebalancer supporting both drift-threshold and calendar-based rebalancing; and shared helpers for Uniswap V3 quoting, swapping, and balance queries. All configuration is pre-populated from the strategy. Runs via `npm start` or Docker.",
          tags: ["bot", "download", "automation", "dca", "rebalancing", "listener"],
          inputModes: ["application/json"],
          outputModes: ["application/octet-stream"],
        },
      ],
    });
  });

  // ── POST /api/agents/trader — A2A JSON-RPC ────────────
  app.post("/api/agents/trader", async (req, reply) => {
    const body = req.body as A2AJsonRpcRequest;

    // Validate JSON-RPC envelope
    if (!body || body.jsonrpc !== "2.0" || !body.method || body.id === undefined) {
      return reply.code(400).send({
        jsonrpc: "2.0",
        id: body?.id ?? null,
        error: {
          code: -32600,
          message: "Invalid JSON-RPC request",
        },
      });
    }

    switch (body.method) {
      case "tasks/send":
        return await handleTasksSend(body, ctx, reply);
      case "tasks/get":
        return handleTasksGet(body, reply);
      case "tasks/cancel":
        return handleTasksCancel(body, reply);
      default:
        return reply.send({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32601,
            message: `Method not found: ${body.method}`,
          },
        });
    }
  });
}

// ── tasks/send ──────────────────────────────────────────

async function handleTasksSend(
  rpc: A2AJsonRpcRequest,
  ctx: AppContext,
  reply: import("fastify").FastifyReply,
) {
  const params = rpc.params as {
    id?: string;
    message?: A2AMessage;
    metadata?: Record<string, unknown>;
  } | undefined;

  if (!params?.message?.parts?.length) {
    return reply.send({
      jsonrpc: "2.0",
      id: rpc.id,
      error: {
        code: -32602,
        message: "Invalid params: message with at least one part is required",
      },
    });
  }

  const taskId = params.id ?? crypto.randomUUID();

  // Parse the request from message parts
  const tradeParams = extractTradeParams(params.message);

  // If we got only a text prompt without structured data, ask for input
  if (!tradeParams.prompt) {
    const task: A2ATask = {
      id: taskId,
      status: {
        state: "input-required",
        message: {
          role: "agent",
          parts: [
            {
              type: "text",
              text: "Please provide a trading prompt. You can send a text message like 'Invest 1 ETH in DeFi tokens for a week' or structured JSON with: prompt, budget (wei string), walletAddress, horizon (1h/4h/1d/1w/1m/3m/6m/1y), riskTolerance (conservative/moderate/aggressive).",
            },
          ],
        },
      },
      messages: [params.message],
    };
    a2aTasks.set(taskId, task);
    return reply.send({ jsonrpc: "2.0", id: rpc.id, result: task });
  }

  // Create the task in working state
  const task: A2ATask = {
    id: taskId,
    status: { state: "working" },
    messages: [params.message],
    metadata: params.metadata,
  };
  a2aTasks.set(taskId, task);

  // Execute the trading pipeline
  try {
    const walletAddress = (tradeParams.walletAddress && isAddress(tradeParams.walletAddress)
      ? tradeParams.walletAddress
      : "0x0000000000000000000000000000000000000000") as Address;

    const budgetToken = (tradeParams.budgetToken && isAddress(tradeParams.budgetToken)
      ? tradeParams.budgetToken
      : TOKENS.WETH) as Address;

    // Infer horizon from the natural language prompt if not explicitly provided
    const inferredHorizon = tradeParams.horizon ?? inferHorizonFromPrompt(tradeParams.prompt ?? "");

    // Infer budget from the natural language prompt if not explicitly provided
    let budget = tradeParams.budget ? BigInt(tradeParams.budget) : undefined;
    if (!budget) {
      const parsed = await inferBudgetFromPrompt(tradeParams.prompt ?? "");
      if (parsed) {
        budget = parsed.wei;
        ctx.logger.info({ budget: parsed.description }, "Budget inferred from prompt");
      }
    }

    const request: TradeRequest = {
      prompt: tradeParams.prompt,
      budget: budget ?? BigInt("1000000000000000000"), // default 1 ETH if nothing detected
      budgetToken,
      walletAddress,
      horizon: inferredHorizon ?? "1w",
      riskTolerance: tradeParams.riskTolerance ?? inferRiskToleranceFromPrompt(tradeParams.prompt ?? "") ?? "moderate",
      chainId: 1,
    };

    ctx.logger.info(
      { taskId, prompt: request.prompt, horizon: request.horizon },
      "A2A task received — starting trade analysis",
    );

    // 1. Score tokens
    const topTokens = Object.values(TOKENS).slice(0, 8);
    const candidates = await ctx.tokenScorer.scoreTokens(topTokens, budgetToken, request.horizon);

    // 2. Generate strategy via LLM
    const strategy = await ctx.strategyEngine.generateStrategy(request, candidates);

    // 3. Validate via risk manager
    const validation = ctx.riskManager.validateStrategy(strategy);
    let finalStrategy = strategy;
    let riskAdjusted = false;

    if (!validation.valid) {
      ctx.logger.warn({ errors: validation.errors }, "A2A strategy failed risk check, adjusting");
      finalStrategy = ctx.riskManager.adjustForRisk(strategy);
      riskAdjusted = true;
    }

    // 4. Build unsigned swaps
    const unsignedSwaps = finalStrategy.trades.map((trade) =>
      ctx.swapBuilder.buildFromTradeAction(trade, walletAddress),
    );

    // Cache the strategy for later retrieval via /api/v1/trade/:id
    ctx.strategyCache.set(finalStrategy.id, finalStrategy);

    // 5. Build the completed task
    const serialized = serializeStrategy(finalStrategy);

    task.status = {
      state: "completed",
      message: {
        role: "agent",
        parts: [
          {
            type: "text",
            text: buildSummaryText(finalStrategy, riskAdjusted, validation.warnings),
          },
        ],
      },
    };

    task.artifacts = [
      {
        name: "trading-strategy",
        description: `Trading strategy ${finalStrategy.id}`,
        parts: [
          {
            type: "data",
            mimeType: "application/json",
            data: {
              strategy: serialized,
              unsignedSwaps: unsignedSwaps.map((s) => ({
                to: s.to,
                data: s.data,
                value: s.value.toString(),
                gasEstimate: s.gasEstimate.toString(),
                description: s.description,
              })),
              riskWarnings: validation.warnings,
              riskAdjusted,
            },
          },
        ],
      },
    ];

    task.messages.push(task.status.message!);
    a2aTasks.set(taskId, task);

    // Confirm task on escrow if a taskRef was provided (paid task)
    const taskRef = params.metadata?.taskRef as string | undefined;
    let confirmTxHash: string | undefined;
    if (taskRef) {
      try {
        const txHash = await ctx.talIntegration.confirmTask(taskRef as Hex);
        confirmTxHash = txHash;
        ctx.logger.info({ taskId, taskRef, txHash }, "Escrow confirmed for A2A task");
      } catch (escrowErr) {
        // Log but don't fail the response — the analysis was delivered
        ctx.logger.warn(
          { taskId, taskRef, error: escrowErr },
          "Failed to confirm escrow (analysis was still delivered)",
        );
      }
    }

    ctx.logger.info(
      { taskId, strategyId: finalStrategy.id, trades: finalStrategy.trades.length },
      "A2A task completed",
    );

    // Include confirmTxHash in task metadata so callers can verify
    if (confirmTxHash) {
      task.metadata = { ...task.metadata, feeConfirmed: true, confirmTxHash };
      a2aTasks.set(taskId, task);
    }

    return reply.send({ jsonrpc: "2.0", id: rpc.id, result: task });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error during analysis";
    ctx.logger.error({ taskId, error }, "A2A task failed");

    task.status = {
      state: "failed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: `Trade analysis failed: ${errorMsg}` }],
      },
    };
    task.messages.push(task.status.message!);
    a2aTasks.set(taskId, task);

    return reply.send({ jsonrpc: "2.0", id: rpc.id, result: task });
  }
}

// ── tasks/get ───────────────────────────────────────────

function handleTasksGet(
  rpc: A2AJsonRpcRequest,
  reply: import("fastify").FastifyReply,
) {
  const params = rpc.params as { id?: string } | undefined;

  if (!params?.id) {
    return reply.send({
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32602, message: "Invalid params: task id is required" },
    });
  }

  const task = a2aTasks.get(params.id);
  if (!task) {
    return reply.send({
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32001, message: `Task not found: ${params.id}` },
    });
  }

  return reply.send({ jsonrpc: "2.0", id: rpc.id, result: task });
}

// ── tasks/cancel ────────────────────────────────────────

function handleTasksCancel(
  rpc: A2AJsonRpcRequest,
  reply: import("fastify").FastifyReply,
) {
  const params = rpc.params as { id?: string } | undefined;

  if (!params?.id) {
    return reply.send({
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32602, message: "Invalid params: task id is required" },
    });
  }

  const task = a2aTasks.get(params.id);
  if (!task) {
    return reply.send({
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32001, message: `Task not found: ${params.id}` },
    });
  }

  if (task.status.state === "completed" || task.status.state === "failed") {
    return reply.send({
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32002, message: `Task already in terminal state: ${task.status.state}` },
    });
  }

  task.status = {
    state: "canceled",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Task canceled by client." }],
    },
  };
  a2aTasks.set(params.id, task);

  return reply.send({ jsonrpc: "2.0", id: rpc.id, result: task });
}

// ── Helpers ─────────────────────────────────────────────

interface ParsedTradeParams {
  prompt?: string;
  budget?: string;
  budgetToken?: string;
  walletAddress?: string;
  horizon?: TradeRequest["horizon"];
  riskTolerance?: TradeRequest["riskTolerance"];
}

/**
 * Extract trade parameters from an A2A message.
 * Supports both text-only (natural language) and structured data parts.
 */
function extractTradeParams(message: A2AMessage): ParsedTradeParams {
  const result: ParsedTradeParams = {};

  for (const part of message.parts) {
    if (part.type === "text" && part.text.trim()) {
      // Use the text as the prompt
      result.prompt = part.text.trim();
    }

    if (part.type === "data" && part.data) {
      const d = part.data;
      if (typeof d.prompt === "string") result.prompt = d.prompt;
      if (typeof d.budget === "string") result.budget = d.budget;
      if (typeof d.budgetToken === "string") result.budgetToken = d.budgetToken;
      if (typeof d.walletAddress === "string") result.walletAddress = d.walletAddress;
      if (typeof d.horizon === "string") {
        const valid = ["1h", "4h", "1d", "1w", "1m", "3m", "6m", "1y"];
        if (valid.includes(d.horizon)) result.horizon = d.horizon as TradeRequest["horizon"];
      }
      if (typeof d.riskTolerance === "string") {
        const valid = ["conservative", "moderate", "aggressive"];
        if (valid.includes(d.riskTolerance))
          result.riskTolerance = d.riskTolerance as TradeRequest["riskTolerance"];
      }
    }
  }

  return result;
}

function serializeStrategy(s: TradingStrategy) {
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

function buildSummaryText(
  strategy: TradingStrategy,
  riskAdjusted: boolean,
  warnings: string[],
): string {
  const lines: string[] = [
    `Strategy ${strategy.id} generated successfully.`,
    `Mode: ${strategy.mode}`,
    ``,
    `Market: ${strategy.analysis.marketCondition} (confidence: ${(strategy.analysis.confidence * 100).toFixed(0)}%)`,
  ];

  // Investment plan summary
  if (strategy.investmentPlan) {
    const plan = strategy.investmentPlan;
    lines.push(``, `--- Investment Plan ---`);
    lines.push(`Entry strategy: ${plan.entryStrategy}`);
    lines.push(`Thesis: ${plan.thesis}`);
    lines.push(``, `Allocations:`);
    for (const alloc of plan.allocations) {
      lines.push(`  - ${alloc.symbol}: ${alloc.targetPercent}% — ${alloc.reasoning}`);
    }
    if (plan.dcaSchedule) {
      lines.push(``, `DCA Schedule: ${plan.dcaSchedule.frequency}, ${plan.dcaSchedule.totalPeriods} periods, ${plan.dcaSchedule.amountPerPeriodPercent}% per period`);
    }
    if (plan.rebalancing) {
      lines.push(`Rebalancing: ${plan.rebalancing.type}${plan.rebalancing.frequency ? ` (${plan.rebalancing.frequency})` : ""}${plan.rebalancing.driftThresholdPercent ? `, drift threshold: ${plan.rebalancing.driftThresholdPercent}%` : ""}`);
    }
    if (plan.exitCriteria) {
      const exits: string[] = [];
      if (plan.exitCriteria.takeProfitPercent) exits.push(`take profit: ${plan.exitCriteria.takeProfitPercent}%`);
      if (plan.exitCriteria.stopLossPercent) exits.push(`stop loss: ${plan.exitCriteria.stopLossPercent}%`);
      if (plan.exitCriteria.trailingStopPercent) exits.push(`trailing stop: ${plan.exitCriteria.trailingStopPercent}%`);
      if (plan.exitCriteria.timeExitMonths) exits.push(`time exit: ${plan.exitCriteria.timeExitMonths} months`);
      if (exits.length > 0) lines.push(`Exit criteria: ${exits.join(", ")}`);
    }
    lines.push(`---`);
  }

  // Trade summary
  if (strategy.trades.length > 0) {
    lines.push(
      ``,
      `Trades: ${strategy.trades.length}`,
    );
  }

  lines.push(
    `Expected return: ${strategy.estimatedReturn.expected}% (optimistic: ${strategy.estimatedReturn.optimistic}%, pessimistic: ${strategy.estimatedReturn.pessimistic}%)`,
    `Risk score: ${strategy.riskMetrics.score}/100`,
    `Position size: ${strategy.riskMetrics.positionSizePercent}% of budget`,
  );

  if (riskAdjusted) {
    lines.push(``, `Note: Strategy was auto-adjusted to comply with risk limits.`);
  }

  if (warnings.length > 0) {
    lines.push(``, `Warnings:`, ...warnings.map((w) => `  - ${w}`));
  }

  if (strategy.trades.length > 0) {
    lines.push(
      ``,
      `The strategy and unsigned swap calldata are in the artifacts. Sign the transactions with your wallet and submit to execute.`,
    );
  } else {
    lines.push(
      ``,
      `This is a portfolio allocation plan. Review the investment plan in the artifacts for detailed allocation, DCA schedule, and rebalancing strategy.`,
    );
  }

  return lines.join("\n");
}
