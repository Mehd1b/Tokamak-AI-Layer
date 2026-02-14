import type { Address, PublicClient } from "viem";
import pino from "pino";
import { WETH_ADDRESS, FEE_TIERS } from "@tal-trading-agent/shared";
import type { PoolData, QuantScore, TradeRequest } from "@tal-trading-agent/shared";
import { PoolAnalyzer } from "./PoolAnalyzer.js";
import { QuantAnalysis } from "./QuantAnalysis.js";

const logger = pino({ name: "token-scorer" });

// ── Scoring Weights ─────────────────────────────────────────

const TECHNICAL_WEIGHTS = {
  priceMomentum: 0.05,
  rsiSignal: 0.04,
  macdSignal: 0.04,
  adxSignal: 0.05,
  aroonSignal: 0.03,
  stochasticRsiSignal: 0.04,
  williamsRSignal: 0.03,
  rocSignal: 0.03,
  atrSignal: 0.03,
  historicalVolSignal: 0.02,
  vwapDeviationSignal: 0.03,
  bollingerPositionSignal: 0.03,
  trendStrengthSignal: 0.05,
} as const;

const DEFI_WEIGHTS = {
  liquidityDepth: 0.17,
  volumeTrend: 0.12,
  tvlStability: 0.10,
  feeEfficiency: 0.07,
  smartMoneyFlow: 0.07,
} as const;

// ── TokenScorer ─────────────────────────────────────────────

export class TokenScorer {
  private readonly poolAnalyzer: PoolAnalyzer;
  private readonly quantAnalysis: QuantAnalysis;

  constructor(client: PublicClient) {
    this.poolAnalyzer = new PoolAnalyzer(client);
    this.quantAnalysis = new QuantAnalysis();
  }

  /**
   * Score and rank a list of candidate tokens against a quote token.
   * Returns QuantScore[] sorted by overallScore descending.
   */
  async scoreTokens(
    candidates: Address[],
    quoteToken: Address = WETH_ADDRESS,
    horizon: TradeRequest["horizon"] = "1w",
  ): Promise<QuantScore[]> {
    logger.info(
      { candidateCount: candidates.length, quoteToken, horizon },
      "Starting token scoring",
    );

    const results: QuantScore[] = [];

    // Process each candidate in parallel
    const promises = candidates.map(async (tokenAddress) => {
      try {
        return await this.scoreToken(tokenAddress, quoteToken, horizon);
      } catch (error) {
        logger.error({ tokenAddress, error }, "Failed to score token");
        return null;
      }
    });

    const settled = await Promise.allSettled(promises);

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value !== null) {
        results.push(result.value);
      }
    }

    // Sort by overall score descending
    results.sort((a, b) => b.overallScore - a.overallScore);

    logger.info(
      {
        scored: results.length,
        top: results[0]
          ? `${results[0].symbol} (${results[0].overallScore.toFixed(1)})`
          : "none",
      },
      "Token scoring complete",
    );

    return results;
  }

  /**
   * Score a single token. Fetches pool data, runs quant analysis,
   * and computes weighted overall score.
   */
  private async scoreToken(
    tokenAddress: Address,
    quoteToken: Address,
    horizon: TradeRequest["horizon"],
  ): Promise<QuantScore> {
    // Fetch pools for this token across all fee tiers
    const pools = await this.fetchPoolsForToken(tokenAddress, quoteToken);

    // Get token info for the symbol
    const tokenInfo = await this.poolAnalyzer.getTokenInfo(tokenAddress);

    // Run full quantitative analysis
    const quantScore = await this.quantAnalysis.analyzeToken(
      tokenAddress,
      tokenInfo.symbol,
      pools,
      horizon,
    );

    // Compute weighted overall score
    quantScore.overallScore = this.computeOverallScore(quantScore);

    return quantScore;
  }

  /**
   * Fetch all pools for a token paired with the quote token across fee tiers.
   */
  private async fetchPoolsForToken(
    tokenAddress: Address,
    quoteToken: Address,
  ): Promise<PoolData[]> {
    const poolPromises = FEE_TIERS.map((fee) =>
      this.poolAnalyzer.getPoolData(tokenAddress, quoteToken, fee),
    );

    const results = await Promise.allSettled(poolPromises);
    const pools: PoolData[] = [];

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        pools.push(result.value);
      }
    }

    return pools;
  }

  /**
   * Compute weighted overall score from indicators and DeFi metrics.
   * When data confidence is low, technical indicators are down-weighted
   * and DeFi metrics (liquidity, TVL) dominate instead of fake-neutral technicals.
   */
  private computeOverallScore(score: QuantScore): number {
    const { indicators, defiMetrics, dataQuality } = score;

    // Determine data confidence weighting factor
    const confidence = dataQuality?.confidenceScore ?? 1;

    // Normalize all 13 technical indicators to 0-100 signals
    const momentumSignal = this.momentumToSignal(indicators.momentum);
    const rsiSignal = this.rsiToSignal(indicators.rsi);
    const macdSignal = this.macdToSignal(indicators.macd);
    const adxSignal = this.adxToSignal(indicators.adx);
    const aroonSignal = this.aroonToSignal(indicators.aroon);
    const stochRsiSignal = this.stochRsiToSignal(indicators.stochasticRsi);
    const wrSignal = this.williamsRToSignal(indicators.williamsR);
    const rocSignal = this.rocToSignal(indicators.roc);
    const atrSignal = this.atrToSignal(indicators.atr);
    const hvSignal = this.hvToSignal(indicators.historicalVolatility);
    const vwapDevSignal = this.vwapDeviationToSignal(indicators.vwapDeviation);
    const bbPosSignal = this.bollingerPositionToSignal(indicators.bollingerPosition);
    const trendSignal = Math.min(100, Math.max(0, indicators.trendStrengthComposite));

    // Total technical weight and DeFi weight
    const techWeightValues = Object.values(TECHNICAL_WEIGHTS);
    const rawTechWeight = techWeightValues.reduce((s, w) => s + w, 0);
    const defiWeightValues = Object.values(DEFI_WEIGHTS);
    const rawDefiWeight = defiWeightValues.reduce((s, w) => s + w, 0);

    // Scale technical weight by data confidence; redistribute remainder to DeFi
    const effectiveTechWeight = rawTechWeight * confidence;
    const redistributed = rawTechWeight - effectiveTechWeight;
    const defiBoost = rawDefiWeight > 0 ? 1 + redistributed / rawDefiWeight : 1;

    // Technical component (scaled by confidence)
    const techScore =
      momentumSignal * TECHNICAL_WEIGHTS.priceMomentum * confidence +
      rsiSignal * TECHNICAL_WEIGHTS.rsiSignal * confidence +
      macdSignal * TECHNICAL_WEIGHTS.macdSignal * confidence +
      adxSignal * TECHNICAL_WEIGHTS.adxSignal * confidence +
      aroonSignal * TECHNICAL_WEIGHTS.aroonSignal * confidence +
      stochRsiSignal * TECHNICAL_WEIGHTS.stochasticRsiSignal * confidence +
      wrSignal * TECHNICAL_WEIGHTS.williamsRSignal * confidence +
      rocSignal * TECHNICAL_WEIGHTS.rocSignal * confidence +
      atrSignal * TECHNICAL_WEIGHTS.atrSignal * confidence +
      hvSignal * TECHNICAL_WEIGHTS.historicalVolSignal * confidence +
      vwapDevSignal * TECHNICAL_WEIGHTS.vwapDeviationSignal * confidence +
      bbPosSignal * TECHNICAL_WEIGHTS.bollingerPositionSignal * confidence +
      trendSignal * TECHNICAL_WEIGHTS.trendStrengthSignal * confidence;

    // DeFi component (boosted when technicals are unreliable)
    const defiScore =
      defiMetrics.liquidityDepth * DEFI_WEIGHTS.liquidityDepth * defiBoost +
      defiMetrics.volumeTrend * DEFI_WEIGHTS.volumeTrend * defiBoost +
      defiMetrics.tvlStability * DEFI_WEIGHTS.tvlStability * defiBoost +
      defiMetrics.feeApy * DEFI_WEIGHTS.feeEfficiency * defiBoost +
      defiMetrics.smartMoneyFlow * DEFI_WEIGHTS.smartMoneyFlow * defiBoost;

    const overall = techScore + defiScore;

    return Math.round(overall * 10) / 10;
  }

  /**
   * Convert RSI to a directional signal (0-100).
   * Oversold (RSI < 30) = buy signal = high score.
   * Overbought (RSI > 70) = sell signal = low score.
   * Neutral zone mapped linearly.
   */
  private rsiToSignal(rsi: number): number {
    if (rsi <= 20) return 90; // Strongly oversold - strong buy signal
    if (rsi <= 30) return 75; // Oversold - buy signal
    if (rsi <= 45) return 60; // Slightly below neutral
    if (rsi <= 55) return 50; // Neutral
    if (rsi <= 70) return 40; // Slightly above neutral
    if (rsi <= 80) return 25; // Overbought - sell signal
    return 10; // Strongly overbought
  }

  /**
   * Convert MACD histogram to a signal (0-100).
   * Positive and increasing = bullish (high score).
   */
  private macdToSignal(macd: {
    value: number;
    signal: number;
    histogram: number;
  }): number {
    const hist = macd.histogram;
    // Normalize: histogram can vary widely, so we use a sigmoid-like mapping
    // hist > 0 is bullish, hist < 0 is bearish
    const normalized = Math.tanh(hist * 10) * 50 + 50;
    return Math.min(100, Math.max(0, normalized));
  }

  /**
   * Convert momentum percentage to a signal (0-100).
   * Positive momentum = higher score, capped at reasonable bounds.
   */
  private momentumToSignal(momentum: number): number {
    // Map -20% to +20% range to 0-100
    const clamped = Math.min(20, Math.max(-20, momentum));
    return ((clamped + 20) / 40) * 100;
  }

  /**
   * ADX signal: ADX < 20 = no trend (neutral 50); ADX > 20 with +DI > -DI = bullish (high); opposite = bearish (low).
   */
  private adxToSignal(adx: { adx: number; plusDI: number; minusDI: number }): number {
    if (adx.adx < 20) return 50;
    // Strong trend detected - direction matters
    const trendStrength = Math.min(1, (adx.adx - 20) / 30); // 0 at ADX=20, 1 at ADX=50
    if (adx.plusDI > adx.minusDI) {
      // Bullish trend
      return 50 + trendStrength * 40; // 50-90
    }
    // Bearish trend
    return 50 - trendStrength * 40; // 10-50
  }

  /**
   * Aroon signal: Map oscillator [-100, +100] to [0, 100] linearly.
   */
  private aroonToSignal(aroon: { up: number; down: number; oscillator: number }): number {
    return (aroon.oscillator + 100) / 2;
  }

  /**
   * Stochastic RSI signal: K < 20 = oversold (buy = high score); K > 80 = overbought (low score).
   */
  private stochRsiToSignal(stochRsi: { k: number; d: number; raw: number }): number {
    if (stochRsi.k <= 20) return 85; // Oversold - strong buy
    if (stochRsi.k <= 30) return 70; // Mildly oversold
    if (stochRsi.k <= 70) return 50; // Neutral
    if (stochRsi.k <= 80) return 30; // Mildly overbought
    return 15; // Overbought - strong sell
  }

  /**
   * Williams %R signal: Map [-100, 0] to [0, 100].
   * < -80 = oversold (high score), > -20 = overbought (low score).
   */
  private williamsRToSignal(wr: number): number {
    if (wr <= -80) return 85; // Oversold - buy signal
    if (wr >= -20) return 15; // Overbought - sell signal
    // Linear map [-80, -20] -> [85, 15]
    return 85 - ((wr + 80) / 60) * 70;
  }

  /**
   * ROC signal: Clamp [-30, +30] to [0, 100].
   */
  private rocToSignal(roc: number): number {
    const clamped = Math.min(30, Math.max(-30, roc));
    return ((clamped + 30) / 60) * 100;
  }

  /**
   * ATR signal: Low ATR% = stable (good score ~70); high ATR% = risky (low score ~15).
   */
  private atrToSignal(atr: { atr: number; atrPercent: number }): number {
    const pct = atr.atrPercent;
    if (pct <= 1) return 70;   // Low volatility - stable
    if (pct <= 3) return 55;   // Moderate volatility
    if (pct <= 5) return 40;   // Elevated volatility
    if (pct <= 10) return 25;  // High volatility
    return 15;                  // Extreme volatility
  }

  /**
   * Historical volatility signal: Low annual vol = good (75); extreme vol = bad (10).
   */
  private hvToSignal(hv: { dailyVol: number; annualizedVol: number }): number {
    const annual = hv.annualizedVol;
    if (annual <= 0.3) return 75;   // < 30% annual vol
    if (annual <= 0.6) return 60;   // 30-60%
    if (annual <= 1.0) return 40;   // 60-100%
    if (annual <= 1.5) return 25;   // 100-150%
    return 10;                       // > 150% extreme vol
  }

  /**
   * VWAP deviation signal: Above VWAP = bullish; below = bearish.
   */
  private vwapDeviationToSignal(dev: number): number {
    // Clamp [-10, +10] to [0, 100]
    const clamped = Math.min(10, Math.max(-10, dev));
    return ((clamped + 10) / 20) * 100;
  }

  /**
   * Bollinger Position signal: %B > 1 = overbought (low); %B < 0 = oversold (high).
   * Low bandwidth = squeeze bonus.
   */
  private bollingerPositionToSignal(bp: { percentB: number; bandwidth: number }): number {
    let score: number;

    if (bp.percentB > 1) {
      score = 20; // Overbought
    } else if (bp.percentB < 0) {
      score = 80; // Oversold
    } else {
      // Map [0, 1] -> [70, 30] (lower %B = more bullish for mean-reversion)
      score = 70 - bp.percentB * 40;
    }

    // Squeeze bonus: low bandwidth suggests potential breakout
    if (bp.bandwidth > 0 && bp.bandwidth < 5) {
      score = Math.min(100, score + 10);
    }

    return score;
  }
}
