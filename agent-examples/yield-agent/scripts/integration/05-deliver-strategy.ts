import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  decodeEventLog,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { thanosSepolia } from "../../packages/shared/src/chains.js";
import { THANOS_SEPOLIA_ADDRESSES } from "../../packages/shared/src/addresses.js";
import { TaskFeeEscrowABI } from "../../packages/shared/src/abi/TaskFeeEscrow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, ".agent-state.json");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.log(`  ⟳ ${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error("unreachable");
}

function loadState(): Record<string, unknown> {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  }
  return {};
}

function saveState(state: Record<string, unknown>): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

async function main() {
  console.log("\n▶ Step 6: Deliver Strategy On-Chain\n");

  const rpcUrl = process.env.RPC_URL!;
  const privKey = process.env.OPERATOR_PRIVATE_KEY!;
  if (!rpcUrl || !privKey) throw new Error("RPC_URL and OPERATOR_PRIVATE_KEY required in .env");

  const account = privateKeyToAccount(privKey as Hex);
  const publicClient = createPublicClient({
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });

  // --- 1. Load state ---
  const state = loadState();
  const taskRef = state.taskRef as Hex | undefined;
  const strategy = state.strategy as { executionHash: string; reportId: string; snapshotId: string } | undefined;
  if (!taskRef) throw new Error("No taskRef in state — run 03-submit-request.ts first");
  if (!strategy) throw new Error("No strategy in state — run 04-generate-strategy.ts first");

  console.log(`  Task ref: ${taskRef}`);
  console.log(`  Execution hash: ${strategy.executionHash}`);

  // --- 2. Check current escrow status ---
  const escrowBefore = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "getTaskEscrow",
    args: [taskRef],
  }) as { payer: string; agentId: bigint; amount: bigint; paidAt: bigint; status: number };

  const statusNames = ["None", "Escrowed", "Completed", "Refunded"];
  console.log(`  Current escrow status: ${statusNames[escrowBefore.status]}`);

  if (escrowBefore.status === 2) {
    console.log(`  ℹ️  Task already confirmed — skipping`);
    console.log("\n✅ Strategy delivery already complete\n");
    return;
  }

  if (escrowBefore.status !== 1) {
    throw new Error(`Task is not in Escrowed state (status: ${statusNames[escrowBefore.status]})`);
  }

  // --- 3. Call confirmTask ---
  console.log(`  Submitting confirmTask(${taskRef})...`);
  console.log(`  Sender: ${account.address} (owner of agent ${escrowBefore.agentId})`);

  const { request: confirmReq } = await retry(
    () =>
      publicClient.simulateContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "confirmTask",
        args: [taskRef],
        account,
      }),
    "simulateContract(confirmTask)",
  );

  const txHash = await walletClient.writeContract(confirmReq);
  console.log(`  Tx submitted: ${txHash}`);

  const receipt = await retry(
    () => publicClient.waitForTransactionReceipt({ hash: txHash }),
    "waitForReceipt(confirmTask)",
  );
  console.log(`  Tx confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);

  // --- 4. Decode TaskConfirmed event ---
  let eventAmount: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: TaskFeeEscrowABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "TaskConfirmed") {
        const args = decoded.args as { taskRef: Hex; agentId: bigint; amount: bigint };
        eventAmount = args.amount;
        break;
      }
    } catch {
      // Not our event
    }
  }

  // --- 5. Verify escrow after confirmation ---
  const escrowAfter = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "getTaskEscrow",
    args: [taskRef],
  }) as { payer: string; agentId: bigint; amount: bigint; paidAt: bigint; status: number };

  // Check agent balance accrued
  const agentBalance = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "getAgentBalance",
    args: [escrowAfter.agentId],
  }) as bigint;

  console.log(`\n  ✅ Strategy delivered on-chain`);
  console.log(`     Task ref: ${taskRef}`);
  console.log(`     Strategy hash: ${strategy.executionHash}`);
  console.log(`     Report ID: ${strategy.reportId}`);
  console.log(`     Tx hash: ${txHash}`);
  console.log(`     Gas used: ${receipt.gasUsed}`);
  console.log(`     Escrow status: ${statusNames[escrowAfter.status]}`);
  console.log(`     Amount settled: ${formatEther(eventAmount || escrowAfter.amount)} TON`);
  console.log(`     Agent balance (claimable): ${formatEther(agentBalance)} TON`);

  // --- 6. Save state ---
  saveState({
    ...state,
    delivery: {
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      amountSettled: (eventAmount || escrowAfter.amount).toString(),
      agentBalance: agentBalance.toString(),
      deliveredAt: new Date().toISOString(),
    },
  });

  console.log(`\n  State saved to ${STATE_FILE}`);
  console.log("\n✅ Strategy delivery complete\n");
}

main().catch((err) => {
  console.error("\n❌ Strategy delivery FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
