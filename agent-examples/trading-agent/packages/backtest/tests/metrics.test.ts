import { describe, it, expect } from "vitest";
import { PerformanceMetrics } from "../src/PerformanceMetrics.js";
import type { EquityPoint, ClosedTrade, BacktestConfig, PriceBar } from "../src/types.js";
import { DEFAULT_STRATEGY_CONFIG, DEFAULT_EXECUTION_CONFIG, DEFAULT_RISK_CONFIG } from "../src/types.js";

function makeConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`],
    quoteToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
    startDate: new Date("2024-01-01"),
    endDate: new Date("2024-12-31"),
    initialCapital: 10000,
    barInterval: "1d",
    strategy: DEFAULT_STRATEGY_CONFIG,
    execution: DEFAULT_EXECUTION_CONFIG,
    risk: DEFAULT_RISK_CONFIG,
    ...overrides,
  };
}

function makeEquityCurve(values: number[]): EquityPoint[] {
  return values.map((equity, i) => ({
    timestamp: 1704067200 + i * 86400, // Starting from 2024-01-01
    bar: i,
    equity,
    cash: equity * 0.5,
    positionsValue: equity * 0.5,
    drawdownPct: 0, // Will be recomputed by metrics
  }));
}

function makeTrade(pnl: number, pnlPct: number, holdingBars: number = 5): ClosedTrade {
  return {
    token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`,
    symbol: "WETH",
    direction: "long",
    entryPrice: 2000,
    exitPrice: pnl > 0 ? 2100 : 1900,
    entryTimestamp: 1704067200,
    exitTimestamp: 1704067200 + holdingBars * 86400,
    pnl,
    pnlPercent: pnlPct,
    holdingBars,
    exitReason: "signal",
    fees: 10,
  };
}

describe("PerformanceMetrics", () => {
  const metrics = new PerformanceMetrics();

  describe("Total return", () => {
    it("computes correct total return for profitable backtest", () => {
      const curve = makeEquityCurve([10000, 10500, 11000, 11500, 12000]);
      const config = makeConfig({ initialCapital: 10000 });
      const tokenPrices = new Map<string, PriceBar[]>();

      const result = metrics.compute(config, curve, [], tokenPrices);

      expect(result.totalReturnPct).toBe(20);
    });

    it("computes correct total return for losing backtest", () => {
      const curve = makeEquityCurve([10000, 9500, 9000, 8500, 8000]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], new Map());

      expect(result.totalReturnPct).toBe(-20);
    });

    it("handles zero-length equity curve", () => {
      const config = makeConfig({ initialCapital: 10000 });
      const result = metrics.compute(config, [], [], new Map());

      expect(result.totalReturnPct).toBe(0);
      expect(result.maxDrawdownPct).toBe(0);
    });
  });

  describe("Max drawdown", () => {
    it("computes correct max drawdown", () => {
      // Peak at 12000, trough at 9000 = 25% drawdown
      const curve = makeEquityCurve([10000, 11000, 12000, 10000, 9000, 10500]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], new Map());

      expect(result.maxDrawdownPct).toBe(25);
    });

    it("returns zero drawdown for monotonically increasing equity", () => {
      const curve = makeEquityCurve([10000, 10100, 10200, 10300]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], new Map());

      expect(result.maxDrawdownPct).toBe(0);
    });
  });

  describe("Sharpe ratio", () => {
    it("returns positive Sharpe for profitable low-vol strategy", () => {
      // Steadily increasing equity = positive return, low vol
      const curve = makeEquityCurve(
        Array.from({ length: 365 }, (_, i) => 10000 + i * 10),
      );
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], new Map());

      expect(result.sharpeRatio).toBeGreaterThan(0);
    });

    it("returns zero Sharpe when volatility is zero", () => {
      // Flat equity curve
      const curve = makeEquityCurve([10000, 10000, 10000]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], new Map());

      expect(result.sharpeRatio).toBe(0);
    });
  });

  describe("Trade statistics", () => {
    it("computes win rate correctly", () => {
      const trades = [
        makeTrade(100, 5),
        makeTrade(200, 10),
        makeTrade(-50, -2.5),
        makeTrade(150, 7.5),
      ];
      const curve = makeEquityCurve([10000, 10400]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, trades, new Map());

      expect(result.winRate).toBe(75);
      expect(result.totalTrades).toBe(4);
    });

    it("computes profit factor correctly", () => {
      const trades = [
        makeTrade(300, 15),  // Win: $300
        makeTrade(-100, -5), // Loss: $100
      ];
      const curve = makeEquityCurve([10000, 10200]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, trades, new Map());

      expect(result.profitFactor).toBe(3);
    });

    it("handles all-winning trades", () => {
      const trades = [makeTrade(100, 5), makeTrade(200, 10)];
      const curve = makeEquityCurve([10000, 10300]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, trades, new Map());

      expect(result.winRate).toBe(100);
      // Profit factor should be Infinity, but round() clamps to 0
      // when not finite
      expect(result.profitFactor).toBe(0);
    });

    it("handles no trades", () => {
      const curve = makeEquityCurve([10000, 10000]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], new Map());

      expect(result.totalTrades).toBe(0);
      expect(result.winRate).toBe(0);
    });
  });

  describe("Buy-and-hold benchmark", () => {
    it("computes buy-and-hold for single token", () => {
      const tokenPrices = new Map<string, PriceBar[]>([
        [
          "0xtoken1",
          [
            { timestamp: 1704067200, price: 100 },
            { timestamp: 1704153600, price: 150 },
          ],
        ],
      ]);
      const curve = makeEquityCurve([10000, 15000]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], tokenPrices);

      expect(result.buyAndHoldReturnPct).toBe(50);
    });

    it("computes equal-weight buy-and-hold for multiple tokens", () => {
      const tokenPrices = new Map<string, PriceBar[]>([
        [
          "0xtoken1",
          [
            { timestamp: 1704067200, price: 100 },
            { timestamp: 1704153600, price: 200 }, // +100%
          ],
        ],
        [
          "0xtoken2",
          [
            { timestamp: 1704067200, price: 50 },
            { timestamp: 1704153600, price: 50 }, // 0%
          ],
        ],
      ]);
      const curve = makeEquityCurve([10000, 15000]);
      const config = makeConfig({ initialCapital: 10000 });

      const result = metrics.compute(config, curve, [], tokenPrices);

      // (5000 * 2 + 5000 * 1 - 10000) / 10000 = 50%
      expect(result.buyAndHoldReturnPct).toBe(50);
    });
  });
});
