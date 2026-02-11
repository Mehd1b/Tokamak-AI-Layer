import { describe, it, expect, vi } from "vitest";
import { processPoolDataRefresh } from "./pool-data-refresh.js";
import type { PoolRefreshDeps } from "./pool-data-refresh.js";
import type { PoolDataRefreshData } from "./types.js";
import type { DataSnapshot, PoolData } from "@tal-yield-agent/agent-core";
import { SnapshotManager } from "@tal-yield-agent/agent-core";
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

function makeMockSnapshot(): DataSnapshot {
  const mgr = new SnapshotManager();
  return mgr.createSnapshot({
    poolStates: [makeMockPool()],
    priceFeed: { USDC: 1 },
    blockNumbers: { "1": 19000000 },
    timestamp: 1700000000,
    sources: ["mock"],
    fetchDuration: 10,
    adapterVersions: { mock: "1.0.0" },
  });
}

function makeMockJob(data: PoolDataRefreshData) {
  return { id: "test-job-1", data } as Parameters<typeof processPoolDataRefresh>[0];
}

describe("processPoolDataRefresh", () => {
  it("calls pipeline.createSnapshot and returns result", async () => {
    const snapshot = makeMockSnapshot();
    const onSnapshot = vi.fn();
    const deps: PoolRefreshDeps = {
      pipeline: { createSnapshot: vi.fn().mockResolvedValue(snapshot) } as unknown as PoolRefreshDeps["pipeline"],
      logger: pino({ level: "silent" }),
      onSnapshot,
    };

    const result = await processPoolDataRefresh(
      makeMockJob({ triggeredBy: "cron" }),
      deps,
    );

    expect(result.snapshotId).toBe(snapshot.snapshotId);
    expect(result.poolCount).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it("reports correct pool count", async () => {
    const mgr = new SnapshotManager();
    const snapshot = mgr.createSnapshot({
      poolStates: [makeMockPool({ poolId: "p1" }), makeMockPool({ poolId: "p2" })],
      priceFeed: { USDC: 1 },
      blockNumbers: { "1": 19000000 },
      timestamp: 1700000000,
      sources: ["mock"],
      fetchDuration: 10,
      adapterVersions: { mock: "1.0.0" },
    });

    const deps: PoolRefreshDeps = {
      pipeline: { createSnapshot: vi.fn().mockResolvedValue(snapshot) } as unknown as PoolRefreshDeps["pipeline"],
      logger: pino({ level: "silent" }),
    };

    const result = await processPoolDataRefresh(
      makeMockJob({ triggeredBy: "manual" }),
      deps,
    );

    expect(result.poolCount).toBe(2);
  });
});
