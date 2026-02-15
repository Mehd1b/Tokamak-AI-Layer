import pino from "pino";
import { WETH_ADDRESS, FEE_TIERS } from "@tal-trading-agent/shared";
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
};
const DEFI_WEIGHTS = {
    liquidityDepth: 0.17,
    volumeTrend: 0.12,
    tvlStability: 0.10,
    feeEfficiency: 0.07,
    smartMoneyFlow: 0.07,
};
// ── TokenScorer ─────────────────────────────────────────────
export class TokenScorer {
    poolAnalyzer;
    quantAnalysis;
    constructor(client) {
        this.poolAnalyzer = new PoolAnalyzer(client);
        this.quantAnalysis = new QuantAnalysis();
    }
    /**
     * Score and rank a list of candidate tokens against a quote token.
     * Returns QuantScore[] sorted by overallScore descending.
     */
    async scoreTokens(candidates, quoteToken = WETH_ADDRESS, horizon = "1w") {
        logger.info({ candidateCount: candidates.length, quoteToken, horizon }, "Starting token scoring");
        const results = [];
        // Process each candidate in parallel
        const promises = candidates.map(async (tokenAddress) => {
            try {
                return await this.scoreToken(tokenAddress, quoteToken, horizon);
            }
            catch (error) {
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
        logger.info({
            scored: results.length,
            top: results[0]
                ? `${results[0].symbol} (${results[0].overallScore.toFixed(1)})`
                : "none",
        }, "Token scoring complete");
        return results;
    }
    /**
     * Score a single token. Fetches pool data, runs quant analysis,
     * and computes weighted overall score.
     */
    async scoreToken(tokenAddress, quoteToken, horizon) {
        // Fetch pools for this token across all fee tiers
        const pools = await this.fetchPoolsForToken(tokenAddress, quoteToken);
        // Get token info for the symbol
        const tokenInfo = await this.poolAnalyzer.getTokenInfo(tokenAddress);
        // Run full quantitative analysis
        const quantScore = await this.quantAnalysis.analyzeToken(tokenAddress, tokenInfo.symbol, pools, horizon);
        // Compute weighted overall score
        quantScore.overallScore = this.computeOverallScore(quantScore);
        // Compute directional score (long vs short)
        quantScore.directionalScore = this.computeDirectionalScore(quantScore);
        return quantScore;
    }
    /**
     * Fetch all pools for a token paired with the quote token across fee tiers.
     */
    async fetchPoolsForToken(tokenAddress, quoteToken) {
        const poolPromises = FEE_TIERS.map((fee) => this.poolAnalyzer.getPoolData(tokenAddress, quoteToken, fee));
        const results = await Promise.allSettled(poolPromises);
        const pools = [];
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
    computeOverallScore(score) {
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
        const techScore = momentumSignal * TECHNICAL_WEIGHTS.priceMomentum * confidence +
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
        const defiScore = defiMetrics.liquidityDepth * DEFI_WEIGHTS.liquidityDepth * defiBoost +
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
    rsiToSignal(rsi) {
        if (rsi <= 20)
            return 90; // Strongly oversold - strong buy signal
        if (rsi <= 30)
            return 75; // Oversold - buy signal
        if (rsi <= 45)
            return 60; // Slightly below neutral
        if (rsi <= 55)
            return 50; // Neutral
        if (rsi <= 70)
            return 40; // Slightly above neutral
        if (rsi <= 80)
            return 25; // Overbought - sell signal
        return 10; // Strongly overbought
    }
    /**
     * Convert MACD histogram to a signal (0-100).
     * Positive and increasing = bullish (high score).
     */
    macdToSignal(macd) {
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
    momentumToSignal(momentum) {
        // Map -20% to +20% range to 0-100
        const clamped = Math.min(20, Math.max(-20, momentum));
        return ((clamped + 20) / 40) * 100;
    }
    /**
     * ADX signal: ADX < 20 = no trend (neutral 50); ADX > 20 with +DI > -DI = bullish (high); opposite = bearish (low).
     */
    adxToSignal(adx) {
        if (adx.adx < 20)
            return 50;
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
    aroonToSignal(aroon) {
        return (aroon.oscillator + 100) / 2;
    }
    /**
     * Stochastic RSI signal: K < 20 = oversold (buy = high score); K > 80 = overbought (low score).
     */
    stochRsiToSignal(stochRsi) {
        if (stochRsi.k <= 20)
            return 85; // Oversold - strong buy
        if (stochRsi.k <= 30)
            return 70; // Mildly oversold
        if (stochRsi.k <= 70)
            return 50; // Neutral
        if (stochRsi.k <= 80)
            return 30; // Mildly overbought
        return 15; // Overbought - strong sell
    }
    /**
     * Williams %R signal: Map [-100, 0] to [0, 100].
     * < -80 = oversold (high score), > -20 = overbought (low score).
     */
    williamsRToSignal(wr) {
        if (wr <= -80)
            return 85; // Oversold - buy signal
        if (wr >= -20)
            return 15; // Overbought - sell signal
        // Linear map [-80, -20] -> [85, 15]
        return 85 - ((wr + 80) / 60) * 70;
    }
    /**
     * ROC signal: Clamp [-30, +30] to [0, 100].
     */
    rocToSignal(roc) {
        const clamped = Math.min(30, Math.max(-30, roc));
        return ((clamped + 30) / 60) * 100;
    }
    /**
     * ATR signal: Low ATR% = stable (good score ~70); high ATR% = risky (low score ~15).
     */
    atrToSignal(atr) {
        const pct = atr.atrPercent;
        if (pct <= 1)
            return 70; // Low volatility - stable
        if (pct <= 3)
            return 55; // Moderate volatility
        if (pct <= 5)
            return 40; // Elevated volatility
        if (pct <= 10)
            return 25; // High volatility
        return 15; // Extreme volatility
    }
    /**
     * Historical volatility signal: Low annual vol = good (75); extreme vol = bad (10).
     */
    hvToSignal(hv) {
        const annual = hv.annualizedVol;
        if (annual <= 0.3)
            return 75; // < 30% annual vol
        if (annual <= 0.6)
            return 60; // 30-60%
        if (annual <= 1.0)
            return 40; // 60-100%
        if (annual <= 1.5)
            return 25; // 100-150%
        return 10; // > 150% extreme vol
    }
    /**
     * VWAP deviation signal: Above VWAP = bullish; below = bearish.
     */
    vwapDeviationToSignal(dev) {
        // Clamp [-10, +10] to [0, 100]
        const clamped = Math.min(10, Math.max(-10, dev));
        return ((clamped + 10) / 20) * 100;
    }
    /**
     * Bollinger Position signal: %B > 1 = overbought (low); %B < 0 = oversold (high).
     * Low bandwidth = squeeze bonus.
     */
    bollingerPositionToSignal(bp) {
        let score;
        if (bp.percentB > 1) {
            score = 20; // Overbought
        }
        else if (bp.percentB < 0) {
            score = 80; // Oversold
        }
        else {
            // Map [0, 1] -> [70, 30] (lower %B = more bullish for mean-reversion)
            score = 70 - bp.percentB * 40;
        }
        // Squeeze bonus: low bandwidth suggests potential breakout
        if (bp.bandwidth > 0 && bp.bandwidth < 5) {
            score = Math.min(100, score + 10);
        }
        return score;
    }
    // ── Directional Score (Long vs Short) ────────────────
    /**
     * Compute directional score comparing long and short signal strength.
     * longScore uses existing signal methods (bullish = high).
     * shortScore uses inverted signal methods (bearish = high).
     */
    computeDirectionalScore(score) {
        const longScore = this.computeOverallScore(score);
        const shortScore = this.computeShortScore(score);
        const preferredDirection = longScore >= shortScore ? "long" : "short";
        const directionConfidence = Math.abs(longScore - shortScore) / 100;
        return {
            longScore: Math.round(longScore * 10) / 10,
            shortScore: Math.round(shortScore * 10) / 10,
            preferredDirection,
            directionConfidence: Math.round(directionConfidence * 1000) / 1000,
        };
    }
    /**
     * Compute weighted short score — mirrors computeOverallScore but uses
     * inverted (short) signal methods for directional indicators.
     */
    computeShortScore(score) {
        const { indicators, defiMetrics, dataQuality } = score;
        const confidence = dataQuality?.confidenceScore ?? 1;
        // Short-signal conversions (bearish = high score)
        const momentumSignal = this.momentumToShortSignal(indicators.momentum);
        const rsiSignal = this.rsiToShortSignal(indicators.rsi);
        const macdSignal = this.macdToShortSignal(indicators.macd);
        const adxSignal = this.adxToShortSignal(indicators.adx);
        const aroonSignal = this.aroonToShortSignal(indicators.aroon);
        const stochRsiSignal = this.stochRsiToShortSignal(indicators.stochasticRsi);
        const wrSignal = this.williamsRToShortSignal(indicators.williamsR);
        const rocSignal = this.rocToShortSignal(indicators.roc);
        const atrSignal = this.atrToShortSignal(indicators.atr);
        const hvSignal = this.hvToShortSignal(indicators.historicalVolatility);
        const vwapDevSignal = this.vwapDeviationToShortSignal(indicators.vwapDeviation);
        const bbPosSignal = this.bollingerPositionToShortSignal(indicators.bollingerPosition);
        const trendSignal = this.trendStrengthToShortSignal(indicators.trendStrengthComposite);
        const techWeightValues = Object.values(TECHNICAL_WEIGHTS);
        const rawTechWeight = techWeightValues.reduce((s, w) => s + w, 0);
        const defiWeightValues = Object.values(DEFI_WEIGHTS);
        const rawDefiWeight = defiWeightValues.reduce((s, w) => s + w, 0);
        const effectiveTechWeight = rawTechWeight * confidence;
        const redistributed = rawTechWeight - effectiveTechWeight;
        const defiBoost = rawDefiWeight > 0 ? 1 + redistributed / rawDefiWeight : 1;
        const techScore = momentumSignal * TECHNICAL_WEIGHTS.priceMomentum * confidence +
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
        // DeFi component is direction-agnostic (same as long)
        const defiScore = defiMetrics.liquidityDepth * DEFI_WEIGHTS.liquidityDepth * defiBoost +
            defiMetrics.volumeTrend * DEFI_WEIGHTS.volumeTrend * defiBoost +
            defiMetrics.tvlStability * DEFI_WEIGHTS.tvlStability * defiBoost +
            defiMetrics.feeApy * DEFI_WEIGHTS.feeEfficiency * defiBoost +
            defiMetrics.smartMoneyFlow * DEFI_WEIGHTS.smartMoneyFlow * defiBoost;
        const overall = techScore + defiScore;
        return Math.round(overall * 10) / 10;
    }
    // ── Short-Signal Conversion Methods ──────────────────
    /**
     * RSI short signal: RSI > 80 = strongly overbought = strong short (90).
     * RSI < 20 = strongly oversold = weak short (10).
     */
    rsiToShortSignal(rsi) {
        if (rsi >= 80)
            return 90; // Strongly overbought - strong short
        if (rsi >= 70)
            return 75; // Overbought - short signal
        if (rsi >= 55)
            return 60; // Slightly above neutral
        if (rsi >= 45)
            return 50; // Neutral
        if (rsi >= 30)
            return 40; // Slightly below neutral
        if (rsi >= 20)
            return 25; // Oversold - weak short
        return 10; // Strongly oversold - very weak short
    }
    /**
     * MACD short signal: Negative histogram = bearish = strong short.
     * Inverts the long MACD signal.
     */
    macdToShortSignal(macd) {
        const hist = macd.histogram;
        // Invert: negative histogram = high short score
        const normalized = Math.tanh(-hist * 10) * 50 + 50;
        return Math.min(100, Math.max(0, normalized));
    }
    /**
     * Momentum short signal: Negative momentum = strong short.
     * Inverts the long momentum signal.
     */
    momentumToShortSignal(momentum) {
        const clamped = Math.min(20, Math.max(-20, momentum));
        // Invert: -20% -> 100 (strong short), +20% -> 0 (weak short)
        return ((-clamped + 20) / 40) * 100;
    }
    /**
     * ADX short signal: -DI > +DI with strong ADX = strong short.
     * Inverts the long ADX signal.
     */
    adxToShortSignal(adx) {
        if (adx.adx < 20)
            return 50; // No trend - neutral
        const trendStrength = Math.min(1, (adx.adx - 20) / 30);
        if (adx.minusDI > adx.plusDI) {
            // Bearish trend - strong short
            return 50 + trendStrength * 40; // 50-90
        }
        // Bullish trend - weak short
        return 50 - trendStrength * 40; // 10-50
    }
    /**
     * Aroon short signal: Invert oscillator. Negative oscillator = bearish = strong short.
     */
    aroonToShortSignal(aroon) {
        // Invert: oscillator -100 -> 100 (strong short), +100 -> 0 (weak short)
        return (-aroon.oscillator + 100) / 2;
    }
    /**
     * Stochastic RSI short signal: K > 80 = overbought = strong short.
     * K < 20 = oversold = weak short.
     */
    stochRsiToShortSignal(stochRsi) {
        if (stochRsi.k >= 80)
            return 85; // Overbought - strong short
        if (stochRsi.k >= 70)
            return 70; // Mildly overbought
        if (stochRsi.k >= 30)
            return 50; // Neutral
        if (stochRsi.k >= 20)
            return 30; // Mildly oversold
        return 15; // Oversold - weak short
    }
    /**
     * Williams %R short signal: WR > -20 = overbought = strong short.
     * WR < -80 = oversold = weak short.
     */
    williamsRToShortSignal(wr) {
        if (wr >= -20)
            return 85; // Overbought - strong short
        if (wr <= -80)
            return 15; // Oversold - weak short
        // Linear map [-80, -20] -> [15, 85]
        return 15 + ((wr + 80) / 60) * 70;
    }
    /**
     * ROC short signal: Negative ROC = price declining = strong short.
     * Inverts the long ROC signal.
     */
    rocToShortSignal(roc) {
        const clamped = Math.min(30, Math.max(-30, roc));
        // Invert: -30 -> 100, +30 -> 0
        return ((-clamped + 30) / 60) * 100;
    }
    /**
     * ATR short signal: Same as long — volatility is direction-agnostic.
     */
    atrToShortSignal(atr) {
        return this.atrToSignal(atr);
    }
    /**
     * Historical volatility short signal: Same as long — direction-agnostic.
     */
    hvToShortSignal(hv) {
        return this.hvToSignal(hv);
    }
    /**
     * VWAP deviation short signal: Above VWAP = overbought = strong short.
     * Inverts the long VWAP deviation signal.
     */
    vwapDeviationToShortSignal(dev) {
        const clamped = Math.min(10, Math.max(-10, dev));
        // Invert: +10 -> 100 (strong short, above VWAP), -10 -> 0 (weak short)
        return ((clamped + 10) / 20) * 100;
    }
    /**
     * Bollinger Position short signal: %B > 1 = overbought = strong short (80).
     * %B < 0 = oversold = weak short (20).
     */
    bollingerPositionToShortSignal(bp) {
        let score;
        if (bp.percentB > 1) {
            score = 80; // Overbought - strong short
        }
        else if (bp.percentB < 0) {
            score = 20; // Oversold - weak short
        }
        else {
            // Map [0, 1] -> [30, 70] (higher %B = more bearish for short)
            score = 30 + bp.percentB * 40;
        }
        // Squeeze bonus: low bandwidth suggests potential breakout
        if (bp.bandwidth > 0 && bp.bandwidth < 5) {
            score = Math.min(100, score + 10);
        }
        return score;
    }
    /**
     * Trend strength short signal: Strong downtrend (negative composite) = high short score.
     * Inverts the long trend strength signal.
     */
    trendStrengthToShortSignal(trendStrength) {
        // Invert: -100 -> 100 (strong downtrend = strong short), +100 -> 0
        const inverted = -trendStrength;
        return Math.min(100, Math.max(0, inverted));
    }
}
//# sourceMappingURL=TokenScorer.js.map