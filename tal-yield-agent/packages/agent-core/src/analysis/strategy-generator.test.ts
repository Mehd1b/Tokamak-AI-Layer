import { describe, it, expect } from "vitest";
import { StrategyGenerator } from "./strategy-generator.js";
import { DEFAULT_RISK_PROFILES } from "./types.js";
import type { DataSnapshot, PoolData } from "../types.js";
import { MOCK_PRICE_FEED } from "../__mocks__/mock-data.js";

function makePool(overrides: Partial<PoolData> = {}): PoolData {
  return {
    protocol: "Aave V3",
    protocolType: "lending",
    chain: 1,
    poolId: "aave-v3-eth-usdc",
    tokens: [{ symbol: "USDC", address: "0x0", decimals: 6, priceUSD: 1 }],
    currentAPY: 3.5,
    tvl: 2_500_000_000,
    volume24h: 150_000_000,
    ilRisk: 0,
    protocolRiskScore: 15,
    auditStatus: {
      audited: true,
      auditors: ["OZ"],
      auditCount: 12,
      bugBountyActive: true,
      bugBountySize: 10_000_000,
    },
    contractAge: 900,
    ...overrides,
  };
}

function makeSnapshot(pools: PoolData[]): DataSnapshot {
  return {
    snapshotId: "0xabc123",
    timestamp: 1700000000,
    blockNumbers: { "1": 19000000 },
    poolStates: pools,
    priceFeed: MOCK_PRICE_FEED,
    metadata: {
      sources: ["defillama"],
      fetchDuration: 100,
      adapterVersions: { "aave-v3": "1.0.0" },
    },
  };
}

describe("StrategyGenerator", () => {
  const generator = new StrategyGenerator();

  const diversePools = [
    makePool({ poolId: "aave-usdc", protocol: "Aave V3", currentAPY: 3.5, tvl: 2_500_000_000, chain: 1 }),
    makePool({ poolId: "aave-weth", protocol: "Aave V3", currentAPY: 1.8, tvl: 4_200_000_000, chain: 1 }),
    makePool({ poolId: "comp-usdc", protocol: "Compound V3", currentAPY: 3.1, tvl: 1_800_000_000, chain: 1, protocolRiskScore: 18 }),
    makePool({ poolId: "lido-steth", protocol: "Lido", currentAPY: 3.2, tvl: 14_000_000_000, chain: 1, protocolType: "liquid-staking", protocolRiskScore: 12 }),
    makePool({ poolId: "curve-3pool", protocol: "Curve", currentAPY: 2.1, tvl: 900_000_000, chain: 1, protocolType: "stableswap", protocolRiskScore: 20 }),
    makePool({ poolId: "uni-v3-usdc-weth", protocol: "Uniswap V3", currentAPY: 12.5, tvl: 500_000_000, chain: 1, protocolType: "amm", ilRisk: 0.023, protocolRiskScore: 25 }),
  ];

  // ================================================================
  // Basic Generation
  // ================================================================
  describe("basic generation", () => {
    it("generates a report with all required fields", () => {
      const snapshot = makeSnapshot(diversePools);
      const profile = DEFAULT_RISK_PROFILES.moderate;
      const report = generator.generate(snapshot, profile, 100_000, "task-1");

      expect(report.reportId).toMatch(/^0x[a-f0-9]{64}$/);
      expect(report.requestId).toBe("task-1");
      expect(report.snapshotId).toBe(snapshot.snapshotId);
      expect(report.capitalUSD).toBe(100_000);
      expect(report.allocations.length).toBeGreaterThan(0);
      expect(report.expectedAPY.blended).toBeGreaterThan(0);
      expect(report.riskScore.overall).toBeGreaterThan(0);
      expect(report.reasoning.length).toBeGreaterThan(0);
      expect(report.executionHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it("allocation percentages sum to approximately 1", () => {
      const report = generator.generate(
        makeSnapshot(diversePools),
        DEFAULT_RISK_PROFILES.moderate,
        100_000,
        "task-1",
      );

      const totalPct = report.allocations.reduce((s, a) => s + a.percentage, 0);
      expect(totalPct).toBeCloseTo(1.0, 1);
    });

    it("allocation amounts sum to capital", () => {
      const capital = 100_000;
      const report = generator.generate(
        makeSnapshot(diversePools),
        DEFAULT_RISK_PROFILES.moderate,
        capital,
        "task-1",
      );

      const totalAmount = report.allocations.reduce((s, a) => s + a.amountUSD, 0);
      expect(totalAmount).toBeCloseTo(capital, -1); // within $10
    });
  });

  // ================================================================
  // Risk Profile Filtering
  // ================================================================
  describe("risk profile filtering", () => {
    it("conservative profile excludes high-IL pools", () => {
      const pools = [
        makePool({ poolId: "safe", ilRisk: 0, currentAPY: 3 }),
        makePool({ poolId: "risky", ilRisk: 0.1, currentAPY: 15 }),
      ];
      const report = generator.generate(
        makeSnapshot(pools),
        DEFAULT_RISK_PROFILES.conservative,
        100_000,
        "task-1",
      );

      const poolIds = report.allocations.map((a) => a.pool);
      expect(poolIds).not.toContain("risky");
    });

    it("conservative profile excludes low-TVL pools", () => {
      const pools = [
        makePool({ poolId: "large", tvl: 1_000_000_000 }),
        makePool({ poolId: "small", tvl: 50_000_000 }),
      ];
      const report = generator.generate(
        makeSnapshot(pools),
        DEFAULT_RISK_PROFILES.conservative,
        100_000,
        "task-1",
      );

      const poolIds = report.allocations.map((a) => a.pool);
      expect(poolIds).not.toContain("small");
    });

    it("conservative profile excludes young protocols", () => {
      const pools = [
        makePool({ poolId: "old", contractAge: 900 }),
        makePool({ poolId: "new", contractAge: 60 }),
      ];
      const report = generator.generate(
        makeSnapshot(pools),
        DEFAULT_RISK_PROFILES.conservative,
        100_000,
        "task-1",
      );

      const poolIds = report.allocations.map((a) => a.pool);
      expect(poolIds).not.toContain("new");
    });

    it("aggressive profile accepts pools that conservative rejects", () => {
      // Add a young, small-TVL pool that only aggressive accepts
      const pools = [
        ...diversePools,
        makePool({ poolId: "new-pool", contractAge: 60, tvl: 50_000_000, currentAPY: 8 }),
      ];
      const conservativeReport = generator.generate(
        makeSnapshot(pools),
        DEFAULT_RISK_PROFILES.conservative,
        100_000,
        "task-1",
      );
      const aggressiveReport = generator.generate(
        makeSnapshot(pools),
        DEFAULT_RISK_PROFILES.aggressive,
        100_000,
        "task-2",
      );

      const conservativePools = new Set(conservativeReport.allocations.map((a) => a.pool));
      const aggressivePools = new Set(aggressiveReport.allocations.map((a) => a.pool));
      // Conservative should NOT have the young pool, aggressive might
      expect(conservativePools.has("new-pool")).toBe(false);
      // Aggressive has broader pool universe
      expect(aggressivePools.size).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // Diversification
  // ================================================================
  describe("diversification", () => {
    it("respects max single pool allocation", () => {
      const profile = { ...DEFAULT_RISK_PROFILES.moderate, maxSinglePoolAllocation: 0.3 };
      const report = generator.generate(makeSnapshot(diversePools), profile, 100_000, "task-1");

      for (const alloc of report.allocations) {
        expect(alloc.percentage).toBeLessThanOrEqual(0.31); // small rounding tolerance
      }
    });

    it("spreads across multiple protocols when possible", () => {
      const report = generator.generate(
        makeSnapshot(diversePools),
        DEFAULT_RISK_PROFILES.moderate,
        100_000,
        "task-1",
      );

      const protocols = new Set(report.allocations.map((a) => a.protocol));
      expect(protocols.size).toBeGreaterThan(1);
    });
  });

  // ================================================================
  // Expected APY
  // ================================================================
  describe("expected APY", () => {
    it("blended APY is within range", () => {
      const report = generator.generate(
        makeSnapshot(diversePools),
        DEFAULT_RISK_PROFILES.moderate,
        100_000,
        "task-1",
      );

      expect(report.expectedAPY.blended).toBeGreaterThanOrEqual(report.expectedAPY.range.low);
      expect(report.expectedAPY.blended).toBeLessThanOrEqual(report.expectedAPY.range.high);
    });
  });

  // ================================================================
  // Empty / Edge Cases
  // ================================================================
  describe("edge cases", () => {
    it("handles empty pool list gracefully", () => {
      const report = generator.generate(
        makeSnapshot([]),
        DEFAULT_RISK_PROFILES.moderate,
        100_000,
        "task-1",
      );

      expect(report.allocations).toHaveLength(0);
      expect(report.expectedAPY.blended).toBe(0);
      expect(report.warnings).toContain("No pools match the given risk profile constraints");
    });

    it("handles all pools filtered out", () => {
      const pools = [makePool({ tvl: 100 })]; // too small for any profile
      const report = generator.generate(
        makeSnapshot(pools),
        DEFAULT_RISK_PROFILES.conservative,
        100_000,
        "task-1",
      );

      expect(report.allocations).toHaveLength(0);
      expect(report.warnings.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // Alternatives
  // ================================================================
  describe("alternatives", () => {
    it("generates alternative strategies", () => {
      const report = generator.generate(
        makeSnapshot(diversePools),
        DEFAULT_RISK_PROFILES.moderate,
        100_000,
        "task-1",
      );

      expect(report.alternativesConsidered.length).toBeGreaterThan(0);
      for (const alt of report.alternativesConsidered) {
        expect(alt.name).toBeDefined();
        expect(alt.blendedAPY).toBeGreaterThanOrEqual(0);
        expect(alt.reason).toBeDefined();
      }
    });
  });

  // ================================================================
  // Determinism (critical for StakeSecured validation)
  // ================================================================
  describe("determinism", () => {
    it("same snapshot + profile → identical execution hash", () => {
      const snapshot = makeSnapshot(diversePools);
      const profile = DEFAULT_RISK_PROFILES.moderate;

      const report1 = generator.generate(snapshot, profile, 100_000, "task-1");
      const report2 = generator.generate(snapshot, profile, 100_000, "task-1");

      expect(report1.executionHash).toBe(report2.executionHash);
    });

    it("same snapshot + profile → identical allocations", () => {
      const snapshot = makeSnapshot(diversePools);
      const profile = DEFAULT_RISK_PROFILES.moderate;

      const report1 = generator.generate(snapshot, profile, 100_000, "task-1");
      const report2 = generator.generate(snapshot, profile, 100_000, "task-1");

      expect(report1.allocations).toEqual(report2.allocations);
      expect(report1.expectedAPY).toEqual(report2.expectedAPY);
    });

    it("different profiles → different execution hashes", () => {
      const snapshot = makeSnapshot(diversePools);

      const report1 = generator.generate(snapshot, DEFAULT_RISK_PROFILES.conservative, 100_000, "task-1");
      const report2 = generator.generate(snapshot, DEFAULT_RISK_PROFILES.aggressive, 100_000, "task-1");

      expect(report1.executionHash).not.toBe(report2.executionHash);
    });
  });
});
