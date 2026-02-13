import type { Address, PublicClient } from "viem";
import type { QuantScore } from "@tal-trading-agent/shared";
export declare class TokenScorer {
    private readonly poolAnalyzer;
    private readonly quantAnalysis;
    constructor(client: PublicClient);
    /**
     * Score and rank a list of candidate tokens against a quote token.
     * Returns QuantScore[] sorted by overallScore descending.
     */
    scoreTokens(candidates: Address[], quoteToken?: Address): Promise<QuantScore[]>;
    /**
     * Score a single token. Fetches pool data, runs quant analysis,
     * and computes weighted overall score.
     */
    private scoreToken;
    /**
     * Fetch all pools for a token paired with the quote token across fee tiers.
     */
    private fetchPoolsForToken;
    /**
     * Compute weighted overall score from indicators and DeFi metrics.
     * Each component is normalized to 0-100, then combined with weights.
     */
    private computeOverallScore;
    /**
     * Convert RSI to a directional signal (0-100).
     * Oversold (RSI < 30) = buy signal = high score.
     * Overbought (RSI > 70) = sell signal = low score.
     * Neutral zone mapped linearly.
     */
    private rsiToSignal;
    /**
     * Convert MACD histogram to a signal (0-100).
     * Positive and increasing = bullish (high score).
     */
    private macdToSignal;
    /**
     * Convert momentum percentage to a signal (0-100).
     * Positive momentum = higher score, capped at reasonable bounds.
     */
    private momentumToSignal;
}
//# sourceMappingURL=TokenScorer.d.ts.map