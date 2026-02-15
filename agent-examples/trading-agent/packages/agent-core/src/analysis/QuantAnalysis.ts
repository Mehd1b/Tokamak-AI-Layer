import type { Address } from "viem";
import pino from "pino";
import { DEFILLAMA, HORIZON_MS, HORIZON_TO_LLAMA_CHART, MIN_DATA_POINTS } from "@tal-trading-agent/shared";
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
  // Existing
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  vwap: number;
  momentum: number;

  // New — Trend
  adx: { adx: number; plusDI: number; minusDI: number };
  aroon: { up: number; down: number; oscillator: number };

  // New — Oscillators
  stochasticRsi: { k: number; d: number; raw: number };
  williamsR: number;
  roc: number;

  // New — Volatility
  atr: { atr: number; atrPercent: number };
  historicalVolatility: { dailyVol: number; annualizedVol: number };

  // New — Derived
  vwapDeviation: number;
  bollingerPosition: { percentB: number; bandwidth: number };

  // New — Composite
  trendStrengthComposite: number;
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
   * Fetch historical price data via DeFiLlama's /chart endpoint (single request).
   * Falls back to per-timestamp sampling if the chart endpoint fails.
   */
  async getHistoricalPrices(
    tokenAddress: Address,
    horizon: TradeRequest["horizon"] = "1w",
  ): Promise<number[]> {
    // Primary: chart endpoint (1 request for all data points)
    const chartPrices = await this.getHistoricalPricesViaChart(tokenAddress, horizon);
    if (chartPrices.length > 0) return chartPrices;

    // Fallback: per-timestamp sampling
    logger.info({ tokenAddress, horizon }, "Chart endpoint failed, falling back to per-timestamp fetch");
    return this.getHistoricalPricesViaTimestamps(tokenAddress, horizon);
  }

  /**
   * Primary method: fetch price history via DeFiLlama's /chart endpoint.
   * Returns all data points in a single HTTP request.
   */
  private async getHistoricalPricesViaChart(
    tokenAddress: Address,
    horizon: TradeRequest["horizon"],
  ): Promise<number[]> {
    const coinId = `ethereum:${tokenAddress}`;
    const chartParams = HORIZON_TO_LLAMA_CHART[horizon];
    const url = `${DEFILLAMA.chartUrl}/${encodeURIComponent(coinId)}?period=${chartParams.period}&span=${chartParams.span}&searchWidth=600`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
          logger.warn({ tokenAddress, status: response.status, attempt }, "DeFiLlama chart request failed");
          continue;
        }

        const data = (await response.json()) as LlamaChartResponse;
        const points = data.coins?.[coinId]?.prices;
        if (!points || points.length === 0) {
          logger.warn({ tokenAddress, horizon }, "Chart response empty");
          continue;
        }

        // Sort by timestamp ascending and extract prices
        const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
        const prices = sorted.map((p) => p.price).filter((p) => p > 0);

        if (prices.length > 0) {
          logger.info({ tokenAddress, horizon, dataPoints: prices.length }, "Historical prices fetched via chart");
          return prices;
        }
      } catch (error) {
        logger.warn({ tokenAddress, attempt, error: error instanceof Error ? error.message : error }, "Chart fetch attempt failed");
      }
    }

    return [];
  }

  /**
   * Fallback method: sample individual timestamps via /prices/historical.
   * Slower (N requests) but works for tokens not indexed by the chart endpoint.
   */
  private async getHistoricalPricesViaTimestamps(
    tokenAddress: Address,
    horizon: TradeRequest["horizon"],
  ): Promise<number[]> {
    try {
      const coinId = `ethereum:${tokenAddress}`;
      const periodMs = HORIZON_MS[horizon];
      const targetPoints = MIN_DATA_POINTS[horizon];

      const now = Math.floor(Date.now() / 1000);
      const start = now - Math.floor(periodMs / 1000);
      const step = Math.floor((now - start) / targetPoints);

      const timestamps: number[] = [];
      for (let t = start; t <= now; t += step) {
        timestamps.push(t);
      }

      const BATCH_SIZE = 5;
      const prices: Array<{ ts: number; price: number }> = [];

      for (let i = 0; i < timestamps.length; i += BATCH_SIZE) {
        const batch = timestamps.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (ts) => {
            try {
              const url = `${DEFILLAMA.pricesUrl.replace("/current", `/historical/${ts}`)}/${encodeURIComponent(coinId)}?searchWidth=4h`;
              const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
              if (!response.ok) return null;
              const data = (await response.json()) as LlamaPriceResponse;
              const price = data.coins[coinId]?.price;
              return price && price > 0 ? { ts, price } : null;
            } catch {
              return null;
            }
          }),
        );
        for (const r of results) {
          if (r) prices.push(r);
        }
      }

      if (prices.length === 0) {
        logger.warn({ tokenAddress, horizon }, "No historical prices from timestamp fallback");
        return [];
      }

      prices.sort((a, b) => a.ts - b.ts);
      logger.info({ tokenAddress, horizon, dataPoints: prices.length }, "Historical prices fetched via timestamps");
      return prices.map((p) => p.price);
    } catch (error) {
      logger.error({ tokenAddress, error }, "Failed to fetch historical prices via timestamps");
      return [];
    }
  }

  /**
   * Compute all technical indicators from price series.
   */
  computeTechnicalIndicators(
    prices: number[],
    horizon: TradeRequest["horizon"] = "1w",
  ): TechnicalIndicators {
    const currentPrice = prices.at(-1) ?? 0;

    const rsi = this.computeRSI(prices, 14);
    const macd = this.computeMACD(prices, 12, 26, 9);
    const bollingerBands = this.computeBollingerBands(prices, 20, 2);
    const vwap = this.computeVWAP(prices);
    const momentum = this.computeMomentum(prices, currentPrice);
    const aroon = this.computeAroon(prices, 25);

    const vwapDeviation = vwap !== 0
      ? (currentPrice - vwap) / vwap * 100
      : 0;
    const bollingerPosition = this.computeBollingerPosition(currentPrice, bollingerBands);
    const rocVal = this.computeROC(prices, 10);
    const trendStrengthComposite = this.computeTSC(
      momentum,
      macd.histogram,
      aroon.oscillator,
      rocVal,
    );

    return {
      rsi,
      macd,
      bollingerBands,
      vwap,
      momentum,
      adx: this.computeADX(prices, 14),
      aroon,
      stochasticRsi: this.computeStochasticRSI(prices, 14, 14, 3, 3),
      williamsR: this.computeWilliamsR(prices, 14),
      roc: rocVal,
      atr: this.computeATR(prices, 14),
      historicalVolatility: this.computeHistoricalVolatility(prices, horizon),
      vwapDeviation,
      bollingerPosition,
      trendStrengthComposite,
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

    const indicators = this.computeTechnicalIndicators(prices, horizon);
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

  // ── New Technical Indicators ─────────────────────────────

  /**
   * ADX (Average Directional Index) - measures trend strength.
   * Approximates high/low from consecutive price pairs.
   */
  private computeADX(
    prices: number[],
    period: number = 14,
  ): { adx: number; plusDI: number; minusDI: number } {
    if (prices.length < 2 * period) return { adx: 0, plusDI: 0, minusDI: 0 };

    // Approximate high/low from consecutive pairs
    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      highs.push(Math.max(prices[i - 1]!, prices[i]!));
      lows.push(Math.min(prices[i - 1]!, prices[i]!));
      closes.push(prices[i]!);
    }

    // Compute +DM, -DM, TR
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const trueRange: number[] = [];

    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i]! - highs[i - 1]!;
      const downMove = lows[i - 1]! - lows[i]!;
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

      const tr = Math.max(
        highs[i]! - lows[i]!,
        Math.abs(highs[i]! - closes[i - 1]!),
        Math.abs(lows[i]! - closes[i - 1]!),
      );
      trueRange.push(tr);
    }

    if (trueRange.length < period) return { adx: 0, plusDI: 0, minusDI: 0 };

    // Smooth with Wilder's method (initial SMA then running sum)
    const smooth = (arr: number[]): number[] => {
      let sum = 0;
      for (let i = 0; i < period; i++) sum += arr[i]!;
      const result = [sum];
      for (let i = period; i < arr.length; i++) {
        sum = sum - sum / period + arr[i]!;
        result.push(sum);
      }
      return result;
    };

    const smoothedPlusDM = smooth(plusDM);
    const smoothedMinusDM = smooth(minusDM);
    const smoothedTR = smooth(trueRange);

    // Compute +DI, -DI, DX
    const dxValues: number[] = [];
    let lastPlusDI = 0;
    let lastMinusDI = 0;

    for (let i = 0; i < smoothedTR.length; i++) {
      const atr = smoothedTR[i]!;
      if (atr === 0) {
        dxValues.push(0);
        continue;
      }
      const pdi = (smoothedPlusDM[i]! / atr) * 100;
      const mdi = (smoothedMinusDM[i]! / atr) * 100;
      lastPlusDI = pdi;
      lastMinusDI = mdi;
      const diSum = pdi + mdi;
      dxValues.push(diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100);
    }

    if (dxValues.length < period) return { adx: 0, plusDI: 0, minusDI: 0 };

    // ADX = Wilder's smoothing of DX
    let adxSum = 0;
    for (let i = 0; i < period; i++) adxSum += dxValues[i]!;
    let adx = adxSum / period;
    for (let i = period; i < dxValues.length; i++) {
      adx = (adx * (period - 1) + dxValues[i]!) / period;
    }

    return { adx, plusDI: lastPlusDI, minusDI: lastMinusDI };
  }

  /**
   * Aroon indicator - identifies trend changes.
   * Measures periods since highest high and lowest low.
   */
  private computeAroon(
    prices: number[],
    period: number = 25,
  ): { up: number; down: number; oscillator: number } {
    if (prices.length < period + 1) return { up: 50, down: 50, oscillator: 0 };

    const slice = prices.slice(-(period + 1));
    let highIdx = 0;
    let lowIdx = 0;

    for (let i = 1; i < slice.length; i++) {
      if (slice[i]! >= slice[highIdx]!) highIdx = i;
      if (slice[i]! <= slice[lowIdx]!) lowIdx = i;
    }

    const periodsSinceHigh = period - highIdx;
    const periodsSinceLow = period - lowIdx;

    const up = ((period - periodsSinceHigh) / period) * 100;
    const down = ((period - periodsSinceLow) / period) * 100;

    return { up, down, oscillator: up - down };
  }

  /**
   * Stochastic RSI - applies stochastic formula to RSI values.
   */
  private computeStochasticRSI(
    prices: number[],
    rsiPeriod: number = 14,
    stochPeriod: number = 14,
    kSmooth: number = 3,
    dSmooth: number = 3,
  ): { k: number; d: number; raw: number } {
    const neededPoints = rsiPeriod + stochPeriod + kSmooth + dSmooth - 2;
    if (prices.length < neededPoints) return { k: 50, d: 50, raw: 50 };

    // Compute RSI series
    const rsiSeries: number[] = [];
    for (let i = rsiPeriod + 1; i <= prices.length; i++) {
      const slice = prices.slice(0, i);
      rsiSeries.push(this.computeRSI(slice, rsiPeriod));
    }

    if (rsiSeries.length < stochPeriod) return { k: 50, d: 50, raw: 50 };

    // Apply stochastic formula to RSI
    const rawSeries: number[] = [];
    for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
      const window = rsiSeries.slice(i - stochPeriod + 1, i + 1);
      const minRSI = Math.min(...window);
      const maxRSI = Math.max(...window);
      const range = maxRSI - minRSI;
      rawSeries.push(range === 0 ? 50 : ((rsiSeries[i]! - minRSI) / range) * 100);
    }

    if (rawSeries.length < kSmooth) return { k: 50, d: 50, raw: rawSeries.at(-1) ?? 50 };

    // K = SMA of raw
    const kSeries: number[] = [];
    for (let i = kSmooth - 1; i < rawSeries.length; i++) {
      const window = rawSeries.slice(i - kSmooth + 1, i + 1);
      kSeries.push(window.reduce((s, v) => s + v, 0) / kSmooth);
    }

    if (kSeries.length < dSmooth) return { k: kSeries.at(-1) ?? 50, d: 50, raw: rawSeries.at(-1) ?? 50 };

    // D = SMA of K
    const dWindow = kSeries.slice(-dSmooth);
    const d = dWindow.reduce((s, v) => s + v, 0) / dSmooth;

    return { k: kSeries.at(-1)!, d, raw: rawSeries.at(-1)! };
  }

  /**
   * Williams %R - momentum oscillator, range [-100, 0].
   * Approximates high/low from consecutive price pairs.
   */
  private computeWilliamsR(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return -50;

    const slice = prices.slice(-(period + 1));
    // Approximate highs and lows
    const highs: number[] = [];
    const lows: number[] = [];
    for (let i = 1; i < slice.length; i++) {
      highs.push(Math.max(slice[i - 1]!, slice[i]!));
      lows.push(Math.min(slice[i - 1]!, slice[i]!));
    }

    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);
    const close = prices.at(-1)!;
    const range = highestHigh - lowestLow;

    if (range === 0) return -50;
    return ((highestHigh - close) / range) * -100;
  }

  /**
   * ROC (Rate of Change) - percentage change over N periods.
   */
  private computeROC(prices: number[], period: number = 10): number {
    if (prices.length < period + 1) return 0;

    const current = prices.at(-1)!;
    const past = prices[prices.length - 1 - period]!;
    if (past === 0) return 0;
    return ((current - past) / past) * 100;
  }

  /**
   * ATR (Average True Range) - volatility measure.
   * Approximates true range from consecutive prices.
   */
  private computeATR(
    prices: number[],
    period: number = 14,
  ): { atr: number; atrPercent: number } {
    if (prices.length < period + 1) return { atr: 0, atrPercent: 0 };

    // Compute true range series from consecutive prices
    const trSeries: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      trSeries.push(Math.abs(prices[i]! - prices[i - 1]!));
    }

    if (trSeries.length < period) return { atr: 0, atrPercent: 0 };

    // EMA of TR
    const emaResult = this.computeEMA(trSeries, period);
    const atr = emaResult.at(-1) ?? 0;
    const currentPrice = prices.at(-1) ?? 0;
    const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

    return { atr, atrPercent };
  }

  /**
   * Historical volatility from log returns.
   */
  private computeHistoricalVolatility(
    prices: number[],
    _horizon: TradeRequest["horizon"],
  ): { dailyVol: number; annualizedVol: number } {
    if (prices.length < 3) return { dailyVol: 0, annualizedVol: 0 };

    // Compute log returns
    const logReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1]! > 0 && prices[i]! > 0) {
        logReturns.push(Math.log(prices[i]! / prices[i - 1]!));
      }
    }

    if (logReturns.length < 2) return { dailyVol: 0, annualizedVol: 0 };

    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const variance =
      logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(365);

    return { dailyVol, annualizedVol };
  }

  /**
   * Bollinger Position: %B and bandwidth derived from Bollinger Bands.
   */
  private computeBollingerPosition(
    price: number,
    bb: { upper: number; middle: number; lower: number },
  ): { percentB: number; bandwidth: number } {
    const range = bb.upper - bb.lower;
    if (range === 0) return { percentB: 0.5, bandwidth: 0 };

    const percentB = (price - bb.lower) / range;
    const bandwidth = bb.middle > 0 ? (range / bb.middle) * 100 : 0;

    return { percentB, bandwidth };
  }

  /**
   * Trend Strength Composite - weighted blend of multiple trend indicators.
   * Each input is normalized to [0, 100] before blending.
   */
  private computeTSC(
    momentum: number,
    macdHist: number,
    aroonOsc: number,
    roc: number,
  ): number {
    // Normalize momentum: clamp [-50, 50] -> [0, 100]
    const normMomentum = Math.min(100, Math.max(0, (momentum + 50) / 100 * 100));

    // Normalize MACD histogram: use tanh for smooth mapping
    const normMacd = Math.tanh(macdHist * 10) * 50 + 50;

    // Normalize Aroon oscillator: [-100, 100] -> [0, 100]
    const normAroon = (aroonOsc + 100) / 2;

    // Normalize ROC: clamp [-30, 30] -> [0, 100]
    const clampedRoc = Math.min(30, Math.max(-30, roc));
    const normRoc = ((clampedRoc + 30) / 60) * 100;

    // Weighted blend
    return 0.3 * normMomentum + 0.3 * normMacd + 0.2 * normAroon + 0.2 * normRoc;
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

    // ADX trend strength
    if (indicators.adx.adx > 25) {
      const direction = indicators.adx.plusDI > indicators.adx.minusDI ? "bullish" : "bearish";
      parts.push(`ADX at ${indicators.adx.adx.toFixed(1)} indicates a strong ${direction} trend`);
    } else if (indicators.adx.adx < 20) {
      parts.push(`ADX at ${indicators.adx.adx.toFixed(1)} indicates weak/no trend`);
    }

    // Stochastic RSI
    if (indicators.stochasticRsi.k < 20) {
      parts.push(`StochRSI K at ${indicators.stochasticRsi.k.toFixed(1)} suggests oversold conditions`);
    } else if (indicators.stochasticRsi.k > 80) {
      parts.push(`StochRSI K at ${indicators.stochasticRsi.k.toFixed(1)} suggests overbought conditions`);
    }

    // ATR volatility
    if (indicators.atr.atrPercent > 5) {
      parts.push(`ATR% at ${indicators.atr.atrPercent.toFixed(1)}% indicates high volatility`);
    } else if (indicators.atr.atrPercent > 0 && indicators.atr.atrPercent < 1) {
      parts.push(`ATR% at ${indicators.atr.atrPercent.toFixed(2)}% indicates low volatility`);
    }

    // Bollinger %B position
    if (indicators.bollingerPosition.percentB > 1) {
      parts.push("price above upper Bollinger Band (overbought)");
    } else if (indicators.bollingerPosition.percentB < 0) {
      parts.push("price below lower Bollinger Band (oversold)");
    } else if (indicators.bollingerPosition.bandwidth < 5) {
      parts.push("Bollinger Bands squeezing (potential breakout)");
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
