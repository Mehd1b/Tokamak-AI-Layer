import { Router } from 'express';
import type { BaseAgent } from '../agents/BaseAgent.js';
import { getTask, hashContent } from '../services/storage.js';
import {
  requestValidation,
  submitValidationOnChain,
  getValidation,
  getAgentValidations,
} from '../services/validation.js';
import type { Hex } from 'viem';

export function createValidationRoutes(agents: Map<string, BaseAgent>): Router {
  const router = Router();

  // POST /api/validations/request — Request a StakeSecured validation for an existing task
  router.post('/request', async (req, res, next) => {
    try {
      const { taskId, model, deadline, bounty } = req.body as {
        taskId: string;
        model?: string;
        deadline?: number;
        bounty?: string;
      };

      if (!taskId) {
        res.status(400).json({ error: 'taskId is required' });
        return;
      }

      const task = await getTask(taskId);
      if (!task) {
        res.status(404).json({ error: `Task '${taskId}' not found` });
        return;
      }

      if (task.status !== 'completed' || !task.outputHash) {
        res.status(400).json({ error: 'Task must be completed with an output hash' });
        return;
      }

      const agent = agents.get(task.agentId);
      const agentOnChainId = agent?.onChainId || BigInt(1);

      const modelEnum = model === 'ReputationOnly' ? 0 : 1; // Default StakeSecured
      const deadlineBigInt = BigInt(deadline || Math.floor(Date.now() / 1000) + 3600);
      const bountyWei = BigInt(bounty || '0');

      const taskHash = (task.inputHash || hashContent(JSON.stringify(task.input))) as Hex;
      const outputHash = task.outputHash as Hex;

      console.log(`[VALIDATION] Requesting validation for task ${taskId} (model: ${modelEnum})`);

      const result = await requestValidation(
        agentOnChainId,
        taskHash,
        outputHash,
        modelEnum,
        deadlineBigInt,
        bountyWei,
      );

      res.status(201).json({
        requestHash: result.requestHash,
        txHash: result.txHash,
        taskId,
        model: modelEnum,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/validations/execute — Trigger re-execution
  router.post('/execute', async (req, res, next) => {
    try {
      const { requestHash, taskId } = req.body as {
        requestHash?: string;
        taskId?: string;
      };

      if (!taskId) {
        res.status(400).json({ error: 'taskId is required' });
        return;
      }

      const task = await getTask(taskId);
      if (!task) {
        res.status(404).json({ error: `Task '${taskId}' not found` });
        return;
      }

      if (task.status !== 'completed' || !task.output) {
        res.status(400).json({ error: 'Task must be completed with output for validation' });
        return;
      }

      const validator = agents.get('validator');
      if (!validator) {
        res.status(500).json({ error: 'Validator agent not available' });
        return;
      }

      console.log(`[VALIDATION] Executing validation for task ${taskId}`);

      const validationResult = await validator.execute({
        text: task.input.text,
        options: {
          originalOutput: task.output,
          originalOutputHash: task.outputHash,
          agentId: task.agentId,
          taskHash: task.inputHash,
        },
      });

      let score = 0;
      let reExecutionHash = '';
      if (validationResult.output) {
        try {
          const parsed = JSON.parse(validationResult.output);
          score = parsed.score || 0;
          reExecutionHash = parsed.reExecutionHash || '';
        } catch {
          // Validation output wasn't JSON
        }
      }

      // If requestHash provided, submit on-chain
      let txHash: string | null = null;
      if (requestHash) {
        try {
          const proof = (reExecutionHash || '0x') as Hex;
          const onChainResult = await submitValidationOnChain(
            requestHash as Hex,
            score,
            proof,
            `task:${taskId}`,
          );
          txHash = onChainResult.txHash;
        } catch (err) {
          console.warn(`[VALIDATION] On-chain submission failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      res.json({
        taskId,
        requestHash: requestHash || null,
        validationTaskId: validationResult.taskId,
        score,
        reExecutionHash,
        matchType: validationResult.output ? JSON.parse(validationResult.output).matchType : 'unknown',
        txHash,
        status: validationResult.status,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/validations/:requestHash — Get validation status from chain
  router.get('/:requestHash', async (req, res, next) => {
    try {
      const { requestHash } = req.params;
      const validation = await getValidation(requestHash as Hex);
      res.json(validation);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/validations/agent/:agentId — Get all validations for an agent
  router.get('/agent/:agentId', async (req, res, next) => {
    try {
      const agentId = BigInt(req.params.agentId);
      const validations = await getAgentValidations(agentId);
      res.json({ agentId: req.params.agentId, validations, count: validations.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
