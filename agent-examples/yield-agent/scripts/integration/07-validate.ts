import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { StrategyGenerator } from "../../packages/agent-core/src/analysis/strategy-generator.js";
import type { RiskProfile } from "../../packages/agent-core/src/analysis/types.js";
import type { DataSnapshot } from "../../packages/agent-core/src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, ".agent-state.json");
const DATA_DIR = resolve(__dirname, ".data");

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
  console.log("\n▶ Step 8: Validator Re-execution (StakeSecured Proof)\n");

  // --- 1. Load state ---
  const state = loadState();
  const taskRef = state.taskRef as string | undefined;
  const strategy = state.strategy as {
    executionHash: string;
    snapshotId: string;
  } | undefined;
  const request = state.request as {
    tier: string;
    riskProfile: {
      level: string;
      maxILTolerance: number;
      minTVL: number;
      minProtocolAge: number;
      chainPreferences: number[];
      excludeProtocols: string[];
      maxSinglePoolAllocation: number;
    };
    capitalUSD: number;
  };

  if (!taskRef) throw new Error("No taskRef in state — run 03-submit-request.ts first");
  if (!strategy) throw new Error("No strategy in state — run 04-generate-strategy.ts first");

  console.log(`  Task ref: ${taskRef}`);
  console.log(`  Original execution hash: ${strategy.executionHash}`);
  console.log(`  Snapshot ID: ${strategy.snapshotId}`);

  // --- 2. Load snapshot from local file ---
  const snapshotPath = resolve(DATA_DIR, "snapshot.json");
  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot file not found at ${snapshotPath} — run 04-generate-strategy.ts first`);
  }

  console.log("\n  Loading snapshot from local file...");
  const snapshot: DataSnapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  console.log(`  Snapshot loaded: ${snapshot.poolStates.length} pools`);
  console.log(`  Snapshot ID: ${snapshot.snapshotId}`);

  // Verify snapshot ID matches
  if (snapshot.snapshotId !== strategy.snapshotId) {
    throw new Error(`Snapshot ID mismatch: file has ${snapshot.snapshotId}, expected ${strategy.snapshotId}`);
  }
  console.log(`  ✅ Snapshot ID matches`);

  // --- 3. Re-create risk profile ---
  const riskProfile: RiskProfile = {
    level: request.riskProfile.level as "conservative" | "moderate" | "aggressive",
    maxILTolerance: request.riskProfile.maxILTolerance,
    minTVL: request.riskProfile.minTVL,
    minProtocolAge: request.riskProfile.minProtocolAge,
    chainPreferences: request.riskProfile.chainPreferences,
    excludeProtocols: request.riskProfile.excludeProtocols,
    maxSinglePoolAllocation: request.riskProfile.maxSinglePoolAllocation,
  };

  // --- 4. Re-execute strategy generation ---
  console.log("\n  Re-executing strategy generation (validator perspective)...");
  const startTime = Date.now();
  const generator = new StrategyGenerator();

  const validatorReport = generator.generate(
    snapshot,
    riskProfile,
    request.capitalUSD,
    taskRef,
  );
  const duration = Date.now() - startTime;

  console.log(`  Re-execution duration: ${duration}ms`);
  console.log(`  Validator's execution hash: ${validatorReport.executionHash}`);

  // --- 5. Compare execution hashes ---
  console.log("\n  Comparing execution hashes:");
  console.log(`     Agent's hash:     ${strategy.executionHash}`);
  console.log(`     Validator's hash: ${validatorReport.executionHash}`);

  const match = strategy.executionHash === validatorReport.executionHash;

  if (match) {
    console.log(`     Match: ✅ YES`);
  } else {
    console.log(`     Match: ❌ NO`);
    console.log("\n  ❌ DETERMINISM VERIFICATION FAILED");
    console.log("  The validator produced a different execution hash.");
    console.log("  This means the strategy generation is NOT deterministic.");

    // Debug: compare key fields
    const origReport = JSON.parse(readFileSync(resolve(DATA_DIR, "strategy-report.json"), "utf-8"));
    console.log(`\n  Debug comparison:`);
    console.log(`     Original allocations: ${origReport.allocations.length}`);
    console.log(`     Validator allocations: ${validatorReport.allocations.length}`);
    console.log(`     Original blended APY: ${origReport.expectedAPY.blended}`);
    console.log(`     Validator blended APY: ${validatorReport.expectedAPY.blended}`);

    throw new Error("Validator re-execution hash mismatch");
  }

  // --- 6. Log validation results ---
  console.log(`\n  ✅ StakeSecured validation PASSED`);
  console.log(`     Original hash:    ${strategy.executionHash}`);
  console.log(`     Re-executed hash: ${validatorReport.executionHash}`);
  console.log(`     Match: YES`);
  console.log(`     Blended APY: ${validatorReport.expectedAPY.blended.toFixed(2)}%`);
  console.log(`     Risk score: ${validatorReport.riskScore.overall}/100`);
  console.log(`     Allocations: ${validatorReport.allocations.length}`);
  console.log(`     Re-execution time: ${duration}ms`);
  console.log(`     Validation tx: skipped — requires separate validator wallet`);

  // --- 7. Save state ---
  saveState({
    ...state,
    validation: {
      originalHash: strategy.executionHash,
      validatorHash: validatorReport.executionHash,
      match: true,
      reExecutionDuration: duration,
      validatedAt: new Date().toISOString(),
      validationTx: null, // Would require separate validator wallet
    },
  });

  console.log(`\n  State saved to ${STATE_FILE}`);
  console.log("\n✅ Validator re-execution complete\n");
}

main().catch((err) => {
  console.error("\n❌ Validation FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
