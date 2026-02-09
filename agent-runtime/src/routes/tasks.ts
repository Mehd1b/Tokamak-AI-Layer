import { Router } from 'express';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { BaseAgent } from '../agents/BaseAgent.js';
import type { TaskSubmission } from '../types.js';
import { getTask, getAllTasks } from '../services/storage.js';
import { config } from '../config.js';

const ESCROW_ABI = [
  {
    type: 'function',
    name: 'isTaskPaid',
    inputs: [{ name: 'taskRef', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentFee',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'confirmTask',
    inputs: [{ name: 'taskRef', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refundTask',
    inputs: [{ name: 'taskRef', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const viemClient = createPublicClient({
  transport: http(config.RPC_URL),
});

function getWalletClient() {
  if (!config.PRIVATE_KEY) return null;
  const account = privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`);
  return createWalletClient({
    account,
    chain: {
      id: config.CHAIN_ID,
      name: 'Thanos Sepolia',
      nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
      rpcUrls: { default: { http: [config.RPC_URL] } },
    },
    transport: http(config.RPC_URL),
  });
}

export function createTaskRoutes(agents: Map<string, BaseAgent>): Router {
  const router = Router();

  // POST /api/tasks - Submit a new task
  router.post('/', async (req, res, next) => {
    try {
      const { agentId, input, paymentTxHash, taskRef } = req.body as TaskSubmission;

      if (!agentId) {
        res.status(400).json({ error: 'agentId is required' });
        return;
      }

      if (!input?.text) {
        res.status(400).json({ error: 'input.text is required' });
        return;
      }

      const agent = agents.get(agentId);
      if (!agent) {
        res.status(404).json({ error: `Agent '${agentId}' not found. Available: ${Array.from(agents.keys()).join(', ')}` });
        return;
      }

      // On-chain payment verification (if taskRef is provided)
      const escrowAddress = config.TASK_FEE_ESCROW as `0x${string}`;
      if (taskRef && escrowAddress !== '0x0000000000000000000000000000000000000000') {
        try {
          const isPaid = await viemClient.readContract({
            address: escrowAddress,
            abi: ESCROW_ABI,
            functionName: 'isTaskPaid',
            args: [taskRef as `0x${string}`],
          });

          if (!isPaid) {
            res.status(402).json({ error: 'Payment required: task fee has not been paid on-chain' });
            return;
          }

          console.log(`[TASK] Payment verified for taskRef ${taskRef.slice(0, 18)}...`);
        } catch (verifyErr) {
          console.error('[TASK] Payment verification failed:', verifyErr);
          res.status(502).json({ error: 'Payment verification failed: could not verify on-chain payment' });
          return;
        }
      }

      console.log(`[TASK] Executing task for agent '${agentId}' (${input.text.length} chars)`);
      const result = await agent.execute(input);
      console.log(`[TASK] Task ${result.taskId} completed with status: ${result.status}`);

      // On-chain escrow settlement (confirm or refund based on task result)
      if (taskRef && escrowAddress !== '0x0000000000000000000000000000000000000000') {
        const walletClient = getWalletClient();
        if (walletClient) {
          try {
            if (result.status === 'completed') {
              const txHash = await walletClient.writeContract({
                address: escrowAddress,
                abi: ESCROW_ABI,
                functionName: 'confirmTask',
                args: [taskRef as `0x${string}`],
              });
              console.log(`[ESCROW] Task confirmed on-chain: ${txHash}`);
            } else if (result.status === 'failed') {
              const txHash = await walletClient.writeContract({
                address: escrowAddress,
                abi: ESCROW_ABI,
                functionName: 'refundTask',
                args: [taskRef as `0x${string}`],
              });
              console.log(`[ESCROW] Task refunded on-chain: ${txHash}`);
            }
          } catch (escrowErr) {
            console.error('[ESCROW] Settlement failed (task result still returned):', escrowErr);
          }
        } else {
          console.warn('[ESCROW] No PRIVATE_KEY configured — skipping on-chain settlement');
        }
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/tasks - List recent tasks
  router.get('/', async (_req, res, next) => {
    try {
      const tasks = await getAllTasks();
      res.json({ tasks, count: tasks.length });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/tasks/:id - Get task by ID
  router.get('/:id', async (req, res, next) => {
    try {
      const task = await getTask(req.params.id);
      if (!task) {
        res.status(404).json({ error: `Task '${req.params.id}' not found` });
        return;
      }
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
