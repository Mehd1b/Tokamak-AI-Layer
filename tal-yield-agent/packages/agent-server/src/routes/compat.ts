import { keccak256, toHex, type Hash } from "viem";
import type { FastifyInstance } from "fastify";
import { DEFAULT_RISK_PROFILES } from "@tal-yield-agent/agent-core";
import type { RiskLevel, RiskProfile } from "@tal-yield-agent/agent-core";
import type { AppContext, TaskRecord } from "../context.js";
import { saveTask, loadTask, loadAllTasks, saveSnapshot, loadSnapshot } from "../storage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRiskLevel(text: string): RiskLevel {
  const lower = text.toLowerCase();
  if (/\baggressive\b/.test(lower)) return "aggressive";
  if (/\bconservative\b/.test(lower)) return "conservative";
  return "moderate";
}

function parseCapitalUSD(text: string): number {
  // Match patterns like "$5000", "$5,000", "5000 USD", "5000 dollars"
  const m = text.match(/\$\s?([\d,]+(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:usd|dollars?)/i);
  if (m) {
    const raw = (m[1] ?? m[2] ?? "").replace(/,/g, "");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 10_000;
}

function taskRecordToResult(task: TaskRecord, inputText?: string) {
  return {
    taskId: task.taskId,
    agentId: "yield-strategist",
    status: task.status === "completed" ? "completed" : task.status === "failed" ? "failed" : "pending",
    input: { text: inputText ?? "" },
    output: task.report ? JSON.stringify(task.report) : null,
    outputHash: task.report?.executionHash ?? null,
    inputHash: inputText ? keccak256(toHex(inputText)) : null,
    createdAt: task.createdAt,
    completedAt: task.completedAt ?? null,
    error: task.error ?? null,
    metadata: {},
  };
}

// In-memory secondary index: inputHash → taskId
const inputHashToTaskId = new Map<string, string>();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function compatRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * GET /api/agents/:id — Agent info (RuntimeAgent shape)
   */
  app.get<{ Params: { id: string } }>("/api/agents/:id", {
    handler: async (_req, reply) => {
      return reply.send({
        id: "yield-strategist",
        name: "TAL Yield Strategist",
        description:
          "DeFi yield optimization agent — analyzes on-chain pool data, scores risk, " +
          "predicts APY, and generates diversified allocation strategies with deterministic execution hashes.",
        version: "0.1.0",
        capabilities: [
          {
            id: "yield-strategy",
            name: "Yield Strategy",
            description: "Generate risk-adjusted DeFi yield strategies across multiple chains and protocols",
          },
        ],
        status: "active",
        endpoint: "/api/v1/strategy/request",
        onChainId: ctx.config.AGENT_ID?.toString() ?? null,
      });
    },
  });

  /**
   * POST /api/tasks — Submit a task (frontend generic protocol)
   *
   * Accepts { input: { text }, agentId?, paymentTxHash?, taskRef? }
   * Translates free-text into a strategy request.
   */
  app.post<{
    Body: {
      input: { text: string };
      agentId?: string;
      paymentTxHash?: string;
      taskRef?: string;
    };
  }>("/api/tasks", {
    handler: async (req, reply) => {
      const inputText = req.body?.input?.text ?? "";
      const riskLevel = parseRiskLevel(inputText);
      const capitalUSD = parseCapitalUSD(inputText);

      const baseProfile = DEFAULT_RISK_PROFILES[riskLevel];
      const riskProfile: RiskProfile = { ...baseProfile };

      // Generate task ID
      const taskId = keccak256(
        toHex(
          JSON.stringify({
            requester: req.body.agentId ?? "frontend",
            riskLevel,
            capitalUSD,
            timestamp: Date.now(),
          }),
        ),
      );

      // Create task record
      const task: TaskRecord = {
        taskId,
        requester: req.body.agentId ?? "frontend",
        riskProfile,
        capitalUSD,
        status: "pending",
        createdAt: Date.now(),
      };
      ctx.taskCache.set(taskId, task);

      // Index by inputHash so validation can look up by on-chain taskHash
      const inputHash = keccak256(toHex(inputText));
      inputHashToTaskId.set(inputHash, taskId);

      try {
        task.status = "processing";

        const snapshot = await ctx.pipeline.createSnapshot();
        task.snapshotId = snapshot.snapshotId;
        ctx.snapshotCache.set(snapshot.snapshotId, snapshot);
        ctx.poolCache = snapshot.poolStates;

        const report = ctx.strategyGenerator.generate(snapshot, riskProfile, capitalUSD, taskId);

        task.report = report;
        task.status = "completed";
        task.completedAt = Date.now();

        ctx.logger.info({ taskId, executionHash: report.executionHash }, "Strategy generated (compat)");

        // Persist task and snapshot to disk for validation after restarts
        await saveTask(task, inputText).catch((e) =>
          ctx.logger.warn({ error: String(e) }, "Failed to persist task"),
        );
        await saveSnapshot(snapshot).catch((e) =>
          ctx.logger.warn({ error: String(e) }, "Failed to persist snapshot"),
        );
      } catch (err) {
        task.status = "failed";
        task.error = err instanceof Error ? err.message : "Unknown error";
        ctx.logger.error({ taskId, error: task.error }, "Strategy generation failed (compat)");
      }

      // On-chain escrow settlement (confirm or refund)
      const taskRef = req.body.taskRef;
      if (taskRef) {
        try {
          if (task.status === "completed") {
            const txHash = await ctx.talClient.confirmTask(taskRef as Hash);
            ctx.logger.info({ taskRef, txHash }, "Escrow confirmed on-chain");
          } else if (task.status === "failed") {
            const txHash = await ctx.talClient.escrow.refundTask(taskRef as Hash);
            ctx.logger.info({ taskRef, txHash }, "Escrow refunded on-chain");
          }
        } catch (escrowErr) {
          ctx.logger.warn(
            { taskRef, error: escrowErr instanceof Error ? escrowErr.message : String(escrowErr) },
            "Escrow settlement failed (task result still returned)",
          );
        }
      }

      return reply.code(201).send(taskRecordToResult(task, inputText));
    },
  });

  /**
   * GET /api/tasks — List recent tasks (frontend generic protocol)
   */
  app.get("/api/tasks", {
    handler: async (_req, reply) => {
      // Merge in-memory cache with disk storage
      const diskTasks = await loadAllTasks().catch(() => []);
      for (const { task, inputText } of diskTasks) {
        if (!ctx.taskCache.has(task.taskId)) {
          ctx.taskCache.set(task.taskId, task);
        }
        const ih = keccak256(toHex(inputText));
        if (!inputHashToTaskId.has(ih)) {
          inputHashToTaskId.set(ih, task.taskId);
        }
      }

      const tasks = [...ctx.taskCache.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50);

      // Resolve input text: check disk records
      const diskMap = new Map(diskTasks.map(({ task, inputText }) => [task.taskId, inputText]));
      const results = tasks.map((t) => taskRecordToResult(t, diskMap.get(t.taskId)));

      return reply.send({ tasks: results });
    },
  });

  /**
   * POST /api/validations/execute — Re-execute a task for validation
   *
   * Accepts { taskId, requestHash? }
   * Re-runs strategy generation on the same snapshot + risk profile and compares hashes.
   * If requestHash is provided and OPERATOR_PRIVATE_KEY is set, submits result on-chain.
   */
  app.post<{
    Body: { taskId: string; requestHash?: string };
  }>("/api/validations/execute", {
    handler: async (req, reply) => {
      const { taskId, requestHash } = req.body;

      // 1. Resolve the task — try memory, then inputHash index, then disk
      let task: TaskRecord | undefined;
      let resolvedTaskId = taskId;

      if (ctx.taskCache.has(taskId)) {
        task = ctx.taskCache.get(taskId);
      } else if (inputHashToTaskId.has(taskId)) {
        resolvedTaskId = inputHashToTaskId.get(taskId)!;
        task = ctx.taskCache.get(resolvedTaskId);
      }

      // Fall back to disk storage
      if (!task) {
        const diskResult = await loadTask(taskId);
        if (diskResult) {
          task = diskResult.task;
          resolvedTaskId = task.taskId;
          ctx.taskCache.set(task.taskId, task);
          const ih = keccak256(toHex(diskResult.inputText));
          inputHashToTaskId.set(ih, task.taskId);
        }
      }
      // Try disk lookup by iterating all tasks to find by inputHash match
      if (!task) {
        const allDisk = await loadAllTasks().catch(() => []);
        for (const { task: dt, inputText } of allDisk) {
          const ih = keccak256(toHex(inputText));
          inputHashToTaskId.set(ih, dt.taskId);
          ctx.taskCache.set(dt.taskId, dt);
          if (ih === taskId || dt.taskId === taskId) {
            task = dt;
            resolvedTaskId = dt.taskId;
          }
        }
      }

      if (!task) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" });
      }
      if (task.status !== "completed" || !task.report) {
        return reply.code(400).send({ error: "invalid_state", message: "Task is not completed" });
      }

      // 2. Load snapshot — try memory, then disk
      let snapshot = task.snapshotId ? ctx.snapshotCache.get(task.snapshotId) : undefined;
      if (!snapshot && task.snapshotId) {
        snapshot = (await loadSnapshot(task.snapshotId)) ?? undefined;
        if (snapshot) {
          ctx.snapshotCache.set(task.snapshotId, snapshot);
        }
      }
      if (!snapshot) {
        return reply.code(404).send({ error: "snapshot_missing", message: "Original snapshot not available" });
      }

      // 3. Re-execute strategy deterministically
      const reReport = ctx.strategyGenerator.generate(
        snapshot,
        task.riskProfile,
        task.capitalUSD,
        task.taskId,
      );

      const hashMatch = reReport.executionHash === task.report.executionHash;
      const score = hashMatch ? 100 : 0;
      const matchType = hashMatch ? "exact" : "mismatch";

      ctx.logger.info(
        { taskId: task.taskId, score, matchType, requestHash },
        "Validation re-execution complete",
      );

      // 4. Submit validation result on-chain if requestHash provided
      let txHash: string | null = null;
      if (requestHash) {
        try {
          const proofHex = (reReport.executionHash || "0x") as Hash;
          const submitTx = await ctx.talClient.validation.submitValidation(
            requestHash as Hash,
            score,
            proofHex,
            `task:${task.taskId}`,
          );
          txHash = submitTx;
          ctx.logger.info({ requestHash, txHash, score }, "Validation submitted on-chain");
        } catch (err) {
          ctx.logger.warn(
            { requestHash, error: err instanceof Error ? err.message : String(err) },
            "On-chain validation submission failed",
          );
        }
      }

      return reply.send({
        taskId: task.taskId,
        score,
        matchType,
        reExecutionHash: reReport.executionHash,
        originalHash: task.report.executionHash,
        requestHash: requestHash ?? null,
        txHash,
        status: "completed",
      });
    },
  });
}
