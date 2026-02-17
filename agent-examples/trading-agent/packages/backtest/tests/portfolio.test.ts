import { describe, it, expect } from "vitest";
import { Portfolio } from "../src/Portfolio.js";
import type { ExecutionConfig, RiskConfig } from "../src/types.js";
import { DEFAULT_EXECUTION_CONFIG, DEFAULT_RISK_CONFIG } from "../src/types.js";
import type { Address } from "viem";

const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const UNI: Address = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

const execConfig: ExecutionConfig = {
  ...DEFAULT_EXECUTION_CONFIG,
  fixedSlippageBps: 0, // Zero slippage for deterministic tests
  swapFeeBps: 0,
  gasPerTradeUsd: 0,
};

const riskConfig: RiskConfig = {
  ...DEFAULT_RISK_CONFIG,
  maxPositionPct: 20,
  stopLossAtrMultiple: 2,
  takeProfitAtrMultiple: 4,
  trailingStopPct: null,
};

describe("Portfolio", () => {
  describe("Opening positions", () => {
    it("opens a long position and deducts cash", () => {
      const portfolio = new Portfolio(10000, execConfig);

      const pos = portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 50, riskConfig, 0,
      );

      expect(pos).not.toBeNull();
      expect(pos!.direction).toBe("long");
      expect(pos!.entryPrice).toBe(2000);
      expect(portfolio.getCash()).toBe(8000); // 20% of 10000 = 2000 deducted
      expect(portfolio.getOpenPositionCount()).toBe(1);
    });

    it("opens a short position", () => {
      const portfolio = new Portfolio(10000, execConfig);

      const pos = portfolio.openPosition(
        WETH, "WETH", "short", 2000, 20, 10000, 50, riskConfig, 0,
      );

      expect(pos).not.toBeNull();
      expect(pos!.direction).toBe("short");
    });

    it("returns null when insufficient cash", () => {
      const portfolio = new Portfolio(100, execConfig);

      const pos = portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 100, 50, riskConfig, 0,
      );

      // Should still open with 20% of 100 = $20
      expect(pos).not.toBeNull();

      // Try to open another position with more than remaining cash
      const pos2 = portfolio.openPosition(
        UNI, "UNI", "long", 10, 100, 100, 1, riskConfig, 0,
      );
      // 100% of 100 = 100, but we only have 80
      expect(pos2).toBeNull();
    });

    it("sets stop-loss and take-profit based on ATR", () => {
      const portfolio = new Portfolio(10000, execConfig);

      const pos = portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 100, riskConfig, 0,
      );

      expect(pos).not.toBeNull();
      // SL = entry - 2 * ATR = 2000 - 200 = 1800
      expect(pos!.stopLoss).toBe(1800);
      // TP = entry + 4 * ATR = 2000 + 400 = 2400
      expect(pos!.takeProfit).toBe(2400);
    });

    it("detects existing position for token", () => {
      const portfolio = new Portfolio(10000, execConfig);

      portfolio.openPosition(WETH, "WETH", "long", 2000, 20, 10000, 50, riskConfig, 0);

      expect(portfolio.hasPositionFor(WETH)).toBe(true);
      expect(portfolio.hasPositionFor(UNI)).toBe(false);
    });
  });

  describe("Closing positions", () => {
    it("closes a profitable long position", () => {
      const portfolio = new Portfolio(10000, execConfig);

      const pos = portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 50, riskConfig, 0,
      );

      const trade = portfolio.closePosition(
        pos!.id, 2200, "signal", 10, Date.now(), Date.now() - 1000,
      );

      expect(trade).not.toBeNull();
      expect(trade!.pnl).toBeGreaterThan(0);
      expect(trade!.exitReason).toBe("signal");
      expect(portfolio.getOpenPositionCount()).toBe(0);
      // Cash should be back and then some
      expect(portfolio.getCash()).toBeGreaterThan(10000);
    });

    it("closes a losing long position", () => {
      const portfolio = new Portfolio(10000, execConfig);

      const pos = portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 50, riskConfig, 0,
      );

      const trade = portfolio.closePosition(
        pos!.id, 1800, "stop_loss", 5, Date.now(), Date.now() - 1000,
      );

      expect(trade).not.toBeNull();
      expect(trade!.pnl).toBeLessThan(0);
      expect(portfolio.getCash()).toBeLessThan(10000);
    });

    it("returns null for non-existent position", () => {
      const portfolio = new Portfolio(10000, execConfig);

      const trade = portfolio.closePosition(
        "nonexistent", 2000, "signal", 0, Date.now(), Date.now(),
      );

      expect(trade).toBeNull();
    });
  });

  describe("Stop-loss execution", () => {
    it("triggers stop-loss on long when price drops below", () => {
      const portfolio = new Portfolio(10000, execConfig);

      portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 100, riskConfig, 0,
      );
      // SL at 1800

      const prices = new Map<string, number>([[WETH.toLowerCase(), 1750]]);
      const barTs = new Map<string, number[]>([[WETH.toLowerCase(), [1000, 2000]]]);

      const triggered = portfolio.checkOrders(prices, 1, 2000, barTs, riskConfig);

      expect(triggered.length).toBe(1);
      expect(triggered[0]!.exitReason).toBe("stop_loss");
    });

    it("does not trigger stop-loss when price is above", () => {
      const portfolio = new Portfolio(10000, execConfig);

      portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 100, riskConfig, 0,
      );

      const prices = new Map<string, number>([[WETH.toLowerCase(), 2100]]);
      const barTs = new Map<string, number[]>();

      const triggered = portfolio.checkOrders(prices, 1, 2000, barTs, riskConfig);

      expect(triggered.length).toBe(0);
    });
  });

  describe("Take-profit execution", () => {
    it("triggers take-profit on long when price rises above", () => {
      const portfolio = new Portfolio(10000, execConfig);

      portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 100, riskConfig, 0,
      );
      // TP at 2400

      const prices = new Map<string, number>([[WETH.toLowerCase(), 2500]]);
      const barTs = new Map<string, number[]>([[WETH.toLowerCase(), [1000, 2000]]]);

      const triggered = portfolio.checkOrders(prices, 1, 2000, barTs, riskConfig);

      expect(triggered.length).toBe(1);
      expect(triggered[0]!.exitReason).toBe("take_profit");
    });
  });

  describe("Equity tracking", () => {
    it("records equity points correctly", () => {
      const portfolio = new Portfolio(10000, execConfig);

      portfolio.openPosition(
        WETH, "WETH", "long", 2000, 20, 10000, 50, riskConfig, 0,
      );

      const prices = new Map<string, number>([[WETH.toLowerCase(), 2100]]);
      const point = portfolio.recordEquityPoint(prices, 1, 1000);

      expect(point.equity).toBeGreaterThan(10000);
      expect(point.cash).toBe(8000);
      expect(point.positionsValue).toBeGreaterThan(0);
      expect(point.bar).toBe(1);
    });

    it("computes drawdown from peak", () => {
      const portfolio = new Portfolio(10000, execConfig);

      // Record peak
      const prices1 = new Map<string, number>();
      portfolio.recordEquityPoint(prices1, 0, 1000);

      portfolio.openPosition(
        WETH, "WETH", "long", 2000, 50, 10000, 50, riskConfig, 1,
      );

      // Price drops
      const prices2 = new Map<string, number>([[WETH.toLowerCase(), 1600]]);
      const point = portfolio.recordEquityPoint(prices2, 2, 2000);

      expect(point.drawdownPct).toBeGreaterThan(0);
    });
  });

  describe("Circuit breaker", () => {
    it("triggers when drawdown exceeds max", () => {
      const portfolio = new Portfolio(10000, execConfig);

      // Simulate a large drawdown by recording equity points
      const pricesUp = new Map<string, number>();
      portfolio.recordEquityPoint(pricesUp, 0, 1000); // equity = 10000, peak = 10000

      // Open a large position
      portfolio.openPosition(
        WETH, "WETH", "long", 2000, 50, 10000, 50, riskConfig, 1,
      );

      // Price tanks hard — 50% drop in position
      const pricesDown = new Map<string, number>([[WETH.toLowerCase(), 1000]]);
      portfolio.recordEquityPoint(pricesDown, 2, 2000);

      expect(portfolio.isCircuitBreakerTriggered(25)).toBe(true);
    });

    it("does not trigger when drawdown is within limit", () => {
      const portfolio = new Portfolio(10000, execConfig);
      const prices = new Map<string, number>();
      portfolio.recordEquityPoint(prices, 0, 1000);

      expect(portfolio.isCircuitBreakerTriggered(25)).toBe(false);
    });
  });

  describe("Close all positions", () => {
    it("closes all open positions at end of data", () => {
      const portfolio = new Portfolio(10000, execConfig);

      portfolio.openPosition(WETH, "WETH", "long", 2000, 20, 10000, 50, riskConfig, 0);
      portfolio.openPosition(UNI, "UNI", "long", 10, 20, 10000, 1, riskConfig, 0);

      expect(portfolio.getOpenPositionCount()).toBe(2);

      const prices = new Map<string, number>([
        [WETH.toLowerCase(), 2100],
        [UNI.toLowerCase(), 11],
      ]);
      const barTs = new Map<string, number[]>();

      const trades = portfolio.closeAllPositions(prices, 10, Date.now(), barTs);

      expect(trades.length).toBe(2);
      expect(portfolio.getOpenPositionCount()).toBe(0);
      for (const t of trades) {
        expect(t.exitReason).toBe("end_of_data");
      }
    });
  });
});
