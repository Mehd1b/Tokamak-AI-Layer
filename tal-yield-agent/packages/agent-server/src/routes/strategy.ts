import { keccak256, toHex } from "viem";
import type { FastifyInstance } from "fastify";
import { DEFAULT_RISK_PROFILES } from "@tal-yield-agent/agent-core";
import type { RiskProfile, RiskLevel } from "@tal-yield-agent/agent-core";
import type { AppContext, TaskRecord } from "../context.js";
import {
  StrategyRequestBody,
  StrategyRequestResponse,
  TaskIdParams,
  TaskStatusResponse,
  ErrorResponse,
} from "../schemas.js";

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
      const { riskLevel, capitalUSD, requester, chainPreferences, excludeProtocols, maxSinglePoolAllocation } = req.body;

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
