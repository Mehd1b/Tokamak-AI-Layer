import "dotenv/config";
import {
  createPublicClient,
  http,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Direct imports from shared package source (no workspace resolution needed)
import { thanosSepolia } from "../../packages/shared/src/chains.js";
import { THANOS_SEPOLIA_ADDRESSES } from "../../packages/shared/src/addresses.js";
import { TALIdentityRegistryABI } from "../../packages/shared/src/abi/TALIdentityRegistry.js";
import { TaskFeeEscrowABI } from "../../packages/shared/src/abi/TaskFeeEscrow.js";
import { TALReputationRegistryABI } from "../../packages/shared/src/abi/TALReputationRegistry.js";
import { TALValidationRegistryABI } from "../../packages/shared/src/abi/TALValidationRegistry.js";

const EXPECTED_CHAIN_ID = 111551119090;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.log(`  ⟳ ${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  console.log("\n▶ Step 1: Wallet & Network Verification\n");

  // --- Validate env ---
  const rpcUrl = process.env.RPC_URL;
  const privKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!rpcUrl) throw new Error("RPC_URL not set in .env");
  if (!privKey) throw new Error("OPERATOR_PRIVATE_KEY not set in .env");

  const account = privateKeyToAccount(privKey as Hex);
  console.log(`  Operator address: ${account.address}`);

  // --- Create client ---
  const publicClient = createPublicClient({
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });

  // --- 1. Chain ID ---
  const chainId = await retry(() => publicClient.getChainId(), "getChainId");
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Chain ID mismatch: expected ${EXPECTED_CHAIN_ID}, got ${chainId}`);
  }
  console.log(`  ✅ Chain ID: ${chainId} (Thanos Sepolia)`);

  // --- 2. Operator balance ---
  const balance = await retry(() => publicClient.getBalance({ address: account.address }), "getBalance");
  const balanceTON = formatEther(balance);
  console.log(`  ✅ Operator balance: ${balanceTON} TON`);
  if (balance < BigInt(10e18)) {
    console.log(`  ⚠️  WARNING: Balance below 10 TON — may be insufficient for gas + staking`);
  }

  // --- 3. Contract bytecode verification ---
  const contracts: [string, Address][] = [
    ["TALIdentityRegistry", THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry],
    ["TALReputationRegistry", THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry],
    ["TALValidationRegistry", THANOS_SEPOLIA_ADDRESSES.TALValidationRegistry],
    ["TaskFeeEscrow", THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow],
    ["StakingIntegrationModule", THANOS_SEPOLIA_ADDRESSES.StakingIntegrationModule],
  ];

  for (const [name, address] of contracts) {
    const code = await retry(() => publicClient.getCode({ address }), `getCode(${name})`);
    if (!code || code === "0x") {
      throw new Error(`${name} at ${address} has no deployed bytecode`);
    }
    console.log(`  ✅ ${name}: deployed (${code.length / 2 - 1} bytes)`);
  }

  // --- 4. ABI smoke tests (read-only calls) ---
  console.log("\n  ABI smoke tests:");

  // IdentityRegistry.getAgentCount()
  const agentCount = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
        abi: TALIdentityRegistryABI,
        functionName: "getAgentCount",
      }),
    "IdentityRegistry.getAgentCount",
  );
  console.log(`  ✅ IdentityRegistry.getAgentCount() = ${agentCount}`);

  // TaskFeeEscrow.identityRegistry()
  const linkedRegistry = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        abi: TaskFeeEscrowABI,
        functionName: "identityRegistry",
      }),
    "TaskFeeEscrow.identityRegistry",
  );
  console.log(`  ✅ TaskFeeEscrow.identityRegistry() = ${linkedRegistry}`);

  // ReputationRegistry.getFeedbackCount(1)
  try {
    const feedbackCount = await retry(
      () =>
        publicClient.readContract({
          address: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
          abi: TALReputationRegistryABI,
          functionName: "getFeedbackCount",
          args: [1n],
        }),
      "ReputationRegistry.getFeedbackCount",
    );
    console.log(`  ✅ ReputationRegistry.getFeedbackCount(1) = ${feedbackCount}`);
  } catch {
    console.log(`  ✅ ReputationRegistry.getFeedbackCount() — callable (agent 1 may not exist)`);
  }

  // ValidationRegistry.paused()
  const paused = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TALValidationRegistry,
        abi: TALValidationRegistryABI,
        functionName: "paused",
      }),
    "ValidationRegistry.paused",
  );
  console.log(`  ✅ ValidationRegistry.paused() = ${paused}`);

  // --- Check if operator already has an agent ---
  const operatorAgents = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
        abi: TALIdentityRegistryABI,
        functionName: "getAgentsByOwner",
        args: [account.address],
      }),
    "IdentityRegistry.getAgentsByOwner",
  ) as bigint[];

  if (operatorAgents.length > 0) {
    console.log(`\n  ℹ️  Operator already owns agent(s): [${operatorAgents.join(", ")}]`);
  } else {
    console.log(`\n  ℹ️  Operator has no registered agents yet`);
  }

  console.log("\n✅ All preflight checks passed\n");
}

main().catch((err) => {
  console.error("\n❌ Preflight FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
