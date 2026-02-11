import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { ValidationSubmitBody, ErrorResponse } from "../schemas.js";

interface ValidationRecord {
  taskId: string;
  validator: string;
  isValid: boolean;
  executionHash: string;
  submittedAt: number;
}

// In-memory store (production would use PG/Redis)
const validations: ValidationRecord[] = [];

export async function validationRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * POST /api/v1/validate/submit — Validator submits re-execution result
   */
  app.post<{ Body: ValidationSubmitBody }>("/api/v1/validate/submit", {
    schema: {
      body: ValidationSubmitBody,
      response: {
        404: ErrorResponse,
      },
    },
    handler: async (req, reply) => {
      const { taskId, validator, isValid, executionHash } = req.body;

      const task = ctx.taskCache.get(taskId);
      if (!task) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" });
      }

      if (task.status !== "completed") {
        return reply.code(400).send({
          error: "invalid_state",
          message: `Task status is '${task.status}', cannot validate`,
        });
      }

      const record: ValidationRecord = {
        taskId,
        validator,
        isValid,
        executionHash,
        submittedAt: Date.now(),
      };
      validations.push(record);

      // Check hash match
      const hashMatch = task.report?.executionHash === executionHash;

      ctx.logger.info({
        taskId,
        validator,
        isValid,
        hashMatch,
      }, "Validation submitted");

      return reply.code(201).send({
        accepted: true,
        hashMatch,
        taskExecutionHash: task.report?.executionHash,
        validatorExecutionHash: executionHash,
      });
    },
  });

  /**
   * GET /api/v1/validate/queue — Pending validation tasks
   */
  app.get("/api/v1/validate/queue", {
    handler: async (_req, reply) => {
      const completedTasks = [...ctx.taskCache.values()]
        .filter((t) => t.status === "completed" && t.report)
        .map((t) => {
          const taskValidations = validations.filter((v) => v.taskId === t.taskId);
          return {
            taskId: t.taskId,
            snapshotId: t.snapshotId,
            executionHash: t.report!.executionHash,
            riskLevel: t.riskProfile.level,
            capitalUSD: t.capitalUSD,
            createdAt: t.createdAt,
            completedAt: t.completedAt,
            validationCount: taskValidations.length,
            validations: taskValidations.map((v) => ({
              validator: v.validator,
              isValid: v.isValid,
              hashMatch: v.executionHash === t.report!.executionHash,
              submittedAt: v.submittedAt,
            })),
          };
        });

      return reply.send({
        tasks: completedTasks,
        count: completedTasks.length,
      });
    },
  });
}
