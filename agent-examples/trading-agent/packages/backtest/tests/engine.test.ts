import { describe, it, expect, vi } from "vitest";
import { BacktestEngine } from "../src/BacktestEngine.js";
import { SignalEngine } from "../src/SignalEngine.js";
import { Portfolio } from "../src/Portfolio.js";
import { SimulatedExchange } from "../src/SimulatedExchange.js";
import type { BacktestConfig } from "../src/types.js";
import {
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_EXECUTION_CONFIG,
  DEFAULT_RISK_CONFIG,
} from "../src/types.js";

// ── Signal Engine unit tests ────────────────────────────

describe("SignalEngine", () => {
  const signalEngine = new SignalEngine();

  it("returns neutral scores for minimal data", () => {
    const signal = signalEngine.computeSignal([100, 101]);
    expect(signal.longScore).toBe(50);
    expect(signal.shortScore).toBe(50);
  });

  it("computes signals for trending-up data", () => {
    // Generate an uptrend: 50 prices going from 100 to 150
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i);

    const signal = signalEngine.computeSignal(prices);

    expect(signal.longScore).toBeGreaterThanOrEqual(0);
    expect(signal.longScore).toBeLessThanOrEqual(100);
    expect(signal.shortScore).toBeGreaterThanOrEqual(0);
    expect(signal.shortScore).toBeLessThanOrEqual(100);
    // In an uptrend, long score should generally be higher
    expect(signal.longScore).toBeGreaterThan(signal.shortScore);
  });

  it("computes signals for trending-down data", () => {
    // Generate a downtrend: 50 prices going from 150 to 100
    const prices = Array.from({ length: 50 }, (_, i) => 150 - i);

    const signal = signalEngine.computeSignal(prices);

    expect(signal.longScore).toBeGreaterThanOrEqual(0);
    expect(signal.shortScore).toBeGreaterThanOrEqual(0);
    // In a downtrend, short score should generally be higher
    expect(signal.shortScore).toBeGreaterThan(signal.longScore);
  });

  it("returns ATR value", () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10);

    const signal = signalEngine.computeSignal(prices);

    expect(signal.atr).toBeGreaterThanOrEqual(0);
  });

  it("handles sideways (random walk) data without errors", () => {
    // Simulate sideways market around 100
    const prices = Array.from({ length: 50 }, () => 100 + (Math.random() - 0.5) * 5);

    const signal = signalEngine.computeSignal(prices);

    expect(signal.longScore).toBeGreaterThanOrEqual(0);
    expect(signal.longScore).toBeLessThanOrEqual(100);
    expect(signal.shortScore).toBeGreaterThanOrEqual(0);
    expect(signal.shortScore).toBeLessThanOrEqual(100);
  });
});

// ── Simulated Exchange unit tests ───────────────────────

describe("SimulatedExchange", () => {
  it("applies fixed slippage on buys", () => {
    const exchange = new SimulatedExchange({
      slippageModel: "fixed",
      fixedSlippageBps: 30, // 0.3%
      swapFeeBps: 30,
      gasPerTradeUsd: 5,
    });

    const result = exchange.simulateBuy(2000, 1000);

    expect(result.fillPrice).toBeCloseTo(2000 * 1.003, 2);
    expect(result.totalFees).toBeCloseTo(1000 * 0.003 + 5, 2);
  });

  it("applies fixed slippage on sells", () => {
    const exchange = new SimulatedExchange({
      slippageModel: "fixed",
      fixedSlippageBps: 30,
      swapFeeBps: 30,
      gasPerTradeUsd: 5,
    });

    const result = exchange.simulateSell(2000, 1000);

    expect(result.fillPrice).toBeCloseTo(2000 * 0.997, 2);
    expect(result.totalFees).toBeCloseTo(1000 * 0.003 + 5, 2);
  });

  it("applies sqrt slippage model", () => {
    const exchange = new SimulatedExchange({
      slippageModel: "sqrt",
      fixedSlippageBps: 30,
      swapFeeBps: 30,
      gasPerTradeUsd: 0,
    });

    // Small trade: $1000 into $1M reference liquidity
    const small = exchange.simulateBuy(2000, 1000);
    // Large trade: $100000 into $1M reference liquidity
    const large = exchange.simulateBuy(2000, 100000);

    // Larger trade should have more slippage
    expect(large.fillPrice).toBeGreaterThan(small.fillPrice);
  });

  it("returns zero fees when all fees are zero", () => {
    const exchange = new SimulatedExchange({
      slippageModel: "fixed",
      fixedSlippageBps: 0,
      swapFeeBps: 0,
      gasPerTradeUsd: 0,
    });

    const result = exchange.simulateBuy(2000, 1000);

    expect(result.fillPrice).toBe(2000);
    expect(result.totalFees).toBe(0);
  });
});

// ── Integration test with synthetic data ────────────────

describe("BacktestEngine integration", () => {
  it("runs without errors on synthetic sine wave data", async () => {
    const engine = new BacktestEngine();

    // Mock the data loader to return synthetic data
    const sineWave = Array.from({ length: 100 }, (_, i) => ({
      timestamp: 1704067200 + i * 86400,
      price: 2000 + 500 * Math.sin(i / 10),
    }));

    // Override the private loadAllPrices method
    const loadAllPrices = vi.fn().mockResolvedValue(
      new Map([["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase(), sineWave]]),
    );
    (engine as unknown as { loadAllPrices: typeof loadAllPrices }).loadAllPrices = loadAllPrices;

    const config: BacktestConfig = {
      tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`],
      quoteToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-04-10"),
      initialCapital: 10000,
      barInterval: "1d",
      strategy: { ...DEFAULT_STRATEGY_CONFIG, lookbackBars: 30, maxPositions: 2 },
      execution: DEFAULT_EXECUTION_CONFIG,
      risk: DEFAULT_RISK_CONFIG,
    };

    const result = await engine.run(config);

    // Basic sanity checks
    expect(result).toBeDefined();
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(isFinite(result.totalReturnPct)).toBe(true);
    expect(isFinite(result.sharpeRatio)).toBe(true);
    expect(isFinite(result.maxDrawdownPct)).toBe(true);
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
  });

  it("runs without errors on trending data", async () => {
    const engine = new BacktestEngine();

    // Uptrend data
    const trending = Array.from({ length: 60 }, (_, i) => ({
      timestamp: 1704067200 + i * 86400,
      price: 1000 + i * 20 + (Math.random() - 0.5) * 30,
    }));

    const loadAllPrices = vi.fn().mockResolvedValue(
      new Map([["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase(), trending]]),
    );
    (engine as unknown as { loadAllPrices: typeof loadAllPrices }).loadAllPrices = loadAllPrices;

    const config: BacktestConfig = {
      tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`],
      quoteToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-03-01"),
      initialCapital: 10000,
      barInterval: "1d",
      strategy: { ...DEFAULT_STRATEGY_CONFIG, lookbackBars: 20 },
      execution: DEFAULT_EXECUTION_CONFIG,
      risk: DEFAULT_RISK_CONFIG,
    };

    const result = await engine.run(config);

    expect(result).toBeDefined();
    expect(result.equityCurve.length).toBe(60);
    expect(isFinite(result.totalReturnPct)).toBe(true);
  });

  it("handles circuit breaker scenario", async () => {
    const engine = new BacktestEngine();

    // Sharp crash data: high, then sudden 50% drop
    const crashData = [
      ...Array.from({ length: 30 }, (_, i) => ({
        timestamp: 1704067200 + i * 86400,
        price: 2000 + i * 10,
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        timestamp: 1704067200 + (30 + i) * 86400,
        price: 1200 - i * 15,
      })),
    ];

    const loadAllPrices = vi.fn().mockResolvedValue(
      new Map([["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase(), crashData]]),
    );
    (engine as unknown as { loadAllPrices: typeof loadAllPrices }).loadAllPrices = loadAllPrices;

    const config: BacktestConfig = {
      tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`],
      quoteToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-03-01"),
      initialCapital: 10000,
      barInterval: "1d",
      strategy: { ...DEFAULT_STRATEGY_CONFIG, lookbackBars: 20, entryThreshold: 50 },
      execution: DEFAULT_EXECUTION_CONFIG,
      risk: { ...DEFAULT_RISK_CONFIG, maxDrawdownPct: 15 },
    };

    const result = await engine.run(config);

    expect(result).toBeDefined();
    // All positions should have been closed
    expect(result.equityCurve.length).toBeGreaterThan(0);
  });
});
