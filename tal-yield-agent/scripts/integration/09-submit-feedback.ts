import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  encodePacked,
  parseEther,
  formatEther,
  decodeEventLog,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { thanosSepolia } from "../../packages/shared/src/chains.js";
import { THANOS_SEPOLIA_ADDRESSES } from "../../packages/shared/src/addresses.js";
import { TALReputationRegistryABI } from "../../packages/shared/src/abi/TALReputationRegistry.js";
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
  console.log("\n▶ Step 10: Submit Feedback (Reputation Loop)\n");

  const rpcUrl = process.env.RPC_URL!;
  const privKey = process.env.OPERATOR_PRIVATE_KEY!;
  if (!rpcUrl || !privKey) throw new Error("RPC_URL and OPERATOR_PRIVATE_KEY required in .env");

  const ownerAccount = privateKeyToAccount(privKey as Hex);
  const publicClient = createPublicClient({
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });
  const ownerWallet = createWalletClient({
    account: ownerAccount,
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });

  // --- 1. Load state ---
  const state = loadState();
  const agentId = state.agentId as string | undefined;
  const taskRef = state.taskRef as string | undefined;
  if (!agentId) throw new Error("No agentId in state");
  if (!taskRef) throw new Error("No taskRef in state");
  const agentIdBn = BigInt(agentId);

  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Agent owner: ${ownerAccount.address}`);

  // --- 2. Create a separate "user" wallet ---
  // Self-feedback is not allowed, so we need a different address
  console.log(`\n  Creating a separate user wallet for feedback...`);
  const userPrivKey = generatePrivateKey();
  const userAccount = privateKeyToAccount(userPrivKey);
  const userWallet = createWalletClient({
    account: userAccount,
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });

  console.log(`  User address: ${userAccount.address}`);

  // --- 3. Fund the user wallet ---
  const fundAmount = parseEther("1"); // 0.5 TON fee + gas
  console.log(`  Funding user wallet with ${formatEther(fundAmount)} TON...`);

  const fundTxHash = await ownerWallet.sendTransaction({
    to: userAccount.address,
    value: fundAmount,
  });
  await retry(
    () => publicClient.waitForTransactionReceipt({ hash: fundTxHash }),
    "waitForReceipt(fund)",
  );
  console.log(`  ✅ Funded: ${fundTxHash}`);

  // --- 4. User pays for a task (creates hasUsedAgent relationship) ---
  console.log(`\n  User paying for task...`);
  const fee = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "getAgentFee",
    args: [agentIdBn],
  }) as bigint;
  console.log(`  Agent fee: ${formatEther(fee)} TON`);

  const userTaskRef = keccak256(
    encodePacked(
      ["uint256", "address", "uint256"],
      [agentIdBn, userAccount.address, BigInt(Math.floor(Date.now() / 1000))],
    ),
  );

  const { request: payReq } = await retry(
    () =>
      publicClient.simulateContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "payForTask",
        args: [agentIdBn, userTaskRef],
        value: fee,
        account: userAccount,
      }),
    "simulateContract(payForTask)",
  );

  const payTxHash = await userWallet.writeContract(payReq);
  await retry(
    () => publicClient.waitForTransactionReceipt({ hash: payTxHash }),
    "waitForReceipt(payForTask)",
  );
  console.log(`  ✅ Task paid: ${payTxHash}`);

  // --- 5. Owner confirms the task (sets hasUsedAgent for user) ---
  console.log(`  Owner confirming task...`);
  const { request: confirmReq } = await retry(
    () =>
      publicClient.simulateContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "confirmTask",
        args: [userTaskRef],
        account: ownerAccount,
      }),
    "simulateContract(confirmTask)",
  );

  const confirmTxHash = await ownerWallet.writeContract(confirmReq);
  await retry(
    () => publicClient.waitForTransactionReceipt({ hash: confirmTxHash }),
    "waitForReceipt(confirmTask)",
  );
  console.log(`  ✅ Task confirmed: ${confirmTxHash}`);

  // --- 6. Verify hasUsedAgent ---
  const hasUsed = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "hasUsedAgent",
    args: [agentIdBn, userAccount.address],
  });
  console.log(`  hasUsedAgent(${agentId}, ${userAccount.address}): ${hasUsed}`);

  // --- 7. Submit feedback from user wallet ---
  console.log(`\n  Submitting feedback from user wallet...`);

  const feedbackScore = 4n; // 4 out of 5
  const valueDecimals = 0;
  const tag1 = "yield-strategy";
  const tag2 = "integration-test";
  const endpoint = "strategy/generate";
  const feedbackURI = "";
  const feedbackHash = keccak256(toHex(JSON.stringify({
    taskRef: userTaskRef,
    score: feedbackScore.toString(),
    comment: "Integration test — strategy verified",
    timestamp: new Date().toISOString(),
  })));

  const feedbackCountBefore = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: "getFeedbackCount",
    args: [agentIdBn],
  }) as bigint;

  const { request: fbReq } = await retry(
    () =>
      publicClient.simulateContract({
        address: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
        abi: TALReputationRegistryABI,
        functionName: "submitFeedback",
        args: [agentIdBn, feedbackScore, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash],
        account: userAccount,
      }),
    "simulateContract(submitFeedback)",
  );

  const fbTxHash = await userWallet.writeContract(fbReq);
  console.log(`  Tx submitted: ${fbTxHash}`);

  const fbReceipt = await retry(
    () => publicClient.waitForTransactionReceipt({ hash: fbTxHash }),
    "waitForReceipt(submitFeedback)",
  );
  console.log(`  Tx confirmed in block ${fbReceipt.blockNumber} (gas: ${fbReceipt.gasUsed})`);

  // --- 8. Decode event ---
  for (const log of fbReceipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: TALReputationRegistryABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "FeedbackSubmitted") {
        const args = decoded.args as { agentId: bigint; client: string; value: bigint; tag1: string; tag2: string };
        console.log(`\n  Event: FeedbackSubmitted`);
        console.log(`     Agent ID: ${args.agentId}`);
        console.log(`     Client: ${args.client}`);
        console.log(`     Value: ${args.value}`);
        break;
      }
    } catch {
      // Not our event
    }
  }

  // --- 9. Read back reputation ---
  const feedbackCountAfter = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: "getFeedbackCount",
    args: [agentIdBn],
  }) as bigint;

  const clientList = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: "getClientList",
    args: [agentIdBn],
  }) as string[];

  let summaryInfo = "";
  if (clientList.length > 0) {
    try {
      const summary = await publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
        abi: TALReputationRegistryABI,
        functionName: "getSummary",
        args: [agentIdBn, clientList],
      }) as { totalValue: bigint; count: bigint; min: bigint; max: bigint };
      summaryInfo = `total: ${summary.totalValue}, count: ${summary.count}, min: ${summary.min}, max: ${summary.max}`;
    } catch {
      summaryInfo = "unable to read summary";
    }
  }

  console.log(`\n  ✅ Feedback submitted`);
  console.log(`     Agent ID: ${agentId}`);
  console.log(`     Score: ${feedbackScore}/5`);
  console.log(`     Reviewer: ${userAccount.address}`);
  console.log(`     Feedback tx: ${fbTxHash}`);
  console.log(`     Feedback count: ${feedbackCountBefore} → ${feedbackCountAfter}`);
  console.log(`     Unique clients: ${clientList.length}`);
  if (summaryInfo) console.log(`     Reputation summary: ${summaryInfo}`);

  // --- 10. Save state ---
  saveState({
    ...state,
    feedback: {
      score: feedbackScore.toString(),
      reviewer: userAccount.address,
      feedbackTxHash: fbTxHash,
      feedbackHash,
      userTaskRef,
      feedbackCountAfter: feedbackCountAfter.toString(),
      submittedAt: new Date().toISOString(),
    },
  });

  console.log(`\n  State saved to ${STATE_FILE}`);
  console.log("\n✅ Feedback submission complete\n");
}

main().catch((err) => {
  console.error("\n❌ Feedback submission FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
