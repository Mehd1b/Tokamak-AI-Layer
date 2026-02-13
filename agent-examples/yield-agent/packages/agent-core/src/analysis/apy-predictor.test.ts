import { describe, it, expect } from "vitest";
import { APYPredictor } from "./apy-predictor.js";
import type { PoolData, APYTimeseries } from "../types.js";

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

function makeHistory(apyValues: number[], poolId = "aave-v3-eth-usdc"): APYTimeseries {
  const now = Date.now();
  return {
    poolId,
    protocol: "Aave V3",
    chain: 1,
    dataPoints: apyValues.map((apy, i) => ({
      timestamp: now - (apyValues.length - i) * 86400000,
      apy,
    })),
    periodDays: apyValues.length,
  };
}

describe("APYPredictor", () => {
  const predictor = new APYPredictor();

  // ================================================================
  // Basic Predictions
  // ================================================================
  describe("basic predictions", () => {
    it("returns prediction with all required fields", () => {
      const pool = makePool();
      const history = makeHistory([3.0, 3.2, 3.3, 3.4, 3.5]);
      const prediction = predictor.predict(pool, history);

      expect(prediction.pool).toBe("aave-v3-eth-usdc");
      expect(prediction.currentAPY).toBe(3.5);
      expect(prediction.predicted7d).toBeDefined();
      expect(prediction.predicted30d).toBeDefined();
      expect(prediction.predicted90d).toBeDefined();
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.methodology).toBe("ema_tvl_adjusted_with_incentive_decay");
      expect(prediction.factors.length).toBeGreaterThan(0);
    });

    it("predicted ranges have low < mean < high", () => {
      const prediction = predictor.predict(makePool(), makeHistory([3.0, 3.2, 3.4, 3.5]));
      expect(prediction.predicted30d.low).toBeLessThan(prediction.predicted30d.mean);
      expect(prediction.predicted30d.high).toBeGreaterThan(prediction.predicted30d.mean);
    });

    it("all APY values are non-negative", () => {
      const prediction = predictor.predict(makePool({ currentAPY: 0.5 }), makeHistory([0.3, 0.4, 0.5]));
      expect(prediction.predicted7d.mean).toBeGreaterThanOrEqual(0);
      expect(prediction.predicted7d.low).toBeGreaterThanOrEqual(0);
      expect(prediction.predicted30d.mean).toBeGreaterThanOrEqual(0);
      expect(prediction.predicted90d.mean).toBeGreaterThanOrEqual(0);
    });
  });

  // ================================================================
  // TVL Adjustment
  // ================================================================
  describe("TVL adjustment", () => {
    it("large TVL pools have lower predicted APY", () => {
      const history = makeHistory([5.0, 5.0, 5.0, 5.0]);
      const largeTVL = predictor.predict(makePool({ tvl: 10_000_000_000 }), history);
      const smallTVL = predictor.predict(makePool({ tvl: 50_000_000 }), history);
      expect(largeTVL.predicted30d.mean).toBeLessThan(smallTVL.predicted30d.mean);
    });
  });

  // ================================================================
  // Incentive Decay
  // ================================================================
  describe("incentive decay", () => {
    it("unsustainable APY gets decayed", () => {
      // Current APY 3x above historical average
      const pool = makePool({ currentAPY: 30 });
      const history = makeHistory([5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0]);
      const prediction = predictor.predict(pool, history);
      // Predicted should be well below current
      expect(prediction.predicted30d.mean).toBeLessThan(pool.currentAPY);
    });
  });

  // ================================================================
  // Market Regime
  // ================================================================
  describe("market regime", () => {
    it("bull market increases predictions", () => {
      const pool = makePool({ currentAPY: 5 });
      const bullHistory = makeHistory([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const prediction = predictor.predict(pool, bullHistory);
      // Bull regime factor should boost the prediction
      const bullFactor = prediction.factors.find((f) => f.name === "market_regime");
      expect(bullFactor).toBeDefined();
      expect(bullFactor!.impact).toBeGreaterThan(1);
    });

    it("bear market decreases predictions", () => {
      const pool = makePool({ currentAPY: 3 });
      const bearHistory = makeHistory([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      const prediction = predictor.predict(pool, bearHistory);
      const bearFactor = prediction.factors.find((f) => f.name === "market_regime");
      expect(bearFactor).toBeDefined();
      expect(bearFactor!.impact).toBeLessThan(1);
    });
  });

  // ================================================================
  // Prediction from Current Only
  // ================================================================
  describe("predictFromCurrent", () => {
    it("works without historical data", () => {
      const prediction = predictor.predictFromCurrent(makePool());
      expect(prediction.predicted30d.mean).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // Horizon Decay
  // ================================================================
  describe("horizon decay", () => {
    it("longer horizons have lower mean predictions", () => {
      const prediction = predictor.predict(makePool(), makeHistory([3, 3.5, 3.2, 3.4, 3.5]));
      // 90d prediction should generally be <= 30d (due to decay)
      expect(prediction.predicted90d.mean).toBeLessThanOrEqual(prediction.predicted7d.mean * 1.1);
    });

    it("longer horizons have wider confidence intervals", () => {
      const prediction = predictor.predict(makePool(), makeHistory([3, 3.5, 3.2, 3.4, 3.5]));
      const spread7d = prediction.predicted7d.high - prediction.predicted7d.low;
      const spread90d = prediction.predicted90d.high - prediction.predicted90d.low;
      expect(spread90d).toBeGreaterThan(spread7d);
    });
  });

  // ================================================================
  // Confidence
  // ================================================================
  describe("confidence", () => {
    it("more data points → higher confidence", () => {
      const pool = makePool();
      const shortHistory = makeHistory([3, 3.5]);
      const longHistory = makeHistory(Array.from({ length: 30 }, (_, i) => 3 + i * 0.01));

      const shortPred = predictor.predict(pool, shortHistory);
      const longPred = predictor.predict(pool, longHistory);
      expect(longPred.confidence).toBeGreaterThan(shortPred.confidence);
    });
  });

  // ================================================================
  // Determinism
  // ================================================================
  describe("determinism", () => {
    it("same inputs produce identical output", () => {
      const pool = makePool();
      const history = makeHistory([3.0, 3.2, 3.4, 3.5]);
      const pred1 = predictor.predict(pool, history);
      const pred2 = predictor.predict(pool, history);
      expect(pred1).toEqual(pred2);
    });
  });
});
