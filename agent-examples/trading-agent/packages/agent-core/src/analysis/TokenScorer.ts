import type { Address, PublicClient } from "viem";
import pino from "pino";
import { TOKENS, FEE_TIERS } from "@tal-trading-agent/shared";
import type { PoolData, QuantScore } from "@tal-trading-agent/shared";
import { PoolAnalyzer } from "./PoolAnalyzer.js";
import { QuantAnalysis } from "./QuantAnalysis.js";

const logger = pino({ name: "token-scorer" });

// ── Scoring Weights ─────────────────────────────────────────

const WEIGHTS = {
  liquidityDepth: 0.2,
  volumeTrend: 0.15,
  priceMomentum: 0.15,
  rsiSignal: 0.1,
  macdSignal: 0.1,
  tvlStability: 0.1,
  feeEfficiency: 0.1,
  smartMoneyFlow: 0.1,
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
    quoteToken: Address = TOKENS.WETH,
  ): Promise<QuantScore[]> {
    logger.info(
      { candidateCount: candidates.length, quoteToken },
      "Starting token scoring",
    );

    const results: QuantScore[] = [];

    // Process each candidate in parallel
    const promises = candidates.map(async (tokenAddress) => {
      try {
        return await this.scoreToken(tokenAddress, quoteToken);
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
   * Each component is normalized to 0-100, then combined with weights.
   */
  private computeOverallScore(score: QuantScore): number {
    const { indicators, defiMetrics } = score;

    // Normalize technical indicators to 0-100 signals

    // RSI signal: oversold (< 30) is bullish -> high score; overbought (> 70) bearish -> low
    // Neutral zone (30-70) gives moderate scores
    const rsiSignal = this.rsiToSignal(indicators.rsi);

    // MACD signal: positive histogram is bullish
    const macdSignal = this.macdToSignal(indicators.macd);

    // Price momentum: positive is good, cap at reasonable range
    const momentumSignal = this.momentumToSignal(indicators.momentum);

    // Combine with weights
    const overall =
      defiMetrics.liquidityDepth * WEIGHTS.liquidityDepth +
      defiMetrics.volumeTrend * WEIGHTS.volumeTrend +
      momentumSignal * WEIGHTS.priceMomentum +
      rsiSignal * WEIGHTS.rsiSignal +
      macdSignal * WEIGHTS.macdSignal +
      defiMetrics.tvlStability * WEIGHTS.tvlStability +
      defiMetrics.feeApy * WEIGHTS.feeEfficiency +
      defiMetrics.smartMoneyFlow * WEIGHTS.smartMoneyFlow;

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
}
