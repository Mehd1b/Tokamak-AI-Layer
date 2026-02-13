import { describe, it, expect, vi } from "vitest";
import { processStrategyGenerate } from "./strategy-generate.js";
import type { StrategyGenerateDeps } from "./strategy-generate.js";
import type { StrategyGenerateData } from "./types.js";
import type { DataSnapshot, PoolData } from "@tal-yield-agent/agent-core";
import { SnapshotManager, StrategyGenerator, RiskScorer, APYPredictor } from "@tal-yield-agent/agent-core";
import pino from "pino";

function makeMockPool(overrides: Partial<PoolData> = {}): PoolData {
  return {
    protocol: "Aave V3",
    protocolType: "lending",
    chain: 1,
    poolId: "aave-usdc",
    tokens: [{ symbol: "USDC", address: "0x0", decimals: 6, priceUSD: 1 }],
    currentAPY: 3.5,
    tvl: 2_500_000_000,
    volume24h: 150_000_000,
    ilRisk: 0,
    protocolRiskScore: 15,
    auditStatus: { audited: true, auditors: ["OZ"], auditCount: 12, bugBountyActive: true, bugBountySize: 10_000_000 },
    contractAge: 900,
    ...overrides,
  };
}

function makeMockSnapshot(pools: PoolData[]): DataSnapshot {
  const mgr = new SnapshotManager();
  return mgr.createSnapshot({
    poolStates: pools,
    priceFeed: { USDC: 1, ETH: 3000 },
    blockNumbers: { "1": 19000000 },
    timestamp: 1700000000,
    sources: ["mock"],
    fetchDuration: 10,
    adapterVersions: { mock: "1.0.0" },
  });
}

function makeMockJob(data: StrategyGenerateData) {
  return {
    id: "test-job-1",
    data,
    updateProgress: vi.fn(),
  } as unknown as Parameters<typeof processStrategyGenerate>[0];
}

describe("processStrategyGenerate", () => {
  const pools = [
    makeMockPool({ poolId: "aave-usdc", protocol: "Aave V3", currentAPY: 3.5, tvl: 2_500_000_000 }),
    makeMockPool({ poolId: "comp-usdc", protocol: "Compound V3", currentAPY: 3.1, tvl: 1_800_000_000, protocolRiskScore: 18 }),
    makeMockPool({ poolId: "lido-steth", protocol: "Lido", currentAPY: 3.2, tvl: 14_000_000_000, protocolType: "liquid-staking", protocolRiskScore: 12 }),
  ];
  const snapshot = makeMockSnapshot(pools);

  it("generates strategy and returns result", async () => {
    const onComplete = vi.fn();
    const deps: StrategyGenerateDeps = {
      pipeline: { createSnapshot: vi.fn().mockResolvedValue(snapshot) } as unknown as StrategyGenerateDeps["pipeline"],
      strategyGenerator: new StrategyGenerator(new RiskScorer(), new APYPredictor()),
      logger: pino({ level: "silent" }),
      onComplete,
    };

    const result = await processStrategyGenerate(
      makeMockJob({
        taskId: "task-1",
        requester: "0xtest",
        riskLevel: "moderate",
        capitalUSD: 100_000,
      }),
      deps,
    );

    expect(result.taskId).toBe("task-1");
    expect(result.snapshotId).toBe(snapshot.snapshotId);
    expect(result.executionHash).toMatch(/^0x/);
    expect(result.allocationCount).toBeGreaterThan(0);
    expect(result.blendedAPY).toBeGreaterThan(0);
    expect(onComplete).toHaveBeenCalled();
  });

  it("produces deterministic results", async () => {
    const deps: StrategyGenerateDeps = {
      pipeline: { createSnapshot: vi.fn().mockResolvedValue(snapshot) } as unknown as StrategyGenerateDeps["pipeline"],
      strategyGenerator: new StrategyGenerator(new RiskScorer(), new APYPredictor()),
      logger: pino({ level: "silent" }),
    };

    const jobData: StrategyGenerateData = {
      taskId: "task-det",
      requester: "0xtest",
      riskLevel: "moderate",
      capitalUSD: 100_000,
    };

    const result1 = await processStrategyGenerate(makeMockJob(jobData), deps);
    const result2 = await processStrategyGenerate(makeMockJob(jobData), deps);

    expect(result1.executionHash).toBe(result2.executionHash);
    expect(result1.blendedAPY).toBe(result2.blendedAPY);
  });

  it("handles different risk levels", async () => {
    const deps: StrategyGenerateDeps = {
      pipeline: { createSnapshot: vi.fn().mockResolvedValue(snapshot) } as unknown as StrategyGenerateDeps["pipeline"],
      strategyGenerator: new StrategyGenerator(new RiskScorer(), new APYPredictor()),
      logger: pino({ level: "silent" }),
    };

    const conservative = await processStrategyGenerate(
      makeMockJob({ taskId: "t1", requester: "0x", riskLevel: "conservative", capitalUSD: 100_000 }),
      deps,
    );
    const aggressive = await processStrategyGenerate(
      makeMockJob({ taskId: "t2", requester: "0x", riskLevel: "aggressive", capitalUSD: 100_000 }),
      deps,
    );

    // Different profiles produce different hashes
    expect(conservative.executionHash).not.toBe(aggressive.executionHash);
  });
});
