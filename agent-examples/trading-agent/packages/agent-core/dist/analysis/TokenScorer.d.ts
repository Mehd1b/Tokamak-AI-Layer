import type { Address, PublicClient } from "viem";
import type { QuantScore, TradeRequest, DirectionalScore } from "@tal-trading-agent/shared";
export declare class TokenScorer {
    private readonly poolAnalyzer;
    private readonly quantAnalysis;
    constructor(client: PublicClient);
    /**
     * Score and rank a list of candidate tokens against a quote token.
     * Returns QuantScore[] sorted by overallScore descending.
     */
    scoreTokens(candidates: Address[], quoteToken?: Address, horizon?: TradeRequest["horizon"]): Promise<QuantScore[]>;
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
     * When data confidence is low, technical indicators are down-weighted
     * and DeFi metrics (liquidity, TVL) dominate instead of fake-neutral technicals.
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
    /**
     * ADX signal: ADX < 20 = no trend (neutral 50); ADX > 20 with +DI > -DI = bullish (high); opposite = bearish (low).
     */
    private adxToSignal;
    /**
     * Aroon signal: Map oscillator [-100, +100] to [0, 100] linearly.
     */
    private aroonToSignal;
    /**
     * Stochastic RSI signal: K < 20 = oversold (buy = high score); K > 80 = overbought (low score).
     */
    private stochRsiToSignal;
    /**
     * Williams %R signal: Map [-100, 0] to [0, 100].
     * < -80 = oversold (high score), > -20 = overbought (low score).
     */
    private williamsRToSignal;
    /**
     * ROC signal: Clamp [-30, +30] to [0, 100].
     */
    private rocToSignal;
    /**
     * ATR signal: Low ATR% = stable (good score ~70); high ATR% = risky (low score ~15).
     */
    private atrToSignal;
    /**
     * Historical volatility signal: Low annual vol = good (75); extreme vol = bad (10).
     */
    private hvToSignal;
    /**
     * VWAP deviation signal: Above VWAP = bullish; below = bearish.
     */
    private vwapDeviationToSignal;
    /**
     * Bollinger Position signal: %B > 1 = overbought (low); %B < 0 = oversold (high).
     * Low bandwidth = squeeze bonus.
     */
    private bollingerPositionToSignal;
    /**
     * Compute directional score comparing long and short signal strength.
     * longScore uses existing signal methods (bullish = high).
     * shortScore uses inverted signal methods (bearish = high).
     */
    computeDirectionalScore(score: QuantScore): DirectionalScore;
    /**
     * Compute weighted short score — mirrors computeOverallScore but uses
     * inverted (short) signal methods for directional indicators.
     */
    private computeShortScore;
    /**
     * RSI short signal: RSI > 80 = strongly overbought = strong short (90).
     * RSI < 20 = strongly oversold = weak short (10).
     */
    private rsiToShortSignal;
    /**
     * MACD short signal: Negative histogram = bearish = strong short.
     * Inverts the long MACD signal.
     */
    private macdToShortSignal;
    /**
     * Momentum short signal: Negative momentum = strong short.
     * Inverts the long momentum signal.
     */
    private momentumToShortSignal;
    /**
     * ADX short signal: -DI > +DI with strong ADX = strong short.
     * Inverts the long ADX signal.
     */
    private adxToShortSignal;
    /**
     * Aroon short signal: Invert oscillator. Negative oscillator = bearish = strong short.
     */
    private aroonToShortSignal;
    /**
     * Stochastic RSI short signal: K > 80 = overbought = strong short.
     * K < 20 = oversold = weak short.
     */
    private stochRsiToShortSignal;
    /**
     * Williams %R short signal: WR > -20 = overbought = strong short.
     * WR < -80 = oversold = weak short.
     */
    private williamsRToShortSignal;
    /**
     * ROC short signal: Negative ROC = price declining = strong short.
     * Inverts the long ROC signal.
     */
    private rocToShortSignal;
    /**
     * ATR short signal: Same as long — volatility is direction-agnostic.
     */
    private atrToShortSignal;
    /**
     * Historical volatility short signal: Same as long — direction-agnostic.
     */
    private hvToShortSignal;
    /**
     * VWAP deviation short signal: Above VWAP = overbought = strong short.
     * Inverts the long VWAP deviation signal.
     */
    private vwapDeviationToShortSignal;
    /**
     * Bollinger Position short signal: %B > 1 = overbought = strong short (80).
     * %B < 0 = oversold = weak short (20).
     */
    private bollingerPositionToShortSignal;
    /**
     * Trend strength short signal: Strong downtrend (negative composite) = high short score.
     * Inverts the long trend strength signal.
     */
    private trendStrengthToShortSignal;
}
//# sourceMappingURL=TokenScorer.d.ts.map