import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DataPipeline } from "../../packages/agent-core/src/pipeline/data-pipeline.js";
import { StrategyGenerator } from "../../packages/agent-core/src/analysis/strategy-generator.js";
import { HttpDataSource } from "../../packages/agent-core/src/adapters/data-source.js";
import { MockDataSource } from "../../packages/agent-core/src/__mocks__/mock-data-source.js";
import { SnapshotManager } from "../../packages/agent-core/src/snapshot/snapshot-manager.js";
import { RateLimiter } from "../../packages/agent-core/src/pipeline/rate-limiter.js";
import type { RiskProfile } from "../../packages/agent-core/src/analysis/types.js";

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
  console.log("\n▶ Step 5: Generate Strategy\n");

  // --- 1. Load agent state ---
  const state = loadState();
  const agentId = state.agentId as string | undefined;
  const taskRef = state.taskRef as string | undefined;
  if (!agentId) throw new Error("No agentId in state — run 01-register-agent.ts first");
  if (!taskRef) throw new Error("No taskRef in state — run 03-submit-request.ts first");

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

  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Task ref: ${taskRef}`);
  console.log(`  Risk profile: ${request.riskProfile.level}`);
  console.log(`  Capital: $${request.capitalUSD.toLocaleString()}`);

  // --- 2. Create DataSnapshot ---
  console.log("\n  Creating data snapshot...");
  const startTime = Date.now();

  let usedMockData = false;
  let pipeline: DataPipeline;

  // Try live data first, fall back to mock
  try {
    console.log("  Attempting live DeFi Llama fetch...");
    const liveSource = new HttpDataSource();
    pipeline = new DataPipeline(liveSource, new SnapshotManager(), new RateLimiter());
    const snapshot = await pipeline.createSnapshot();
    console.log(`  ✅ Live snapshot created: ${snapshot.poolStates.length} pools`);
  } catch (err) {
    console.log(`  ⚠️  Live fetch failed: ${(err as Error).message?.slice(0, 100)}`);
    console.log("  Falling back to mock data...");
    usedMockData = true;
    const mockSource = new MockDataSource();
    pipeline = new DataPipeline(mockSource, new SnapshotManager(), new RateLimiter());
  }

  const snapshot = pipeline.getLastSnapshot() ?? await pipeline.createSnapshot();
  const snapshotDuration = Date.now() - startTime;

  console.log(`  Snapshot ID: ${snapshot.snapshotId}`);
  console.log(`  Pool count: ${snapshot.poolStates.length}`);
  console.log(`  Data source: ${usedMockData ? "mock" : "live DeFi Llama"}`);
  console.log(`  Fetch duration: ${snapshotDuration}ms`);

  // Save snapshot locally
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const snapshotPath = resolve(DATA_DIR, "snapshot.json");
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`  Snapshot saved to ${snapshotPath}`);

  // --- 3. Run analysis engine ---
  console.log("\n  Running strategy generator...");
  const genStart = Date.now();
  const generator = new StrategyGenerator();

  const riskProfile: RiskProfile = {
    level: request.riskProfile.level as "conservative" | "moderate" | "aggressive",
    maxILTolerance: request.riskProfile.maxILTolerance,
    minTVL: request.riskProfile.minTVL,
    minProtocolAge: request.riskProfile.minProtocolAge,
    chainPreferences: request.riskProfile.chainPreferences,
    excludeProtocols: request.riskProfile.excludeProtocols,
    maxSinglePoolAllocation: request.riskProfile.maxSinglePoolAllocation,
  };

  const report1 = generator.generate(
    snapshot,
    riskProfile,
    request.capitalUSD,
    taskRef,
  );
  const genDuration = Date.now() - genStart;

  console.log(`  Generation duration: ${genDuration}ms`);
  console.log(`  Execution hash: ${report1.executionHash}`);

  // --- 4. Verify determinism ---
  console.log("\n  Verifying determinism...");
  const report2 = generator.generate(
    snapshot,
    riskProfile,
    request.capitalUSD,
    taskRef,
  );

  if (report1.executionHash === report2.executionHash) {
    console.log(`  ✅ Determinism verified: ${report1.executionHash} === ${report2.executionHash}`);
  } else {
    console.log(`  ❌ DETERMINISM FAILED!`);
    console.log(`     Hash 1: ${report1.executionHash}`);
    console.log(`     Hash 2: ${report2.executionHash}`);
    throw new Error("Strategy generation is not deterministic");
  }

  // --- 5. Save strategy report ---
  const reportPath = resolve(DATA_DIR, "strategy-report.json");
  writeFileSync(reportPath, JSON.stringify(report1, null, 2));
  console.log(`\n  Report saved to ${reportPath}`);

  // --- 6. Log full strategy summary ---
  console.log("\n  ✅ Strategy generated");
  console.log(`     Snapshot ID: ${report1.snapshotId}`);
  console.log(`     Execution hash: ${report1.executionHash}`);
  console.log(`     Determinism: VERIFIED`);
  console.log(`     Blended APY: ${report1.expectedAPY.blended.toFixed(2)}%`);
  console.log(`     APY range: ${report1.expectedAPY.range.low.toFixed(2)}% - ${report1.expectedAPY.range.high.toFixed(2)}%`);
  console.log(`     Risk score: ${report1.riskScore.overall}/100`);
  console.log(`     Allocations:`);
  for (const alloc of report1.allocations) {
    console.log(`       - ${alloc.protocol} / ${alloc.pool} on chain ${alloc.chain}: ${(alloc.percentage * 100).toFixed(1)}% ($${alloc.amountUSD.toLocaleString()}) — APY: ${alloc.expectedAPY.predicted30d.mean.toFixed(2)}%`);
  }
  if (report1.warnings.length > 0) {
    console.log(`     Warnings: ${report1.warnings.join(", ")}`);
  }
  console.log(`     Alternatives: ${report1.alternativesConsidered.length}`);
  console.log(`     Duration: ${genDuration}ms`);
  console.log(`     Data source: ${usedMockData ? "mock" : "live"}`);

  // --- 7. Update state ---
  saveState({
    ...state,
    strategy: {
      reportId: report1.reportId,
      snapshotId: report1.snapshotId,
      executionHash: report1.executionHash,
      blendedAPY: report1.expectedAPY.blended,
      riskScore: report1.riskScore.overall,
      allocationCount: report1.allocations.length,
      determinismVerified: true,
      usedMockData,
      generatedAt: new Date().toISOString(),
    },
  });

  console.log(`\n  State saved to ${STATE_FILE}`);
  console.log("\n✅ Strategy generation complete\n");
}

main().catch((err) => {
  console.error("\n❌ Strategy generation FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});
