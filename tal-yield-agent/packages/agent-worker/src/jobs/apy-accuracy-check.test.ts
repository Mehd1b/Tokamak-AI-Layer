import { describe, it, expect, vi } from "vitest";
import type { Job } from "bullmq";
import { processAPYAccuracyCheck, type APYAccuracyCheckDeps } from "./apy-accuracy-check.js";
import type { APYAccuracyCheckData } from "./types.js";
import {
  SnapshotManager,
  type DataPipeline,
  type DataSnapshot,
  type PoolData,
} from "@tal-yield-agent/agent-core";
import pino from "pino";

function makeMockPool(overrides: Partial<PoolData> = {}): PoolData {
  return {
    protocol: "Aave V3",
    protocolType: "lending",
    chain: 1,
    poolId: "aave-v3-usdc",
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

function makeMockJob(data: APYAccuracyCheckData): Job<APYAccuracyCheckData> {
  return { id: "test-job", data } as Job<APYAccuracyCheckData>;
}

describe("processAPYAccuracyCheck", () => {
  const pools = [
    makeMockPool({ poolId: "aave-usdc", currentAPY: 3.5 }),
    makeMockPool({ poolId: "comp-usdc", currentAPY: 4.2 }),
  ];
  const snapshot = makeMockSnapshot(pools);

  const baseDeps: APYAccuracyCheckDeps = {
    logger: pino({ level: "silent" }),
    pipeline: {
      createSnapshot: async () => snapshot,
      getLastSnapshot: () => snapshot,
    } as unknown as DataPipeline,
  };

  it("computes accuracy check without on-chain submission", async () => {
    const result = await processAPYAccuracyCheck(
      makeMockJob({ taskId: "task-1", reportTimestamp: 1700000000, horizon: "7d" }),
      baseDeps,
    );

    expect(result.taskId).toBe("task-1");
    expect(result.horizon).toBe("7d");
    expect(result.poolCount).toBe(2);
    expect(result.avgError).toBeGreaterThan(0);
    expect(result.txHash).toBeUndefined();
  });

  it("submits on-chain when updateAPYAccuracy is provided", async () => {
    const updateAPYAccuracy = vi.fn().mockResolvedValue("0xabc123");
    const deps: APYAccuracyCheckDeps = {
      ...baseDeps,
      updateAPYAccuracy,
    };

    const result = await processAPYAccuracyCheck(
      makeMockJob({ taskId: "task-2", reportTimestamp: 1700000000, horizon: "30d" }),
      deps,
    );

    expect(updateAPYAccuracy).toHaveBeenCalledOnce();
    expect(result.txHash).toBe("0xabc123");
  });

  it("continues if on-chain submission fails", async () => {
    const updateAPYAccuracy = vi.fn().mockRejectedValue(new Error("revert"));
    const deps: APYAccuracyCheckDeps = {
      ...baseDeps,
      updateAPYAccuracy,
    };

    const result = await processAPYAccuracyCheck(
      makeMockJob({ taskId: "task-3", reportTimestamp: 1700000000, horizon: "90d" }),
      deps,
    );

    expect(result.txHash).toBeUndefined();
    expect(result.poolCount).toBe(2);
  });
});
