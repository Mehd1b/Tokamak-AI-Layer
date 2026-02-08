/**
 * Register TAL demo agents on-chain via the SDK.
 *
 * Usage:
 *   cp .env.example .env   # fill in your keys
 *   npx tsx scripts/register-agents.ts
 *
 * Prerequisites:
 *   - PRIVATE_KEY set in .env (account with Optimism Sepolia ETH)
 *   - Agent runtime running (npm run dev) so registration files are served
 */
import dotenv from 'dotenv';
dotenv.config();

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { optimismSepolia } from 'viem/chains';
import { SummarizerAgent } from '../src/agents/SummarizerAgent.js';
import { AuditorAgent } from '../src/agents/AuditorAgent.js';

// --- ABI fragments we need ---
const identityRegistryABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    name: 'getAgentCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const rpcUrl = process.env.RPC_URL || 'https://sepolia.optimism.io';
  const identityRegistry =
    (process.env.IDENTITY_REGISTRY as `0x${string}`) ||
    '0x3f89CD27fD877827E7665A9883b3c0180E22A525';
  const port = process.env.PORT || '3001';
  const baseUrl = `http://localhost:${port}`;

  // Create viem clients
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: optimismSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: optimismSepolia,
    transport: http(rpcUrl),
  });

  console.log(`Registering agents from account: ${account.address}`);
  console.log(`Identity Registry: ${identityRegistry}`);
  console.log(`Agent Runtime Base URL: ${baseUrl}\n`);

  // Check if contract is paused
  const isPaused = await publicClient.readContract({
    address: identityRegistry,
    abi: identityRegistryABI,
    functionName: 'paused',
  });
  if (isPaused) {
    console.error('ERROR: TALIdentityRegistry is paused. Cannot register agents.');
    process.exit(1);
  }
  console.log('Contract status: active (not paused)\n');

  const agents = [new SummarizerAgent(), new AuditorAgent()];

  for (const agent of agents) {
    const agentURI = `${baseUrl}/api/agents/${agent.id}/registration`;
    console.log(`Registering "${agent.name}"...`);
    console.log(`  URI: ${agentURI}`);

    try {
      const hash = await walletClient.writeContract({
        address: identityRegistry,
        abi: identityRegistryABI,
        functionName: 'register',
        args: [agentURI],
      });

      console.log(`  TX: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Status: ${receipt.status}`);
      console.log(`  Block: ${receipt.blockNumber}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already registered') || msg.includes('URI already exists')) {
        console.log(`  Already registered, skipping.\n`);
      } else {
        console.error(`  Failed: ${msg}\n`);
      }
    }
  }

  // Print summary
  const count = await publicClient.readContract({
    address: identityRegistry,
    abi: identityRegistryABI,
    functionName: 'getAgentCount',
  });
  console.log(`Total agents on-chain: ${count}`);
}

main().catch(console.error);
