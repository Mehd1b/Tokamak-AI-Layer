import pino from "pino";
import { TOKENS, FEE_TIERS } from "@tal-trading-agent/shared";
import { PoolAnalyzer } from "./PoolAnalyzer.js";
import { QuantAnalysis } from "./QuantAnalysis.js";
const logger = pino({ name: "token-scorer" });
// ── Scoring Weights ─────────────────────────────────────────
const TECHNICAL_WEIGHTS = {
    priceMomentum: 0.15,
    rsiSignal: 0.1,
    macdSignal: 0.1,
};
const DEFI_WEIGHTS = {
    liquidityDepth: 0.2,
    volumeTrend: 0.15,
    tvlStability: 0.1,
    feeEfficiency: 0.1,
    smartMoneyFlow: 0.1,
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
    async scoreTokens(candidates, quoteToken = TOKENS.WETH, horizon = "1w") {
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
        // Normalize technical indicators to 0-100 signals
        const rsiSignal = this.rsiToSignal(indicators.rsi);
        const macdSignal = this.macdToSignal(indicators.macd);
        const momentumSignal = this.momentumToSignal(indicators.momentum);
        // Total technical weight and DeFi weight
        const rawTechWeight = TECHNICAL_WEIGHTS.priceMomentum + TECHNICAL_WEIGHTS.rsiSignal + TECHNICAL_WEIGHTS.macdSignal;
        const rawDefiWeight = DEFI_WEIGHTS.liquidityDepth + DEFI_WEIGHTS.volumeTrend + DEFI_WEIGHTS.tvlStability + DEFI_WEIGHTS.feeEfficiency + DEFI_WEIGHTS.smartMoneyFlow;
        // Scale technical weight by data confidence; redistribute remainder to DeFi
        const effectiveTechWeight = rawTechWeight * confidence;
        const redistributed = rawTechWeight - effectiveTechWeight;
        const defiBoost = rawDefiWeight > 0 ? 1 + redistributed / rawDefiWeight : 1;
        // Technical component (scaled by confidence)
        const techScore = momentumSignal * TECHNICAL_WEIGHTS.priceMomentum * confidence +
            rsiSignal * TECHNICAL_WEIGHTS.rsiSignal * confidence +
            macdSignal * TECHNICAL_WEIGHTS.macdSignal * confidence;
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
}
//# sourceMappingURL=TokenScorer.js.map