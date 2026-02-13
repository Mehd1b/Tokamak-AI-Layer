import { keccak256, toHex, type Hash } from "viem";
import type { FastifyInstance } from "fastify";
import { DEFAULT_RISK_PROFILES } from "@tal-yield-agent/agent-core";
import type { RiskProfile, RiskLevel } from "@tal-yield-agent/agent-core";
import { TaskStatus } from "@tal-yield-agent/tal-sdk";
import type { AppContext, TaskRecord } from "../context.js";
import {
  StrategyRequestBody,
  StrategyRequestResponse,
  TaskIdParams,
  TaskStatusResponse,
  ErrorResponse,
} from "../schemas.js";

// Agent fee cache (avoids RPC call per request)
const agentFeeCache = new Map<string, { fee: bigint; expiry: number }>();
const FEE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAgentFeeWithCache(ctx: AppContext, agentId: bigint): Promise<bigint> {
  const key = agentId.toString();
  const cached = agentFeeCache.get(key);
  if (cached && Date.now() < cached.expiry) return cached.fee;

  const fee = await ctx.talClient.escrow.getAgentFee(agentId);
  agentFeeCache.set(key, { fee, expiry: Date.now() + FEE_CACHE_TTL });
  return fee;
}

// In-memory set of consumed taskRefs (defense-in-depth against concurrent replay)
const consumedTaskRefs = new Set<string>();

export async function strategyRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * POST /api/v1/strategy/request — Submit a strategy request
   */
  app.post<{ Body: StrategyRequestBody }>("/api/v1/strategy/request", {
    schema: {
      body: StrategyRequestBody,
      response: {
        201: StrategyRequestResponse,
        400: ErrorResponse,
      },
    },
    handler: async (req, reply) => {
      const { riskLevel, capitalUSD, requester, chainPreferences, excludeProtocols, maxSinglePoolAllocation, taskRef } = req.body;
      const agentId = ctx.config.AGENT_ID;
      const escrowAddress = ctx.config.TASK_FEE_ESCROW;

      // ── Payment enforcement ──────────────────────────────────
      let paymentRequired = false;

      if (agentId != null && escrowAddress) {
        try {
          const fee = await getAgentFeeWithCache(ctx, agentId);
          paymentRequired = fee > 0n;
        } catch (err) {
          ctx.logger.error({ error: err instanceof Error ? err.message : String(err) }, "Fee check failed (fail-closed)");
          paymentRequired = true;
        }
      }

      if (paymentRequired) {
        if (!taskRef) {
          return reply.code(402).send({
            error: "payment_required",
            message: "Payment required: taskRef must be provided for this agent",
          });
        }

        if (consumedTaskRefs.has(taskRef)) {
          return reply.code(409).send({
            error: "replay_rejected",
            message: "Task reference already consumed (concurrent replay rejected)",
          });
        }

        try {
          const escrowData = await ctx.talClient.getTaskEscrow(taskRef as Hash);

          if (escrowData.status === TaskStatus.Confirmed) {
            return reply.code(402).send({ error: "replay_rejected", message: "Task has already been completed (replay rejected)" });
          }
          if (escrowData.status === TaskStatus.Refunded) {
            return reply.code(402).send({ error: "payment_refunded", message: "Task has been refunded" });
          }
          if (escrowData.status !== TaskStatus.Escrowed) {
            return reply.code(402).send({ error: "payment_required", message: "Task fee has not been paid on-chain" });
          }

          if (escrowData.agentId !== agentId) {
            return reply.code(400).send({
              error: "agent_mismatch",
              message: `Task escrow agent mismatch: escrow is for agent ${escrowData.agentId}, but this agent is ${agentId}`,
            });
          }

          ctx.logger.info({ taskRef: taskRef.slice(0, 18) }, "Escrow verified (strategy)");
        } catch (verifyErr) {
          const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
          ctx.logger.error({ taskRef, error: errMsg }, "Escrow verification failed");
          return reply.code(502).send({ error: "verification_failed", message: `Payment verification failed: ${errMsg}` });
        }

        consumedTaskRefs.add(taskRef);
      }

      // ── Strategy execution ───────────────────────────────────

      // Build risk profile from defaults + overrides
      const baseProfile = DEFAULT_RISK_PROFILES[riskLevel as RiskLevel];
      if (!baseProfile) {
        return reply.code(400).send({ error: "invalid_risk_level", message: `Unknown risk level: ${riskLevel}` });
      }

      const riskProfile: RiskProfile = {
        ...baseProfile,
        ...(chainPreferences && { chainPreferences: chainPreferences as RiskProfile["chainPreferences"] }),
        ...(excludeProtocols && { excludeProtocols }),
        ...(maxSinglePoolAllocation !== undefined && { maxSinglePoolAllocation }),
      };

      // Generate task ID
      const taskId = keccak256(toHex(JSON.stringify({
        requester,
        riskLevel,
        capitalUSD,
        timestamp: Date.now(),
      })));

      // Create task record
      const task: TaskRecord = {
        taskId,
        requester,
        riskProfile,
        capitalUSD,
        status: "pending",
        createdAt: Date.now(),
      };
      ctx.taskCache.set(taskId, task);

      // Process strategy synchronously (in production, this would be dispatched to the worker)
      try {
        task.status = "processing";

        // Create snapshot from current pipeline
        const snapshot = await ctx.pipeline.createSnapshot();
        task.snapshotId = snapshot.snapshotId;
        ctx.snapshotCache.set(snapshot.snapshotId, snapshot);

        // Update pool cache
        ctx.poolCache = snapshot.poolStates;

        // Generate strategy
        const report = ctx.strategyGenerator.generate(
          snapshot,
          riskProfile,
          capitalUSD,
          taskId,
        );

        task.report = report;
        task.status = "completed";
        task.completedAt = Date.now();

        ctx.logger.info({ taskId, executionHash: report.executionHash }, "Strategy generated");
      } catch (err) {
        task.status = "failed";
        task.error = err instanceof Error ? err.message : "Unknown error";
        ctx.logger.error({ taskId, error: task.error }, "Strategy generation failed");
      }

      // ── On-chain escrow settlement ───────────────────────────
      if (taskRef) {
        try {
          if (task.status === "completed") {
            const txHash = await ctx.talClient.confirmTask(taskRef as Hash);
            ctx.logger.info({ taskRef, txHash }, "Escrow confirmed on-chain");
          } else if (task.status === "failed") {
            consumedTaskRefs.delete(taskRef);
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

      return reply.code(201).send({
        taskId,
        status: task.status,
        message: task.status === "completed"
          ? "Strategy generated successfully"
          : task.status === "failed"
            ? `Generation failed: ${task.error}`
            : "Task queued for processing",
      });
    },
  });

  /**
   * GET /api/v1/strategy/:taskId — Get task status
   */
  app.get<{ Params: TaskIdParams }>("/api/v1/strategy/:taskId", {
    schema: {
      params: TaskIdParams,
      response: {
        200: TaskStatusResponse,
        404: ErrorResponse,
      },
    },
    handler: async (req, reply) => {
      const task = ctx.taskCache.get(req.params.taskId);
      if (!task) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" });
      }

      return reply.send({
        taskId: task.taskId,
        status: task.status,
        snapshotId: task.snapshotId,
        executionHash: task.report?.executionHash,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
      });
    },
  });

  /**
   * GET /api/v1/strategy/:taskId/report — Get full strategy report
   */
  app.get<{ Params: TaskIdParams }>("/api/v1/strategy/:taskId/report", {
    schema: {
      params: TaskIdParams,
      response: {
        404: ErrorResponse,
      },
    },
    handler: async (req, reply) => {
      const task = ctx.taskCache.get(req.params.taskId);
      if (!task) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" });
      }

      if (task.status !== "completed" || !task.report) {
        return reply.code(404).send({
          error: "not_ready",
          message: `Task status is '${task.status}', report not available`,
        });
      }

      return reply.send(task.report);
    },
  });
}
