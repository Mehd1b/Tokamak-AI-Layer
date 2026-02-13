import type { FastifyInstance } from "fastify";
import { isAddress, type Address } from "viem";
import type { AppContext } from "../context.js";
import { TOKENS } from "@tal-trading-agent/shared";
import type { TradeRequest, TradingStrategy } from "@tal-trading-agent/shared";

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
        "AI-powered quantitative trading agent on the Tokamak Agent Layer. Analyzes Uniswap V3 pools, generates LLM-driven strategies with risk management, and produces unsigned swap calldata for execution.",
      url: `${baseUrl}/api/agents/trader`,
      version: "0.1.0",
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
          name: "Trade Analysis",
          description:
            "Accepts a natural-language trading prompt with budget, horizon, and risk tolerance. Scores tokens via on-chain Uniswap V3 pool data and DeFiLlama quant indicators, then generates an optimized trading strategy using Claude. Returns the strategy with unsigned swap calldata ready for wallet signing.",
          tags: ["defi", "trading", "uniswap", "strategy"],
          examples: [
            "Invest 1 ETH in promising DeFi tokens for the next week",
            "Conservative allocation of 0.5 ETH across blue-chip tokens",
            "Aggressive short-term trade on high-momentum tokens",
          ],
          inputModes: ["application/json", "text/plain"],
          outputModes: ["application/json"],
        },
        {
          id: "task-status",
          name: "Task Status",
          description:
            "Check the status and results of a previously submitted trade analysis task.",
          tags: ["status", "query"],
          inputModes: ["application/json"],
          outputModes: ["application/json"],
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
              text: "Please provide a trading prompt. You can send a text message like 'Invest 1 ETH in DeFi tokens for a week' or structured JSON with: prompt, budget (wei string), walletAddress, horizon (1h/4h/1d/1w/1m), riskTolerance (conservative/moderate/aggressive).",
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

    const request: TradeRequest = {
      prompt: tradeParams.prompt,
      budget: BigInt(tradeParams.budget ?? "1000000000000000000"), // default 1 ETH
      budgetToken,
      walletAddress,
      horizon: tradeParams.horizon ?? "1w",
      riskTolerance: tradeParams.riskTolerance ?? "moderate",
      chainId: 1,
    };

    ctx.logger.info(
      { taskId, prompt: request.prompt, horizon: request.horizon },
      "A2A task received — starting trade analysis",
    );

    // 1. Score tokens
    const topTokens = Object.values(TOKENS).slice(0, 8);
    const candidates = await ctx.tokenScorer.scoreTokens(topTokens, budgetToken);

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

    ctx.logger.info(
      { taskId, strategyId: finalStrategy.id, trades: finalStrategy.trades.length },
      "A2A task completed",
    );

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
        const valid = ["1h", "4h", "1d", "1w", "1m"];
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
    analysis: s.analysis,
    trades: s.trades.map((t) => ({
      ...t,
      amountIn: t.amountIn.toString(),
      minAmountOut: t.minAmountOut.toString(),
    })),
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
    ``,
    `Market: ${strategy.analysis.marketCondition} (confidence: ${(strategy.analysis.confidence * 100).toFixed(0)}%)`,
    `Trades: ${strategy.trades.length}`,
    `Expected return: ${strategy.estimatedReturn.expected}% (optimistic: ${strategy.estimatedReturn.optimistic}%, pessimistic: ${strategy.estimatedReturn.pessimistic}%)`,
    `Risk score: ${strategy.riskMetrics.score}/100`,
    `Position size: ${strategy.riskMetrics.positionSizePercent}% of budget`,
  ];

  if (riskAdjusted) {
    lines.push(``, `Note: Strategy was auto-adjusted to comply with risk limits.`);
  }

  if (warnings.length > 0) {
    lines.push(``, `Warnings:`, ...warnings.map((w) => `  - ${w}`));
  }

  lines.push(
    ``,
    `The strategy and unsigned swap calldata are in the artifacts. Sign the transactions with your wallet and submit to execute.`,
  );

  return lines.join("\n");
}
