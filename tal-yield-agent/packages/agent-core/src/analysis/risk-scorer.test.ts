import { describe, it, expect } from "vitest";
import { RiskScorer } from "./risk-scorer.js";
import type { PoolData } from "../types.js";

function makePool(overrides: Partial<PoolData> = {}): PoolData {
  return {
    protocol: "Aave V3",
    protocolType: "lending",
    chain: 1,
    poolId: "test-pool",
    tokens: [{ symbol: "USDC", address: "0x0", decimals: 6, priceUSD: 1 }],
    currentAPY: 3.5,
    tvl: 2_500_000_000,
    volume24h: 150_000_000,
    ilRisk: 0,
    protocolRiskScore: 15,
    auditStatus: {
      audited: true,
      auditors: ["OpenZeppelin", "Trail of Bits"],
      auditCount: 12,
      bugBountyActive: true,
      bugBountySize: 10_000_000,
    },
    contractAge: 900,
    ...overrides,
  };
}

describe("RiskScorer", () => {
  const scorer = new RiskScorer();

  // ================================================================
  // Overall Score
  // ================================================================
  describe("overall score", () => {
    it("returns a score between 0 and 100", () => {
      const score = scorer.scorePool(makePool());
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
    });

    it("well-audited, old, large TVL pools score low (safe)", () => {
      const score = scorer.scorePool(makePool());
      expect(score.overall).toBeLessThan(30);
    });

    it("unaudited, new, small TVL pools score high (risky)", () => {
      const pool = makePool({
        auditStatus: {
          audited: false,
          auditors: [],
          auditCount: 0,
          bugBountyActive: false,
          bugBountySize: 0,
        },
        contractAge: 10,
        tvl: 5_000_000,
        currentAPY: 50,
        protocolRiskScore: 80,
      });
      const score = scorer.scorePool(pool);
      expect(score.overall).toBeGreaterThan(50);
    });

    it("sum of breakdown equals overall", () => {
      const score = scorer.scorePool(makePool());
      const sum =
        score.breakdown.smartContractRisk +
        score.breakdown.marketRisk +
        score.breakdown.liquidityRisk +
        score.breakdown.protocolRisk +
        score.breakdown.impermanentLoss +
        score.breakdown.regulatoryRisk;
      expect(score.overall).toBe(sum);
    });
  });

  // ================================================================
  // Smart Contract Risk
  // ================================================================
  describe("smart contract risk", () => {
    it("rewards high audit count", () => {
      const highAudit = scorer.scorePool(makePool({ auditStatus: { audited: true, auditors: ["OZ"], auditCount: 10, bugBountyActive: false, bugBountySize: 0 } }));
      const lowAudit = scorer.scorePool(makePool({ auditStatus: { audited: true, auditors: ["OZ"], auditCount: 1, bugBountyActive: false, bugBountySize: 0 } }));
      expect(highAudit.breakdown.smartContractRisk).toBeLessThanOrEqual(lowAudit.breakdown.smartContractRisk);
    });

    it("rewards older contracts", () => {
      const old = scorer.scorePool(makePool({ contractAge: 900 }));
      const young = scorer.scorePool(makePool({ contractAge: 30 }));
      expect(old.breakdown.smartContractRisk).toBeLessThan(young.breakdown.smartContractRisk);
    });

    it("rewards bug bounty", () => {
      const withBounty = scorer.scorePool(makePool({ auditStatus: { audited: true, auditors: [], auditCount: 5, bugBountyActive: true, bugBountySize: 10_000_000 } }));
      const noBounty = scorer.scorePool(makePool({ auditStatus: { audited: true, auditors: [], auditCount: 5, bugBountyActive: false, bugBountySize: 0 } }));
      expect(withBounty.breakdown.smartContractRisk).toBeLessThan(noBounty.breakdown.smartContractRisk);
    });
  });

  // ================================================================
  // Market Risk
  // ================================================================
  describe("market risk", () => {
    it("higher APY pools score higher market risk", () => {
      const lowAPY = scorer.scorePool(makePool({ currentAPY: 3 }));
      const highAPY = scorer.scorePool(makePool({ currentAPY: 50 }));
      expect(highAPY.breakdown.marketRisk).toBeGreaterThan(lowAPY.breakdown.marketRisk);
    });

    it("stays within 0-20 range", () => {
      const score = scorer.scorePool(makePool({ currentAPY: 100 }));
      expect(score.breakdown.marketRisk).toBeLessThanOrEqual(20);
      expect(score.breakdown.marketRisk).toBeGreaterThanOrEqual(0);
    });
  });

  // ================================================================
  // Liquidity Risk
  // ================================================================
  describe("liquidity risk", () => {
    it("large TVL pools score lower risk", () => {
      const largeTVL = scorer.scorePool(makePool({ tvl: 5_000_000_000 }));
      const smallTVL = scorer.scorePool(makePool({ tvl: 5_000_000 }));
      expect(largeTVL.breakdown.liquidityRisk).toBeLessThan(smallTVL.breakdown.liquidityRisk);
    });

    it("higher volume/TVL ratio reduces risk", () => {
      const highVolume = scorer.scorePool(makePool({ tvl: 1_000_000_000, volume24h: 200_000_000 }));
      const lowVolume = scorer.scorePool(makePool({ tvl: 1_000_000_000, volume24h: 1_000 }));
      expect(highVolume.breakdown.liquidityRisk).toBeLessThanOrEqual(lowVolume.breakdown.liquidityRisk);
    });
  });

  // ================================================================
  // IL Risk
  // ================================================================
  describe("impermanent loss risk", () => {
    it("zero IL maps to zero score", () => {
      const score = scorer.scorePool(makePool({ ilRisk: 0 }));
      expect(score.breakdown.impermanentLoss).toBe(0);
    });

    it("max IL maps to 15", () => {
      const score = scorer.scorePool(makePool({ ilRisk: 1 }));
      expect(score.breakdown.impermanentLoss).toBe(15);
    });
  });

  // ================================================================
  // Regulatory Risk
  // ================================================================
  describe("regulatory risk", () => {
    it("staking has lowest regulatory risk", () => {
      const staking = scorer.scorePool(makePool({ protocolType: "staking" }));
      const amm = scorer.scorePool(makePool({ protocolType: "amm" }));
      expect(staking.breakdown.regulatoryRisk).toBeLessThan(amm.breakdown.regulatoryRisk);
    });
  });

  // ================================================================
  // Confidence
  // ================================================================
  describe("confidence", () => {
    it("returns value between 0 and 1", () => {
      const score = scorer.scorePool(makePool());
      expect(score.confidence).toBeGreaterThanOrEqual(0);
      expect(score.confidence).toBeLessThanOrEqual(1);
    });

    it("audited + old + large TVL has high confidence", () => {
      const score = scorer.scorePool(makePool());
      expect(score.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("unaudited + new has lower confidence", () => {
      const pool = makePool({
        auditStatus: { audited: false, auditors: [], auditCount: 0, bugBountyActive: false, bugBountySize: 0 },
        contractAge: 10,
        tvl: 5_000_000,
      });
      const score = scorer.scorePool(pool);
      expect(score.confidence).toBeLessThan(0.7);
    });
  });

  // ================================================================
  // Determinism
  // ================================================================
  describe("determinism", () => {
    it("same input produces same output", () => {
      const pool = makePool();
      const score1 = scorer.scorePool(pool);
      const score2 = scorer.scorePool(pool);
      expect(score1).toEqual(score2);
    });
  });
});
