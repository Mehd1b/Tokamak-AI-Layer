import type { PoolData, APYTimeseries } from "../types.js";
import type { APYPrediction, APYRange, APYFactor } from "./types.js";

/**
 * Deterministic APY predictor.
 *
 * Given a pool's current state and historical APY data, predicts future APY
 * using exponential moving averages and adjustment factors.
 *
 * CRITICAL: All computations are deterministic given the same inputs.
 * No randomness. This is required for StakeSecured validation.
 */
export class APYPredictor {
  /**
   * Predict future APY for a pool given its current data and history.
   */
  predict(pool: PoolData, history: APYTimeseries): APYPrediction {
    const factors: APYFactor[] = [];

    // 1. Base rate: EMA of historical APY
    const ema30 = this.exponentialMovingAverage(history.dataPoints.map((d) => d.apy), 0.1);
    const ema90 = this.exponentialMovingAverage(history.dataPoints.map((d) => d.apy), 0.05);

    factors.push({
      name: "base_rate_ema",
      impact: ema30,
      description: `30-day EMA: ${ema30.toFixed(2)}%, 90-day EMA: ${ema90.toFixed(2)}%`,
    });

    // 2. TVL adjustment: APY compression as TVL grows
    const tvlFactor = this.tvlAdjustment(pool.tvl);
    factors.push({
      name: "tvl_adjustment",
      impact: tvlFactor,
      description: `TVL $${(pool.tvl / 1e9).toFixed(2)}B → compression factor ${tvlFactor.toFixed(3)}`,
    });

    // 3. Incentive decay: high reward APY tends to decrease over time
    const rewardDecay = this.incentiveDecay(pool.currentAPY, ema30);
    factors.push({
      name: "incentive_decay",
      impact: rewardDecay,
      description: `Reward sustainability factor: ${rewardDecay.toFixed(3)}`,
    });

    // 4. Market regime: bull/bear classification
    const regime = this.marketRegime(history);
    factors.push({
      name: "market_regime",
      impact: regime.factor,
      description: `Market regime: ${regime.label} (factor: ${regime.factor.toFixed(3)})`,
    });

    // Compute predictions for each horizon
    const baseAPY = ema30 > 0 ? ema30 : pool.currentAPY;

    const predicted7d = this.predictHorizon(baseAPY, tvlFactor, rewardDecay, regime.factor, 7);
    const predicted30d = this.predictHorizon(baseAPY, tvlFactor, rewardDecay, regime.factor, 30);
    const predicted90d = this.predictHorizon(baseAPY, tvlFactor, rewardDecay, regime.factor, 90);

    // Confidence based on data availability
    const confidence = this.computeConfidence(history, pool);

    return {
      pool: pool.poolId,
      currentAPY: pool.currentAPY,
      predicted7d,
      predicted30d,
      predicted90d,
      confidence,
      methodology: "ema_tvl_adjusted_with_incentive_decay",
      factors,
    };
  }

  /**
   * Predict APY for a specific pool without historical data.
   * Uses only current state with wider confidence intervals.
   */
  predictFromCurrent(pool: PoolData): APYPrediction {
    const emptyHistory: APYTimeseries = {
      poolId: pool.poolId,
      protocol: pool.protocol,
      chain: pool.chain,
      dataPoints: [{ timestamp: Date.now(), apy: pool.currentAPY }],
      periodDays: 1,
    };
    return this.predict(pool, emptyHistory);
  }

  /**
   * Exponential moving average. Alpha controls smoothing (lower = smoother).
   */
  private exponentialMovingAverage(values: number[], alpha: number): number {
    if (values.length === 0) return 0;

    let ema = values[0]!;
    for (let i = 1; i < values.length; i++) {
      ema = alpha * values[i]! + (1 - alpha) * ema;
    }
    return ema;
  }

  /**
   * TVL adjustment: larger pools have more compressed yields.
   * Returns a multiplier (0.7-1.0).
   */
  private tvlAdjustment(tvl: number): number {
    if (tvl >= 10_000_000_000) return 0.7;   // $10B+ → heavy compression
    if (tvl >= 5_000_000_000) return 0.8;
    if (tvl >= 1_000_000_000) return 0.85;
    if (tvl >= 500_000_000) return 0.9;
    if (tvl >= 100_000_000) return 0.95;
    return 1.0;
  }

  /**
   * Incentive decay: if current APY >> historical EMA, rewards are unsustainable.
   * Returns a decay multiplier (0.5-1.0).
   */
  private incentiveDecay(currentAPY: number, historicalEMA: number): number {
    if (historicalEMA <= 0) return 0.8; // Unknown history, assume some decay
    const ratio = currentAPY / historicalEMA;
    if (ratio > 3) return 0.5;   // 3x above historical = likely unsustainable
    if (ratio > 2) return 0.65;
    if (ratio > 1.5) return 0.8;
    if (ratio > 1.2) return 0.9;
    return 1.0;
  }

  /**
   * Market regime: classify as bull/bear/neutral based on APY trend.
   */
  private marketRegime(history: APYTimeseries): { label: string; factor: number } {
    const points = history.dataPoints;
    if (points.length < 2) {
      return { label: "neutral", factor: 1.0 };
    }

    // Compare first half average to second half average
    const mid = Math.floor(points.length / 2);
    const firstHalf = points.slice(0, mid);
    const secondHalf = points.slice(mid);

    const avgFirst = firstHalf.reduce((s, p) => s + p.apy, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, p) => s + p.apy, 0) / secondHalf.length;

    const change = (avgSecond - avgFirst) / Math.max(avgFirst, 0.01);

    if (change > 0.15) return { label: "bull", factor: 1.1 };
    if (change < -0.15) return { label: "bear", factor: 0.85 };
    return { label: "neutral", factor: 1.0 };
  }

  /**
   * Predict APY range for a given horizon in days.
   */
  private predictHorizon(
    baseAPY: number,
    tvlFactor: number,
    rewardDecay: number,
    regimeFactor: number,
    days: number,
  ): APYRange {
    // Longer horizons have more uncertainty → stronger decay
    const horizonDecay = Math.pow(rewardDecay, days / 30);

    const mean = baseAPY * tvlFactor * horizonDecay * regimeFactor;

    // Wider confidence intervals for longer horizons
    const spread = 0.1 + (days / 365) * 0.3; // 10% to 40% spread
    const low = mean * (1 - spread);
    const high = mean * (1 + spread);

    return {
      mean: Math.max(0, Number(mean.toFixed(4))),
      low: Math.max(0, Number(low.toFixed(4))),
      high: Math.max(0, Number(high.toFixed(4))),
    };
  }

  /**
   * Confidence score for the prediction (0-1).
   */
  private computeConfidence(history: APYTimeseries, pool: PoolData): number {
    let confidence = 0.3;

    // More historical data = higher confidence
    if (history.dataPoints.length >= 30) confidence += 0.3;
    else if (history.dataPoints.length >= 7) confidence += 0.15;

    // Higher TVL = more stable data
    if (pool.tvl >= 1_000_000_000) confidence += 0.2;
    else if (pool.tvl >= 100_000_000) confidence += 0.1;

    // Audited = more reliable protocol data
    if (pool.auditStatus.audited) confidence += 0.1;

    return Math.min(1, Number(confidence.toFixed(2)));
  }
}
