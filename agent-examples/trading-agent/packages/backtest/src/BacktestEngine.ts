import type { Address } from "viem";
import pino from "pino";
import { getTokenMeta } from "@tal-trading-agent/shared";
import type {
  BacktestConfig,
  BacktestResult,
  PriceBar,
} from "./types.js";
import { HistoricalDataLoader } from "./HistoricalDataLoader.js";
import { SignalEngine } from "./SignalEngine.js";
import { Portfolio } from "./Portfolio.js";
import { PerformanceMetrics } from "./PerformanceMetrics.js";

const logger = pino({ name: "backtest-engine" });

/**
 * Main backtest orchestrator. Replays historical prices bar-by-bar,
 * computes indicators on the available lookback window (no look-ahead),
 * generates signals, and simulates fills with realistic costs.
 */
export class BacktestEngine {
  private readonly dataLoader: HistoricalDataLoader;
  private readonly signalEngine: SignalEngine;
  private readonly metrics: PerformanceMetrics;

  constructor() {
    this.dataLoader = new HistoricalDataLoader();
    this.signalEngine = new SignalEngine();
    this.metrics = new PerformanceMetrics();
  }

  /**
   * Run a full backtest and return performance results.
   */
  async run(config: BacktestConfig): Promise<BacktestResult> {
    logger.info(
      {
        tokens: config.tokens.length,
        start: config.startDate.toISOString().slice(0, 10),
        end: config.endDate.toISOString().slice(0, 10),
        interval: config.barInterval,
        capital: config.initialCapital,
      },
      "Starting backtest",
    );

    // 1. Load historical prices for all tokens
    const tokenPrices = await this.loadAllPrices(config);
    if (tokenPrices.size === 0) {
      throw new Error("No price data loaded for any token");
    }

    // 2. Align timestamps across tokens
    const { alignedTimestamps, priceMatrix } = this.alignTimestamps(tokenPrices);
    if (alignedTimestamps.length === 0) {
      throw new Error("No overlapping timestamps across tokens");
    }

    logger.info(
      { bars: alignedTimestamps.length, tokens: priceMatrix.size },
      "Data aligned, starting simulation",
    );

    // 3. Initialize portfolio
    const portfolio = new Portfolio(config.initialCapital, config.execution);

    // Build bar timestamps map for entry timestamp lookups
    const barTimestamps = new Map<string, number[]>();
    for (const [token, bars] of tokenPrices) {
      barTimestamps.set(token.toLowerCase(), bars.map((b) => b.timestamp));
    }

    // Token symbol lookup
    const tokenSymbols = new Map<string, string>();
    for (const token of config.tokens) {
      const meta = getTokenMeta(token);
      tokenSymbols.set(token.toLowerCase(), meta?.symbol ?? token.slice(0, 8));
    }

    let circuitBreakerHit = false;
    let tfBlockedLongs = 0;
    let tfBlockedShorts = 0;
    let tfActive = 0;
    let tfNull = 0;

    // 4. Bar-by-bar simulation
    for (let barIdx = 0; barIdx < alignedTimestamps.length; barIdx++) {
      const timestamp = alignedTimestamps[barIdx]!;

      // Build current prices map
      const currentPrices = new Map<string, number>();
      for (const [token, prices] of priceMatrix) {
        const price = prices[barIdx];
        if (price !== undefined && price > 0) {
          currentPrices.set(token.toLowerCase(), price);
        }
      }

      // 4a. Check & execute pending orders (stop/take/trailing)
      portfolio.checkOrders(
        currentPrices,
        barIdx,
        timestamp,
        barTimestamps,
        config.risk,
      );

      // Skip signal generation and new positions if circuit breaker hit
      if (circuitBreakerHit) {
        portfolio.recordEquityPoint(currentPrices, barIdx, timestamp);
        continue;
      }

      // 4b-pre. Trend filter: compute MA direction on reference token
      let allowLongs = true;
      let allowShorts = true;
      const tf = config.strategy.trendFilter;

      if (tf.enabled) {
        const tfPrices = priceMatrix.get(tf.token.toLowerCase());
        if (tfPrices && barIdx >= tf.maPeriod) {
          const currentMA = this.computeSMA(tfPrices, barIdx, tf.maPeriod);
          const currentPrice = tfPrices[barIdx];

          if (currentMA !== null && currentPrice !== undefined && currentPrice > 0) {
            tfActive++;
            // Price-vs-MA regime filter:
            // Price above MA → uptrend regime → allow longs, block shorts
            // Price below MA → downtrend regime → allow shorts, block longs
            if (currentPrice > currentMA) {
              allowShorts = false;
              tfBlockedShorts++;
            } else {
              allowLongs = false;
              tfBlockedLongs++;
            }
          } else {
            tfNull++;
          }
        } else {
          tfNull++;
        }
      }

      // 4b. For each token, compute signals on lookback window
      const signals = new Map<string, { longScore: number; shortScore: number; atr: number }>();

      for (const [token, prices] of priceMatrix) {
        // Extract lookback window: only bars up to and including current bar
        const windowEnd = barIdx + 1;
        const windowStart = Math.max(0, windowEnd - config.strategy.lookbackBars);
        const priceWindow = prices.slice(windowStart, windowEnd).filter((p): p is number => p !== undefined && p > 0);

        if (priceWindow.length < 3) continue;

        const signal = this.signalEngine.computeSignal(priceWindow);
        signals.set(token.toLowerCase(), {
          longScore: signal.longScore,
          shortScore: signal.shortScore,
          atr: signal.atr,
        });
      }

      // 4c. Close positions where score dropped below exit threshold
      for (const pos of [...portfolio.getPositions()]) {
        const signal = signals.get(pos.token.toLowerCase());
        if (!signal) continue;

        let shouldExit = false;
        if (pos.direction === "long" && signal.longScore < config.strategy.exitThreshold) {
          shouldExit = true;
        } else if (pos.direction === "short" && signal.shortScore < config.strategy.shortExitThreshold) {
          shouldExit = true;
        }

        if (shouldExit) {
          // 1-bar execution delay: use NEXT bar's price for fill
          const nextBarPrice = barIdx + 1 < alignedTimestamps.length
            ? priceMatrix.get(pos.token)?.[barIdx + 1]
            : undefined;
          const exitPrice = nextBarPrice ?? currentPrices.get(pos.token.toLowerCase()) ?? pos.entryPrice;
          const tokenTs = barTimestamps.get(pos.token.toLowerCase()) ?? [];
          const entryTs = tokenTs[pos.entryBar] ?? timestamp;

          portfolio.closePosition(pos.id, exitPrice, "signal", barIdx, timestamp, entryTs);
        }
      }

      // 4d. Rank tokens by score and open new positions
      const ranked = [...signals.entries()]
        .map(([token, sig]) => ({ token, ...sig }))
        .sort((a, b) => b.longScore - a.longScore);

      for (const candidate of ranked) {
        if (portfolio.getOpenPositionCount() >= config.strategy.maxPositions) break;
        if (portfolio.hasPositionFor(candidate.token as Address)) continue;

        // Long entry (gated by trend filter)
        if (allowLongs && candidate.longScore >= config.strategy.entryThreshold) {
          // 1-bar execution delay: use next bar's price
          const nextBarPrice = barIdx + 1 < alignedTimestamps.length
            ? priceMatrix.get(candidate.token)?.[barIdx + 1]
            : undefined;
          const fillPrice = nextBarPrice ?? currentPrices.get(candidate.token) ?? 0;
          if (fillPrice <= 0) continue;

          const currentEquity = portfolio.computeEquity(currentPrices);
          const symbol = tokenSymbols.get(candidate.token) ?? candidate.token.slice(0, 8);

          portfolio.openPosition(
            candidate.token as Address,
            symbol,
            "long",
            fillPrice,
            config.risk.maxPositionPct,
            currentEquity,
            candidate.atr,
            config.risk,
            barIdx,
          );
        }

        // Short entry (if enabled, gated by trend filter)
        if (
          config.strategy.useShorts &&
          allowShorts &&
          !portfolio.hasPositionFor(candidate.token as Address) &&
          candidate.shortScore >= config.strategy.shortEntryThreshold
        ) {
          const nextBarPrice = barIdx + 1 < alignedTimestamps.length
            ? priceMatrix.get(candidate.token)?.[barIdx + 1]
            : undefined;
          const fillPrice = nextBarPrice ?? currentPrices.get(candidate.token) ?? 0;
          if (fillPrice <= 0) continue;

          const currentEquity = portfolio.computeEquity(currentPrices);
          const symbol = tokenSymbols.get(candidate.token) ?? candidate.token.slice(0, 8);

          portfolio.openPosition(
            candidate.token as Address,
            symbol,
            "short",
            fillPrice,
            config.risk.maxPositionPct,
            currentEquity,
            candidate.atr,
            config.risk,
            barIdx,
          );
        }
      }

      // 4e. Record equity point
      portfolio.recordEquityPoint(currentPrices, barIdx, timestamp);

      // 4f. Check circuit breaker
      if (portfolio.isCircuitBreakerTriggered(config.risk.maxDrawdownPct)) {
        logger.warn(
          { bar: barIdx, drawdown: config.risk.maxDrawdownPct },
          "Circuit breaker triggered — halting new trades",
        );
        circuitBreakerHit = true;
      }
    }

    // Debug: trend filter stats
    if (config.strategy.trendFilter.enabled) {
      logger.info(
        { tfActive, tfNull, tfBlockedLongs, tfBlockedShorts },
        "Trend filter stats",
      );
    }

    // 5. Close all remaining positions at final bar
    const lastTimestamp = alignedTimestamps.at(-1) ?? 0;
    const lastPrices = new Map<string, number>();
    for (const [token, prices] of priceMatrix) {
      const lastPrice = prices.at(-1);
      if (lastPrice !== undefined && lastPrice > 0) {
        lastPrices.set(token.toLowerCase(), lastPrice);
      }
    }
    portfolio.closeAllPositions(
      lastPrices,
      alignedTimestamps.length - 1,
      lastTimestamp,
      barTimestamps,
    );

    // 6. Compute performance metrics
    const equityCurve = [...portfolio.getEquityCurve()];
    const trades = [...portfolio.getClosedTrades()];

    const result = this.metrics.compute(config, equityCurve, trades, tokenPrices);

    logger.info(
      {
        totalReturn: `${result.totalReturnPct}%`,
        sharpe: result.sharpeRatio,
        maxDd: `${result.maxDrawdownPct}%`,
        trades: result.totalTrades,
        winRate: `${result.winRate}%`,
      },
      "Backtest complete",
    );

    return result;
  }

  // ── Data Loading ──────────────────────────────────────

  /**
   * Load prices for all tokens in config.
   */
  private async loadAllPrices(config: BacktestConfig): Promise<Map<string, PriceBar[]>> {
    const tokenPrices = new Map<string, PriceBar[]>();

    for (const token of config.tokens) {
      const bars = await this.dataLoader.loadPrices(
        token,
        config.startDate,
        config.endDate,
        config.barInterval,
      );

      if (bars.length > 0) {
        tokenPrices.set(token.toLowerCase(), bars);
        logger.info({ token, bars: bars.length }, "Loaded price data");
      } else {
        logger.warn({ token }, "No price data, skipping token");
      }
    }

    return tokenPrices;
  }

  /**
   * Align timestamps across all tokens.
   * Uses the union of all timestamps; fills forward for missing bars.
   */
  private alignTimestamps(tokenPrices: Map<string, PriceBar[]>): {
    alignedTimestamps: number[];
    priceMatrix: Map<string, (number | undefined)[]>;
  } {
    // Collect all unique timestamps
    const allTimestamps = new Set<number>();
    for (const bars of tokenPrices.values()) {
      for (const bar of bars) {
        allTimestamps.add(bar.timestamp);
      }
    }

    const alignedTimestamps = [...allTimestamps].sort((a, b) => a - b);

    // Build price matrix with forward-fill
    const priceMatrix = new Map<string, (number | undefined)[]>();

    for (const [token, bars] of tokenPrices) {
      // Build a timestamp -> price lookup
      const priceMap = new Map<number, number>();
      for (const bar of bars) {
        priceMap.set(bar.timestamp, bar.price);
      }

      // Forward-fill across aligned timestamps
      const prices: (number | undefined)[] = [];
      let lastPrice: number | undefined;

      for (const ts of alignedTimestamps) {
        const price = priceMap.get(ts);
        if (price !== undefined) {
          lastPrice = price;
        }
        prices.push(lastPrice);
      }

      priceMatrix.set(token.toLowerCase(), prices);
    }

    return { alignedTimestamps, priceMatrix };
  }

  /**
   * Compute Simple Moving Average ending at barIdx (inclusive).
   * Returns null if insufficient data.
   */
  private computeSMA(
    prices: (number | undefined)[],
    barIdx: number,
    period: number,
  ): number | null {
    if (barIdx < period - 1) return null;

    let sum = 0;
    let count = 0;
    for (let i = barIdx - period + 1; i <= barIdx; i++) {
      const p = prices[i];
      if (p !== undefined && p > 0) {
        sum += p;
        count++;
      }
    }

    return count === period ? sum / period : null;
  }
}
