import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { RiskScorer } from "./risk-scorer.js";
import { StrategyGenerator } from "./strategy-generator.js";
import { DEFAULT_RISK_PROFILES } from "./types.js";
import type { PoolData, DataSnapshot } from "../types.js";
import type { RiskLevel, RiskProfile } from "./types.js";
import { SnapshotManager } from "../snapshot/snapshot-manager.js";

// ============================================================
// Arbitrary generators
// ============================================================

const arbPoolData: fc.Arbitrary<PoolData> = fc.record({
  protocol: fc.constantFrom("Aave V3", "Compound V3", "Lido", "Curve", "Uniswap V3"),
  protocolType: fc.constantFrom("lending", "liquid-staking", "stableswap", "amm") as fc.Arbitrary<PoolData["protocolType"]>,
  chain: fc.constantFrom(1, 10, 42161) as fc.Arbitrary<PoolData["chain"]>,
  poolId: fc.string({ minLength: 3, maxLength: 20 }).map((s) => `pool-${s.replace(/[^a-z0-9]/gi, "x")}`),
  tokens: fc.constant([{ symbol: "USDC", address: "0x0", decimals: 6, priceUSD: 1 }]),
  currentAPY: fc.double({ min: 0, max: 50, noNaN: true }),
  tvl: fc.double({ min: 1_000, max: 100_000_000_000, noNaN: true }),
  volume24h: fc.double({ min: 0, max: 10_000_000_000, noNaN: true }),
  ilRisk: fc.double({ min: 0, max: 1, noNaN: true }),
  protocolRiskScore: fc.integer({ min: 0, max: 100 }),
  auditStatus: fc.constant({
    audited: true,
    auditors: ["OZ"],
    auditCount: 5,
    bugBountyActive: true,
    bugBountySize: 1_000_000,
  }),
  contractAge: fc.integer({ min: 1, max: 3000 }),
});

const arbRiskLevel: fc.Arbitrary<RiskLevel> = fc.constantFrom("conservative", "moderate", "aggressive");

function makeSnapshot(pools: PoolData[]): DataSnapshot {
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

// ============================================================
// Property-based tests
// ============================================================

describe("Property-based: RiskScorer", () => {
  const scorer = new RiskScorer();

  it("risk score is always 0-100 for any valid pool", () => {
    fc.assert(
      fc.property(arbPoolData, (pool) => {
        const score = scorer.scorePool(pool);
        expect(score.overall).toBeGreaterThanOrEqual(0);
        expect(score.overall).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 },
    );
  });

  it("confidence is always 0-1 for any valid pool", () => {
    fc.assert(
      fc.property(arbPoolData, (pool) => {
        const score = scorer.scorePool(pool);
        expect(score.confidence).toBeGreaterThanOrEqual(0);
        expect(score.confidence).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });

  it("risk breakdown components are non-negative", () => {
    fc.assert(
      fc.property(arbPoolData, (pool) => {
        const score = scorer.scorePool(pool);
        expect(score.breakdown.smartContractRisk).toBeGreaterThanOrEqual(0);
        expect(score.breakdown.marketRisk).toBeGreaterThanOrEqual(0);
        expect(score.breakdown.liquidityRisk).toBeGreaterThanOrEqual(0);
        expect(score.breakdown.protocolRisk).toBeGreaterThanOrEqual(0);
        expect(score.breakdown.impermanentLoss).toBeGreaterThanOrEqual(0);
        expect(score.breakdown.regulatoryRisk).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property-based: StrategyGenerator", () => {
  const generator = new StrategyGenerator();

  it("allocations always sum to ≤ 100%", () => {
    fc.assert(
      fc.property(
        fc.array(arbPoolData, { minLength: 1, maxLength: 10 }),
        arbRiskLevel,
        fc.double({ min: 100, max: 10_000_000, noNaN: true }),
        (pools, riskLevel, capitalUSD) => {
          const snapshot = makeSnapshot(pools);
          const profile = DEFAULT_RISK_PROFILES[riskLevel];
          const report = generator.generate(snapshot, profile, capitalUSD, "prop-test");

          const totalPct = report.allocations.reduce((s, a) => s + a.percentage, 0);
          expect(totalPct).toBeLessThanOrEqual(1.001); // small tolerance for float rounding
        },
      ),
      { numRuns: 100 },
    );
  });

  it("no single allocation exceeds 100%", () => {
    fc.assert(
      fc.property(
        fc.array(arbPoolData, { minLength: 1, maxLength: 10 }),
        arbRiskLevel,
        (pools, riskLevel) => {
          const snapshot = makeSnapshot(pools);
          const profile = DEFAULT_RISK_PROFILES[riskLevel];
          const report = generator.generate(snapshot, profile, 100_000, "prop-test");

          for (const alloc of report.allocations) {
            expect(alloc.percentage).toBeLessThanOrEqual(1.001);
            expect(alloc.percentage).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("executionHash is deterministic for same inputs", () => {
    fc.assert(
      fc.property(
        fc.array(arbPoolData, { minLength: 1, maxLength: 5 }),
        arbRiskLevel,
        (pools, riskLevel) => {
          const snapshot = makeSnapshot(pools);
          const profile = DEFAULT_RISK_PROFILES[riskLevel];

          const report1 = generator.generate(snapshot, profile, 100_000, "prop-test");
          const report2 = generator.generate(snapshot, profile, 100_000, "prop-test");

          expect(report1.executionHash).toBe(report2.executionHash);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("each allocation has entry steps and exit conditions", () => {
    fc.assert(
      fc.property(
        fc.array(arbPoolData, { minLength: 1, maxLength: 5 }),
        arbRiskLevel,
        (pools, riskLevel) => {
          const snapshot = makeSnapshot(pools);
          const profile = DEFAULT_RISK_PROFILES[riskLevel];
          const report = generator.generate(snapshot, profile, 100_000, "prop-test");

          for (const alloc of report.allocations) {
            expect(alloc.entrySteps.length).toBeGreaterThanOrEqual(2);
            expect(alloc.exitConditions.length).toBeGreaterThanOrEqual(3);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
