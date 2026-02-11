import { Router } from 'express';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { PublicClient, WalletClient } from 'viem';
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

// ================================================================
// Multi-chain configuration
// ================================================================

interface ChainConfig {
  name: string;
  rpcUrl: string;
  escrowAddress: `0x${string}`;
  chain: {
    id: number;
    name: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: { default: { http: string[] } };
  };
}

const OPTIMISM_SEPOLIA_ID = 11155420;
const THANOS_SEPOLIA_ID = 111551119090;

const chainConfigs: Record<number, ChainConfig> = {
  [OPTIMISM_SEPOLIA_ID]: {
    name: 'Optimism Sepolia',
    rpcUrl: config.RPC_URL,
    escrowAddress: config.TASK_FEE_ESCROW as `0x${string}`,
    chain: {
      id: OPTIMISM_SEPOLIA_ID,
      name: 'Optimism Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [config.RPC_URL] } },
    },
  },
  [THANOS_SEPOLIA_ID]: {
    name: 'Thanos Sepolia',
    rpcUrl: config.THANOS_RPC_URL,
    escrowAddress: config.THANOS_TASK_FEE_ESCROW as `0x${string}`,
    chain: {
      id: THANOS_SEPOLIA_ID,
      name: 'Thanos Sepolia',
      nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
      rpcUrls: { default: { http: [config.THANOS_RPC_URL] } },
    },
  },
};

// Lazily-created clients per chain (avoids creating unused connections)
const publicClients = new Map<number, PublicClient>();
const walletClients = new Map<number, WalletClient | null>();

function getPublicClient(chainId: number): PublicClient {
  let client = publicClients.get(chainId);
  if (!client) {
    const cc = chainConfigs[chainId];
    if (!cc) throw new Error(`Unsupported chainId: ${chainId}`);
    client = createPublicClient({
      chain: cc.chain,
      transport: http(cc.rpcUrl),
    });
    publicClients.set(chainId, client);
  }
  return client;
}

function getWalletClientForChain(chainId: number): WalletClient | null {
  if (!config.PRIVATE_KEY) return null;
  let client = walletClients.get(chainId);
  if (client === undefined) {
    const cc = chainConfigs[chainId];
    if (!cc) return null;
    const account = privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`);
    client = createWalletClient({
      account,
      chain: cc.chain,
      transport: http(cc.rpcUrl),
    });
    walletClients.set(chainId, client);
  }
  return client;
}

function resolveChain(requestChainId?: number): { chainId: number; escrowAddress: `0x${string}` } {
  const chainId = requestChainId && chainConfigs[requestChainId]
    ? requestChainId
    : config.CHAIN_ID;
  const cc = chainConfigs[chainId] ?? chainConfigs[OPTIMISM_SEPOLIA_ID];
  return { chainId: cc.chain.id, escrowAddress: cc.escrowAddress };
}

// ================================================================

async function verifyPaymentWithRetry(
  publicClient: PublicClient,
  escrowAddress: `0x${string}`,
  taskRef: `0x${string}`,
  maxRetries = 3,
  delayMs = 2000,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const isPaid = await publicClient.readContract({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: 'isTaskPaid',
        args: [taskRef],
      });
      if (isPaid) return true;
      if (attempt < maxRetries) {
        console.log(`[TASK] Payment not found yet (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (err) {
      console.error(`[TASK] Payment verify attempt ${attempt}/${maxRetries} failed:`, err instanceof Error ? err.message : err);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  return false;
}

export function createTaskRoutes(agents: Map<string, BaseAgent>): Router {
  const supportedChains = Object.values(chainConfigs).map(c => `${c.name}(${c.chain.id})`).join(', ');
  console.log(`[TASK] Routes initialized — supported chains: ${supportedChains}, default chainId: ${config.CHAIN_ID}`);
  const router = Router();

  // POST /api/tasks - Submit a new task
  router.post('/', async (req, res, next) => {
    try {
      const { agentId, input, paymentTxHash, taskRef, chainId: requestChainId } = req.body as TaskSubmission;

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

      // Resolve chain-specific config from request chainId
      const { chainId, escrowAddress } = resolveChain(requestChainId);

      // On-chain payment verification (if taskRef is provided)
      if (taskRef && escrowAddress !== '0x0000000000000000000000000000000000000000') {
        try {
          const publicClient = getPublicClient(chainId);
          console.log(`[TASK] Verifying payment for taskRef ${taskRef.slice(0, 18)}... on escrow ${escrowAddress} (chain ${chainId})`);
          const isPaid = await verifyPaymentWithRetry(publicClient, escrowAddress, taskRef as `0x${string}`);

          if (!isPaid) {
            res.status(402).json({ error: 'Payment required: task fee has not been paid on-chain' });
            return;
          }

          console.log(`[TASK] Payment verified for taskRef ${taskRef.slice(0, 18)}... (chain ${chainId})`);
        } catch (verifyErr) {
          const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
          console.error('[TASK] Payment verification failed:', errMsg);
          res.status(502).json({
            error: `Payment verification failed [escrow=${escrowAddress}, chainId=${chainId}]: ${errMsg}`,
          });
          return;
        }
      }

      console.log(`[TASK] Executing task for agent '${agentId}' (${input.text.length} chars)`);
      const result = await agent.execute(input);
      console.log(`[TASK] Task ${result.taskId} completed with status: ${result.status}`);

      // On-chain escrow settlement (confirm or refund based on task result)
      if (taskRef && escrowAddress !== '0x0000000000000000000000000000000000000000') {
        const walletClient = getWalletClientForChain(chainId);
        if (walletClient) {
          try {
            if (result.status === 'completed') {
              const txHash = await walletClient.writeContract({
                address: escrowAddress,
                abi: ESCROW_ABI,
                functionName: 'confirmTask',
                args: [taskRef as `0x${string}`],
              });
              console.log(`[ESCROW] Task confirmed on-chain (chain ${chainId}): ${txHash}`);
            } else if (result.status === 'failed') {
              const txHash = await walletClient.writeContract({
                address: escrowAddress,
                abi: ESCROW_ABI,
                functionName: 'refundTask',
                args: [taskRef as `0x${string}`],
              });
              console.log(`[ESCROW] Task refunded on-chain (chain ${chainId}): ${txHash}`);
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
