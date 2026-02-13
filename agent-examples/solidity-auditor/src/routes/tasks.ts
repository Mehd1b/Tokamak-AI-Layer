import { Router } from 'express';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { PublicClient } from 'viem';
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
    name: 'taskEscrows',
    inputs: [{ name: 'taskRef', type: 'bytes32' }],
    outputs: [
      { name: 'payer', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'status', type: 'uint8' },
    ],
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

// Escrow status enum (mirrors TaskFeeEscrow.sol)
const EscrowStatus = {
  None: 0,
  Escrowed: 1,
  Completed: 2,
  Refunded: 3,
} as const;

// ================================================================
// Chain configuration (Thanos Sepolia)
// ================================================================

const thanosSepolia = {
  id: config.CHAIN_ID,
  name: 'Thanos Sepolia',
  nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  rpcUrls: { default: { http: [config.RPC_URL] } },
};

const escrowAddress = config.TASK_FEE_ESCROW as `0x${string}`;
const escrowConfigured = escrowAddress !== '0x0000000000000000000000000000000000000000';

// Lazily-created clients
let _publicClient: PublicClient | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _walletClient: any = null;
let _walletClientInit = false;

function getPublicClientInstance(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: thanosSepolia,
      transport: http(config.RPC_URL),
    });
  }
  return _publicClient;
}

function getWalletClientInstance() {
  if (!_walletClientInit) {
    _walletClientInit = true;
    if (config.PRIVATE_KEY) {
      const account = privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`);
      _walletClient = createWalletClient({
        account,
        chain: thanosSepolia,
        transport: http(config.RPC_URL),
      });
    }
  }
  return _walletClient;
}

// ================================================================
// Agent fee cache (avoids RPC call per request)
// ================================================================

const agentFeeCache = new Map<string, { fee: bigint; expiry: number }>();
const FEE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAgentFeeWithCache(
  publicClient: PublicClient,
  onChainId: bigint,
): Promise<bigint> {
  const key = onChainId.toString();
  const cached = agentFeeCache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.fee;
  }

  const fee = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'getAgentFee',
    args: [onChainId],
  });

  agentFeeCache.set(key, { fee, expiry: Date.now() + FEE_CACHE_TTL });
  return fee;
}

// ================================================================
// Escrow status verification (replay protection)
// ================================================================

async function verifyEscrowStatus(
  publicClient: PublicClient,
  taskRef: `0x${string}`,
): Promise<{ valid: boolean; agentId: bigint; reason?: string }> {
  const [_payer, agentId, _fee, status] = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'taskEscrows',
    args: [taskRef],
  });

  if (status === EscrowStatus.None) {
    return { valid: false, agentId, reason: 'Task fee has not been paid on-chain' };
  }
  if (status === EscrowStatus.Completed) {
    return { valid: false, agentId, reason: 'Task has already been completed (replay rejected)' };
  }
  if (status === EscrowStatus.Refunded) {
    return { valid: false, agentId, reason: 'Task has been refunded' };
  }
  if (status !== EscrowStatus.Escrowed) {
    return { valid: false, agentId, reason: `Unknown escrow status: ${status}` };
  }

  return { valid: true, agentId };
}

// In-memory set of consumed taskRefs (defense-in-depth against concurrent replay)
const consumedTaskRefs = new Set<string>();

// ================================================================

export function createTaskRoutes(agents: Map<string, BaseAgent>): Router {
  console.log(`[TASK] Routes initialized — chain: Thanos Sepolia (${config.CHAIN_ID}), escrow: ${escrowAddress}`);
  const router = Router();

  // POST /api/tasks - Submit a new task
  router.post('/', async (req, res, next) => {
    try {
      const { agentId, input, taskRef } = req.body as TaskSubmission;

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

      // Determine if this agent requires payment
      let paymentRequired = false;

      if (agent.onChainId != null && escrowConfigured) {
        try {
          const publicClient = getPublicClientInstance();
          const fee = await getAgentFeeWithCache(publicClient, agent.onChainId);
          paymentRequired = fee > 0n;
        } catch (err) {
          // Fail-closed: if we can't check the fee, assume payment is required
          console.error('[TASK] Fee check failed (fail-closed):', err instanceof Error ? err.message : err);
          paymentRequired = true;
        }
      }

      // Enforce payment if required
      if (paymentRequired) {
        if (!taskRef) {
          res.status(402).json({
            error: 'Payment required: taskRef must be provided for this agent',
            debug: { escrow: escrowAddress, chainId: config.CHAIN_ID, agentId },
          });
          return;
        }

        // In-memory replay check (defense-in-depth)
        if (consumedTaskRefs.has(taskRef)) {
          res.status(409).json({
            error: 'Task reference already consumed (concurrent replay rejected)',
            debug: { taskRef },
          });
          return;
        }

        // On-chain escrow status verification
        try {
          const publicClient = getPublicClientInstance();
          console.log(`[TASK] Verifying escrow for taskRef ${taskRef.slice(0, 18)}... on escrow ${escrowAddress}`);

          const { valid, agentId: escrowAgentId, reason } = await verifyEscrowStatus(publicClient, taskRef as `0x${string}`);

          if (!valid) {
            res.status(402).json({
              error: `Payment rejected: ${reason}`,
              debug: { escrow: escrowAddress, chainId: config.CHAIN_ID, taskRef },
            });
            return;
          }

          // Verify the escrow is for the correct agent
          if (escrowAgentId !== agent.onChainId) {
            res.status(400).json({
              error: `Task escrow agent mismatch: escrow is for agent ${escrowAgentId}, but request targets agent ${agent.onChainId} (${agentId})`,
              debug: { escrow: escrowAddress, taskRef, expectedAgentId: agent.onChainId!.toString(), actualAgentId: escrowAgentId.toString() },
            });
            return;
          }

          console.log(`[TASK] Escrow verified for taskRef ${taskRef.slice(0, 18)}...`);
        } catch (verifyErr) {
          const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
          console.error('[TASK] Escrow verification failed:', errMsg);
          res.status(502).json({
            error: `Payment verification failed [escrow=${escrowAddress}]: ${errMsg}`,
          });
          return;
        }

        // Mark taskRef as consumed before execution
        consumedTaskRefs.add(taskRef);
      }

      // Execute task
      console.log(`[TASK] Executing task for agent '${agentId}' (${input.text.length} chars)`);
      const result = await agent.execute(input);
      console.log(`[TASK] Task ${result.taskId} completed with status: ${result.status}`);

      // On-chain escrow settlement
      if (taskRef && escrowConfigured) {
        const walletClient = getWalletClientInstance();
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
              // Remove from consumed set so a new attempt with the same taskRef can succeed after refund
              consumedTaskRefs.delete(taskRef);
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
