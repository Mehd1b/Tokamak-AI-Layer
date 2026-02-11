import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  keccak256,
  encodePacked,
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

// Test request matching the DEPLOY_PROMPT spec
const TEST_REQUEST = {
  tier: "basic" as const,
  riskProfile: {
    level: "moderate" as const,
    maxILTolerance: 0.05,
    minTVL: 1_000_000,
    minProtocolAge: 90,
    chainPreferences: [1, 10],
    excludeProtocols: [] as string[],
    maxSinglePoolAllocation: 0.4,
  },
  capitalUSD: 10_000,
};

const TIER_FEES: Record<string, bigint> = {
  basic: parseEther("0.5"),
  advanced: parseEther("2"),
  premium: parseEther("5"),
};

async function main() {
  console.log("\n▶ Step 4: Submit Strategy Request\n");

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

  // --- 1. Load agent state ---
  const state = loadState();
  const agentId = state.agentId as string | undefined;
  if (!agentId) throw new Error("No agentId in .agent-state.json — run 01-register-agent.ts first");
  const agentIdBn = BigInt(agentId);
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Payer: ${account.address}`);
  console.log(`  Tier: ${TEST_REQUEST.tier} (${formatEther(TIER_FEES[TEST_REQUEST.tier]!)} TON)`);

  // --- 2. Check/set agent fee ---
  const currentFee = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "getAgentFee",
        args: [agentIdBn],
      }),
    "getAgentFee",
  ) as bigint;

  const requiredFee = TIER_FEES[TEST_REQUEST.tier]!;
  console.log(`  Current agent fee: ${currentFee === 0n ? "not set" : formatEther(currentFee) + " TON"}`);

  if (currentFee === 0n || currentFee !== requiredFee) {
    console.log(`  Setting agent fee to ${formatEther(requiredFee)} TON...`);
    const { request: setFeeReq } = await retry(
      () =>
        publicClient.simulateContract({
          address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
          abi: TaskFeeEscrowABI,
          functionName: "setAgentFee",
          args: [agentIdBn, requiredFee],
          account,
        }),
      "simulateContract(setAgentFee)",
    );
    const setFeeTx = await walletClient.writeContract(setFeeReq);
    console.log(`  setAgentFee tx: ${setFeeTx}`);
    await retry(
      () => publicClient.waitForTransactionReceipt({ hash: setFeeTx }),
      "waitForReceipt(setAgentFee)",
    );
    console.log(`  ✅ Agent fee set to ${formatEther(requiredFee)} TON`);
  } else {
    console.log(`  ✅ Agent fee already set to ${formatEther(currentFee)} TON`);
  }

  // --- 3. Generate unique taskRef ---
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const taskRef = keccak256(
    encodePacked(
      ["uint256", "address", "uint256", "string"],
      [agentIdBn, account.address, timestamp, JSON.stringify(TEST_REQUEST)],
    ),
  );
  console.log(`\n  Task ref: ${taskRef}`);

  // --- 4. Check if task already exists ---
  const alreadyPaid = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "isTaskPaid",
    args: [taskRef],
  });
  if (alreadyPaid) {
    console.log(`  ⚠️  Task already paid — skipping`);
    return;
  }

  // --- 5. Submit payForTask ---
  console.log(`  Submitting payForTask(${agentId}, ${taskRef}) with ${formatEther(requiredFee)} TON...`);

  const { request: payReq } = await retry(
    () =>
      publicClient.simulateContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "payForTask",
        args: [agentIdBn, taskRef],
        value: requiredFee,
        account,
      }),
    "simulateContract(payForTask)",
  );

  const payTxHash = await walletClient.writeContract(payReq);
  console.log(`  Tx submitted: ${payTxHash}`);

  const receipt = await retry(
    () => publicClient.waitForTransactionReceipt({ hash: payTxHash }),
    "waitForReceipt(payForTask)",
  );
  console.log(`  Tx confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);

  // --- 6. Decode TaskPaid event ---
  let eventTaskRef: Hex | undefined;
  let eventAmount: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: TaskFeeEscrowABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "TaskPaid") {
        const args = decoded.args as { agentId: bigint; payer: string; taskRef: Hex; amount: bigint };
        eventTaskRef = args.taskRef;
        eventAmount = args.amount;
        break;
      }
    } catch {
      // Not our event
    }
  }

  // --- 7. Verify escrow entry ---
  const escrow = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "getTaskEscrow",
    args: [taskRef],
  }) as { payer: string; agentId: bigint; amount: bigint; paidAt: bigint; status: number };

  console.log(`\n  ✅ Strategy request submitted`);
  console.log(`     Task ref: ${eventTaskRef || taskRef}`);
  console.log(`     Tier: ${TEST_REQUEST.tier} (${formatEther(eventAmount || requiredFee)} TON)`);
  console.log(`     Risk profile: ${TEST_REQUEST.riskProfile.level}`);
  console.log(`     Capital: $${TEST_REQUEST.capitalUSD.toLocaleString()}`);
  console.log(`     Tx hash: ${payTxHash}`);
  console.log(`     Block: ${receipt.blockNumber}`);
  console.log(`     Escrow status: ${["None", "Escrowed", "Completed", "Refunded"][escrow.status]}`);
  console.log(`     Escrow payer: ${escrow.payer}`);
  console.log(`     Escrow amount: ${formatEther(escrow.amount)} TON`);

  // --- 8. Save state ---
  saveState({
    ...state,
    taskRef,
    requestTxHash: payTxHash,
    requestBlock: receipt.blockNumber.toString(),
    requestTimestamp: new Date().toISOString(),
    request: TEST_REQUEST,
  });

  console.log(`\n  State saved to ${STATE_FILE}`);
  console.log("\n✅ Strategy request complete\n");
}

main().catch((err) => {
  console.error("\n❌ Strategy request FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
