import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  formatEther,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { thanosSepolia } from "../../packages/shared/src/chains.js";
import { THANOS_SEPOLIA_ADDRESSES } from "../../packages/shared/src/addresses.js";
import { StakingIntegrationModuleABI } from "../../packages/shared/src/abi/StakingIntegrationModule.js";

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
  console.log("\n▶ Step 3: Stake Verification\n");

  const rpcUrl = process.env.RPC_URL!;
  const privKey = process.env.OPERATOR_PRIVATE_KEY!;
  if (!rpcUrl || !privKey) throw new Error("RPC_URL and OPERATOR_PRIVATE_KEY required in .env");

  const account = privateKeyToAccount(privKey as Hex);
  const publicClient = createPublicClient({
    chain: thanosSepolia,
    transport: http(rpcUrl),
  });

  // --- 1. Load agent state ---
  const state = loadState();
  const agentId = state.agentId as string | undefined;
  if (!agentId) throw new Error("No agentId in .agent-state.json — run 01-register-agent.ts first");
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Operator address: ${account.address}`);

  // --- 2. Read MIN_OPERATOR_STAKE ---
  const minStake = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.StakingIntegrationModule,
        abi: StakingIntegrationModuleABI,
        functionName: "MIN_OPERATOR_STAKE",
      }),
    "MIN_OPERATOR_STAKE",
  ) as bigint;
  console.log(`  MIN_OPERATOR_STAKE: ${formatEther(minStake)} TON`);

  // --- 3. Read current stake for operator ---
  // getStake() calls stakingBridge.staticcall() which reverts with StakingBridgeNotSet()
  // if the bridge address is not configured. Handle gracefully.
  let currentStake = 0n;
  let bridgeConfigured = true;
  try {
    currentStake = await retry(
      () =>
        publicClient.readContract({
          address: THANOS_SEPOLIA_ADDRESSES.StakingIntegrationModule,
          abi: StakingIntegrationModuleABI,
          functionName: "getStake",
          args: [account.address],
        }),
      "getStake",
    ) as bigint;
    console.log(`  Current stake: ${formatEther(currentStake)} TON`);
  } catch (err) {
    bridgeConfigured = false;
    const msg = (err as Error).message || "";
    if (msg.includes("0x41c0042f") || msg.includes("StakingBridgeNotSet")) {
      console.log(`  ⚠️  getStake reverted: StakingBridgeNotSet`);
      console.log(`     The L1 staking bridge has not been configured on StakingIntegrationModule`);
    } else {
      console.log(`  ⚠️  getStake reverted: ${msg.slice(0, 120)}`);
    }
  }

  // --- 4. Check operator verification status ---
  // isVerifiedOperator returns false (no revert) when bridge is unset
  const isVerified = await retry(
    () =>
      publicClient.readContract({
        address: THANOS_SEPOLIA_ADDRESSES.StakingIntegrationModule,
        abi: StakingIntegrationModuleABI,
        functionName: "isVerifiedOperator",
        args: [account.address],
      }),
    "isVerifiedOperator",
  ) as boolean;
  console.log(`  Is verified operator: ${isVerified}`);

  // --- 5. Get full operator status ---
  let slashingCount = 0n;
  let lastSlashTime = 0n;
  try {
    const result = await retry(
      () =>
        publicClient.readContract({
          address: THANOS_SEPOLIA_ADDRESSES.StakingIntegrationModule,
          abi: StakingIntegrationModuleABI,
          functionName: "getOperatorStatus",
          args: [account.address],
        }),
      "getOperatorStatus",
    ) as [bigint, boolean, bigint, bigint];

    currentStake = result[0];
    slashingCount = result[2];
    lastSlashTime = result[3];

    console.log(`\n  Operator Status:`);
    console.log(`     Staked amount: ${formatEther(result[0])} TON`);
    console.log(`     Verified: ${result[1]}`);
    console.log(`     Slashing count: ${slashingCount}`);
    console.log(`     Last slash time: ${lastSlashTime === 0n ? "never" : new Date(Number(lastSlashTime) * 1000).toISOString()}`);
  } catch {
    // getOperatorStatus also calls stakingBridge.staticcall — expected to fail
    console.log(`\n  Operator Status: unavailable (staking bridge not configured)`);
  }

  // --- 6. Calculate seigniorage bonus ---
  try {
    const bonus = await retry(
      () =>
        publicClient.readContract({
          address: THANOS_SEPOLIA_ADDRESSES.StakingIntegrationModule,
          abi: StakingIntegrationModuleABI,
          functionName: "calculateSeigniorageBonus",
          args: [BigInt(agentId), BigInt(1e18)],
        }),
      "calculateSeigniorageBonus",
    ) as bigint;
    console.log(`  Seigniorage bonus (1 TON base): ${formatEther(bonus)} TON`);
  } catch {
    console.log(`  Seigniorage bonus: N/A (bridge not configured or agent has no stake)`);
  }

  // --- 7. Assess staking status ---
  console.log("\n  Assessment:");
  if (!bridgeConfigured) {
    console.log(`  ℹ️  Staking bridge not configured on StakingIntegrationModule`);
    console.log(`     StakingIntegrationModule is read-only — no write functions available`);
    console.log(`     Staking requires L1 bridge setup: TALStakingBridgeL1 -> TALStakingBridgeL2`);
    console.log(`     For testnet integration: staking verification is SKIPPED`);
    console.log(`     TaskFeeEscrow does NOT require staking — tasks can proceed without stake`);
  } else {
    const meetsMinimum = currentStake >= minStake;
    if (meetsMinimum) {
      console.log(`  ✅ Stake meets minimum requirement (${formatEther(currentStake)} >= ${formatEther(minStake)} TON)`);
    } else if (minStake === 0n) {
      console.log(`  ✅ No minimum stake required (MIN_OPERATOR_STAKE = 0)`);
    } else {
      console.log(`  ⚠️  Stake below minimum: ${formatEther(currentStake)} < ${formatEther(minStake)} TON`);
      console.log(`     To stake: interact with TON Staking V3 on Ethereum L1`);
    }
  }

  // --- 8. Save state ---
  saveState({
    ...state,
    staking: {
      bridgeConfigured,
      currentStake: currentStake.toString(),
      minStake: minStake.toString(),
      meetsMinimum: !bridgeConfigured ? "n/a" : currentStake >= minStake,
      isVerified,
      slashingCount: slashingCount.toString(),
      checkedAt: new Date().toISOString(),
    },
  });

  console.log(`\n  State saved to ${STATE_FILE}`);
  console.log("\n✅ Stake verification complete\n");
}

main().catch((err) => {
  console.error("\n❌ Stake verification FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
