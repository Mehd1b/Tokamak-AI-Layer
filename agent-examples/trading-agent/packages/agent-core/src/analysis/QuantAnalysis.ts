import type { Address } from "viem";
import pino from "pino";
import { DEFILLAMA, HORIZON_TO_LLAMA_PERIOD, MIN_DATA_POINTS } from "@tal-trading-agent/shared";
import type { PoolData, QuantScore, DataQuality, TradeRequest } from "@tal-trading-agent/shared";

const logger = pino({ name: "quant-analysis" });

// ── DeFiLlama API response types ───────────────────────────

interface LlamaPrice {
  price: number;
  symbol: string;
  timestamp: number;
  confidence: number;
}

interface LlamaPriceResponse {
  coins: Record<string, LlamaPrice>;
}

interface LlamaChartPoint {
  timestamp: number;
  price: number;
}

interface LlamaChartResponse {
  coins: Record<string, { prices: LlamaChartPoint[] }>;
}

// ── Technical indicator types ───────────────────────────────

interface TechnicalIndicators {
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  vwap: number;
  momentum: number;
}

interface DeFiMetrics {
  liquidityDepth: number;
  feeApy: number;
  volumeTrend: number;
  tvlStability: number;
  smartMoneyFlow: number;
}

// ── QuantAnalysis ───────────────────────────────────────────

export class QuantAnalysis {
  /**
   * Fetch the current USD price for a token via DeFiLlama.
   */
  async getCurrentPrice(tokenAddress: Address): Promise<number> {
    try {
      const coinId = `ethereum:${tokenAddress}`;
      const url = `${DEFILLAMA.pricesUrl}/${encodeURIComponent(coinId)}`;
      const response = await fetch(url);
      if (!response.ok) {
        logger.warn({ tokenAddress, status: response.status }, "DeFiLlama price request failed");
        return 0;
      }
      const data = (await response.json()) as LlamaPriceResponse;
      return data.coins[coinId]?.price ?? 0;
    } catch (error) {
      logger.error({ tokenAddress, error }, "Failed to fetch current price");
      return 0;
    }
  }

  /**
   * Fetch historical price data from DeFiLlama chart API.
   * Period is determined by the trading horizon.
   */
  async getHistoricalPrices(
    tokenAddress: Address,
    horizon: TradeRequest["horizon"] = "1w",
  ): Promise<number[]> {
    try {
      const coinId = `ethereum:${tokenAddress}`;
      const period = HORIZON_TO_LLAMA_PERIOD[horizon];
      const url = `${DEFILLAMA.chartUrl}/${encodeURIComponent(coinId)}?period=${period}`;
      const response = await fetch(url);
      if (!response.ok) {
        logger.warn({ tokenAddress, status: response.status, period }, "DeFiLlama chart request failed");
        return [];
      }

      const data = (await response.json()) as LlamaChartResponse;
      const points = data.coins[coinId]?.prices ?? [];

      // Sort ascending by timestamp and extract prices
      points.sort((a, b) => a.timestamp - b.timestamp);
      return points.map((p) => p.price);
    } catch (error) {
      logger.error({ tokenAddress, error }, "Failed to fetch historical prices");
      return [];
    }
  }

  /**
   * Compute all technical indicators from price series.
   */
  computeTechnicalIndicators(prices: number[]): TechnicalIndicators {
    const currentPrice = prices.at(-1) ?? 0;

    return {
      rsi: this.computeRSI(prices, 14),
      macd: this.computeMACD(prices, 12, 26, 9),
      bollingerBands: this.computeBollingerBands(prices, 20, 2),
      vwap: this.computeVWAP(prices),
      momentum: this.computeMomentum(prices, currentPrice),
    };
  }

  /**
   * Compute DeFi-specific metrics from pool data.
   */
  computeDeFiMetrics(
    pools: PoolData[],
    historicalPrices: number[],
  ): DeFiMetrics {
    return {
      liquidityDepth: this.scoreLiquidityDepth(pools),
      feeApy: this.scoreAvgFeeApy(pools),
      volumeTrend: this.scoreVolumeTrend(pools),
      tvlStability: this.scoreTvlStability(pools, historicalPrices),
      smartMoneyFlow: this.scoreSmartMoneyFlow(pools, historicalPrices),
    };
  }

  /**
   * Compute data confidence score based on available data points vs minimum needed.
   */
  computeDataConfidence(
    dataPoints: number,
    horizon: TradeRequest["horizon"],
  ): DataQuality {
    const minNeeded = MIN_DATA_POINTS[horizon];
    const ratio = dataPoints / minNeeded;
    const confidenceScore = Math.min(1, ratio);

    let confidenceNote: string;
    let indicatorsReliable: boolean;

    if (ratio >= 1) {
      confidenceNote = "Sufficient price data for reliable technical analysis.";
      indicatorsReliable = true;
    } else if (ratio >= 0.5) {
      confidenceNote = `Only ${dataPoints}/${minNeeded} data points available. Technical indicators have reduced reliability.`;
      indicatorsReliable = false;
    } else {
      confidenceNote = `Insufficient data (${dataPoints}/${minNeeded} points). RSI=50 and MACD=0 are DEFAULT values, NOT real market signals. Rely on DeFi metrics instead.`;
      indicatorsReliable = false;
    }

    return {
      priceDataPoints: dataPoints,
      indicatorsReliable,
      confidenceScore,
      confidenceNote,
    };
  }

  /**
   * Full analysis: fetches prices, computes indicators and DeFi metrics.
   * Returns a complete QuantScore for a single token.
   */
  async analyzeToken(
    tokenAddress: Address,
    symbol: string,
    pools: PoolData[],
    horizon: TradeRequest["horizon"] = "1w",
  ): Promise<QuantScore> {
    const [currentPrice, historicalPrices] = await Promise.all([
      this.getCurrentPrice(tokenAddress),
      this.getHistoricalPrices(tokenAddress, horizon),
    ]);

    // Need at least some price data for meaningful analysis
    const prices =
      historicalPrices.length > 0 ? historicalPrices : [currentPrice];

    const indicators = this.computeTechnicalIndicators(prices);
    const defiMetrics = this.computeDeFiMetrics(pools, prices);
    const dataQuality = this.computeDataConfidence(historicalPrices.length, horizon);

    const reasoning = this.generateReasoning(symbol, indicators, defiMetrics, dataQuality);

    return {
      tokenAddress,
      symbol,
      indicators,
      defiMetrics,
      overallScore: 0, // Filled by TokenScorer
      reasoning,
      dataQuality,
    };
  }

  // ── Technical Indicators ──────────────────────────────────

  /**
   * RSI (Relative Strength Index) - 14-period default.
   * Returns value between 0 and 100.
   */
  private computeRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50; // Neutral when insufficient data

    // Use the last (period + 1) prices
    const slice = prices.slice(-(period + 1));
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < slice.length; i++) {
      const change = slice[i]! - slice[i - 1]!;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /**
   * MACD (Moving Average Convergence Divergence).
   * Uses EMA with periods (fast=12, slow=26, signal=9).
   */
  private computeMACD(
    prices: number[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number,
  ): { value: number; signal: number; histogram: number } {
    if (prices.length < slowPeriod) {
      return { value: 0, signal: 0, histogram: 0 };
    }

    const fastEMA = this.computeEMA(prices, fastPeriod);
    const slowEMA = this.computeEMA(prices, slowPeriod);

    // MACD line = fastEMA - slowEMA
    const macdLine: number[] = [];
    const offset = fastEMA.length - slowEMA.length;
    for (let i = 0; i < slowEMA.length; i++) {
      macdLine.push(fastEMA[i + offset]! - slowEMA[i]!);
    }

    // Signal line = EMA of MACD line
    const signalLine = this.computeEMA(macdLine, signalPeriod);

    const latestMacd = macdLine.at(-1) ?? 0;
    const latestSignal = signalLine.at(-1) ?? 0;

    return {
      value: latestMacd,
      signal: latestSignal,
      histogram: latestMacd - latestSignal,
    };
  }

  /**
   * Bollinger Bands (20-period, 2 standard deviations).
   */
  private computeBollingerBands(
    prices: number[],
    period: number,
    multiplier: number,
  ): { upper: number; middle: number; lower: number } {
    if (prices.length < period) {
      const price = prices.at(-1) ?? 0;
      return { upper: price, middle: price, lower: price };
    }

    const slice = prices.slice(-period);
    const middle = slice.reduce((sum, p) => sum + p, 0) / period;
    const variance =
      slice.reduce((sum, p) => sum + (p - middle) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: middle + multiplier * stdDev,
      middle,
      lower: middle - multiplier * stdDev,
    };
  }

  /**
   * VWAP approximation. Without real volume data per candle, we use
   * a simple average of prices weighted by position (more recent = higher weight).
   */
  private computeVWAP(prices: number[]): number {
    if (prices.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < prices.length; i++) {
      const weight = i + 1; // Linear increasing weight
      weightedSum += prices[i]! * weight;
      totalWeight += weight;
    }

    return weightedSum / totalWeight;
  }

  /**
   * Momentum: rate of change over the available period.
   * Returns percentage change from the oldest to the newest price.
   */
  private computeMomentum(prices: number[], currentPrice: number): number {
    if (prices.length < 2) return 0;
    const oldest = prices[0]!;
    if (oldest === 0) return 0;
    return ((currentPrice - oldest) / oldest) * 100;
  }

  /**
   * Compute Exponential Moving Average.
   */
  private computeEMA(data: number[], period: number): number[] {
    if (data.length < period) return data.length > 0 ? [data.at(-1)!] : [];

    const multiplier = 2 / (period + 1);
    const result: number[] = [];

    // Seed with SMA of first `period` values
    let sma = 0;
    for (let i = 0; i < period; i++) {
      sma += data[i]!;
    }
    sma /= period;
    result.push(sma);

    // EMA for subsequent values
    for (let i = period; i < data.length; i++) {
      const ema = (data[i]! - result.at(-1)!) * multiplier + result.at(-1)!;
      result.push(ema);
    }

    return result;
  }

  // ── DeFi Metrics ──────────────────────────────────────────

  /**
   * Liquidity depth score (0-100) based on pool liquidity.
   */
  private scoreLiquidityDepth(pools: PoolData[]): number {
    if (pools.length === 0) return 0;

    // Sum up TVL across all pools for this token
    const totalTvl = pools.reduce((sum, p) => sum + p.tvlUsd, 0);

    // Scale: $0 -> 0, $1M -> 50, $10M -> 75, $100M+ -> 100
    if (totalTvl >= 100_000_000) return 100;
    if (totalTvl >= 10_000_000) return 75 + (25 * (totalTvl - 10_000_000)) / 90_000_000;
    if (totalTvl >= 1_000_000) return 50 + (25 * (totalTvl - 1_000_000)) / 9_000_000;
    return (50 * totalTvl) / 1_000_000;
  }

  /**
   * Average fee APY across pools, normalized 0-100.
   */
  private scoreAvgFeeApy(pools: PoolData[]): number {
    if (pools.length === 0) return 0;
    const avgApy = pools.reduce((sum, p) => sum + p.feeApy, 0) / pools.length;
    // Scale: 0% -> 0, 5% -> 25, 20% -> 50, 50%+ -> 100
    return Math.min(100, avgApy * 2);
  }

  /**
   * Volume trend score. Without live volume data, derive from pool metrics.
   */
  private scoreVolumeTrend(pools: PoolData[]): number {
    if (pools.length === 0) return 0;
    const totalVolume = pools.reduce((sum, p) => sum + p.volume24hUsd, 0);
    // Scale: $0 -> 0, $1M -> 50, $50M+ -> 100
    if (totalVolume >= 50_000_000) return 100;
    if (totalVolume >= 1_000_000) return 50 + (50 * (totalVolume - 1_000_000)) / 49_000_000;
    return (50 * totalVolume) / 1_000_000;
  }

  /**
   * TVL stability: derived from price volatility (lower volatility = more stable).
   */
  private scoreTvlStability(
    pools: PoolData[],
    historicalPrices: number[],
  ): number {
    if (historicalPrices.length < 2) return 50; // Neutral when insufficient data

    // Calculate price volatility as proxy for TVL stability
    const returns: number[] = [];
    for (let i = 1; i < historicalPrices.length; i++) {
      const prev = historicalPrices[i - 1]!;
      if (prev === 0) continue;
      returns.push((historicalPrices[i]! - prev) / prev);
    }

    if (returns.length === 0) return 50;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Lower volatility = higher stability score
    // vol < 1% -> 100, vol 1-5% -> 60-100, vol 5-20% -> 20-60, vol > 20% -> 0-20
    if (volatility < 0.01) return 100;
    if (volatility < 0.05) return 60 + (40 * (0.05 - volatility)) / 0.04;
    if (volatility < 0.2) return 20 + (40 * (0.2 - volatility)) / 0.15;
    return Math.max(0, 20 - (volatility - 0.2) * 100);
  }

  /**
   * Smart money flow heuristic. Uses momentum and liquidity as signals.
   * Positive momentum + high liquidity = likely inflows.
   */
  private scoreSmartMoneyFlow(
    pools: PoolData[],
    historicalPrices: number[],
  ): number {
    if (historicalPrices.length < 2) return 50;

    // Use recent momentum as a proxy for smart money
    const recent = historicalPrices.slice(-24); // Last ~24 data points
    const oldest = recent[0]!;
    const newest = recent.at(-1)!;

    if (oldest === 0) return 50;

    const momentum = ((newest - oldest) / oldest) * 100;

    // Also factor in total liquidity
    const totalTvl = pools.reduce((sum, p) => sum + p.tvlUsd, 0);
    const liquidityBoost = totalTvl > 10_000_000 ? 10 : 0;

    // Positive momentum + high liquidity = higher score
    // Range: momentum roughly -50% to +50% -> map to 0-100
    const baseScore = Math.min(100, Math.max(0, 50 + momentum));
    return Math.min(100, baseScore + liquidityBoost);
  }

  // ── Reasoning ─────────────────────────────────────────────

  /**
   * Generate human-readable reasoning for the analysis.
   */
  private generateReasoning(
    symbol: string,
    indicators: TechnicalIndicators,
    defiMetrics: DeFiMetrics,
    dataQuality?: DataQuality,
  ): string {
    const parts: string[] = [];

    // Data quality warning first
    if (dataQuality && dataQuality.confidenceScore < 0.5) {
      parts.push(`WARNING: ${dataQuality.confidenceNote}`);
    }

    // RSI
    if (indicators.rsi > 70) {
      parts.push(`${symbol} RSI at ${indicators.rsi.toFixed(1)} suggests overbought conditions`);
    } else if (indicators.rsi < 30) {
      parts.push(`${symbol} RSI at ${indicators.rsi.toFixed(1)} suggests oversold conditions`);
    } else {
      parts.push(`${symbol} RSI at ${indicators.rsi.toFixed(1)} is neutral`);
    }

    // MACD
    if (indicators.macd.histogram > 0) {
      parts.push("MACD histogram is positive (bullish momentum)");
    } else if (indicators.macd.histogram < 0) {
      parts.push("MACD histogram is negative (bearish momentum)");
    }

    // Momentum
    if (indicators.momentum > 5) {
      parts.push(`momentum is positive at ${indicators.momentum.toFixed(1)}%`);
    } else if (indicators.momentum < -5) {
      parts.push(`momentum is negative at ${indicators.momentum.toFixed(1)}%`);
    }

    // Liquidity
    if (defiMetrics.liquidityDepth >= 75) {
      parts.push("deep liquidity available");
    } else if (defiMetrics.liquidityDepth < 25) {
      parts.push("warning: low liquidity depth");
    }

    // TVL stability
    if (defiMetrics.tvlStability >= 70) {
      parts.push("TVL appears stable");
    } else if (defiMetrics.tvlStability < 30) {
      parts.push("TVL shows high volatility");
    }

    return parts.join("; ") + ".";
  }
}
