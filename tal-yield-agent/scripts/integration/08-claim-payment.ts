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
  console.log("\n▶ Step 9: Payment Claim\n");

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
  const agentId = state.agentId as string | undefined;
  if (!agentId) throw new Error("No agentId in state");
  const agentIdBn = BigInt(agentId);

  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Owner: ${account.address}`);

  // --- 2. Check agent balance ---
  const balanceBefore = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "getAgentBalance",
        args: [agentIdBn],
      }),
    "getAgentBalance",
  ) as bigint;

  console.log(`  Agent escrow balance: ${formatEther(balanceBefore)} TON`);

  if (balanceBefore === 0n) {
    console.log(`  ℹ️  No fees to claim — balance is 0`);
    console.log("\n✅ Payment claim skipped (nothing to claim)\n");
    return;
  }

  // --- 3. Check wallet balance before ---
  const walletBefore = await publicClient.getBalance({ address: account.address });
  console.log(`  Wallet balance before: ${formatEther(walletBefore)} TON`);

  // --- 4. Claim fees ---
  console.log(`\n  Claiming ${formatEther(balanceBefore)} TON...`);

  const { request: claimReq } = await retry(
    () =>
      publicClient.simulateContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "claimFees",
        args: [agentIdBn],
        account,
      }),
    "simulateContract(claimFees)",
  );

  const txHash = await walletClient.writeContract(claimReq);
  console.log(`  Tx submitted: ${txHash}`);

  const receipt = await retry(
    () => publicClient.waitForTransactionReceipt({ hash: txHash }),
    "waitForReceipt(claimFees)",
  );
  console.log(`  Tx confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);

  // --- 5. Decode FeesClaimed event ---
  let claimedAmount: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: TaskFeeEscrowABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "FeesClaimed") {
        const args = decoded.args as { agentId: bigint; owner: string; amount: bigint };
        claimedAmount = args.amount;
        break;
      }
    } catch {
      // Not our event
    }
  }

  // --- 6. Check balances after ---
  const balanceAfter = await publicClient.readContract({
    address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: "getAgentBalance",
    args: [agentIdBn],
  }) as bigint;

  const walletAfter = await publicClient.getBalance({ address: account.address });

  console.log(`\n  ✅ Payment claimed`);
  console.log(`     Amount: ${formatEther(claimedAmount || balanceBefore)} TON`);
  console.log(`     Tx hash: ${txHash}`);
  console.log(`     Gas used: ${receipt.gasUsed}`);
  console.log(`     Escrow balance after: ${formatEther(balanceAfter)} TON`);
  console.log(`     Wallet balance after: ${formatEther(walletAfter)} TON`);
  console.log(`     Net wallet change: ${formatEther(walletAfter - walletBefore)} TON (claimed - gas)`);

  // --- 7. Save state ---
  saveState({
    ...state,
    claim: {
      amount: (claimedAmount || balanceBefore).toString(),
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      walletBalanceAfter: walletAfter.toString(),
      claimedAt: new Date().toISOString(),
    },
  });

  console.log(`\n  State saved to ${STATE_FILE}`);
  console.log("\n✅ Payment claim complete\n");
}

main().catch((err) => {
  console.error("\n❌ Payment claim FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
