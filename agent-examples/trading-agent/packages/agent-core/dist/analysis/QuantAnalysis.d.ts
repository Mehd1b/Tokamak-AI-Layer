import type { Address } from "viem";
import type { PoolData, QuantScore, DataQuality, TradeRequest } from "@tal-trading-agent/shared";
interface TechnicalIndicators {
    rsi: number;
    macd: {
        value: number;
        signal: number;
        histogram: number;
    };
    bollingerBands: {
        upper: number;
        middle: number;
        lower: number;
    };
    vwap: number;
    momentum: number;
    adx: {
        adx: number;
        plusDI: number;
        minusDI: number;
    };
    aroon: {
        up: number;
        down: number;
        oscillator: number;
    };
    stochasticRsi: {
        k: number;
        d: number;
        raw: number;
    };
    williamsR: number;
    roc: number;
    atr: {
        atr: number;
        atrPercent: number;
    };
    historicalVolatility: {
        dailyVol: number;
        annualizedVol: number;
    };
    vwapDeviation: number;
    bollingerPosition: {
        percentB: number;
        bandwidth: number;
    };
    trendStrengthComposite: number;
}
interface DeFiMetrics {
    liquidityDepth: number;
    feeApy: number;
    volumeTrend: number;
    tvlStability: number;
    smartMoneyFlow: number;
}
export declare class QuantAnalysis {
    /**
     * Fetch the current USD price for a token via DeFiLlama.
     */
    getCurrentPrice(tokenAddress: Address): Promise<number>;
    /**
     * Fetch historical price data via DeFiLlama's /chart endpoint (single request).
     * Falls back to per-timestamp sampling if the chart endpoint fails.
     */
    getHistoricalPrices(tokenAddress: Address, horizon?: TradeRequest["horizon"]): Promise<number[]>;
    /**
     * Primary method: fetch price history via DeFiLlama's /chart endpoint.
     * Returns all data points in a single HTTP request.
     */
    private getHistoricalPricesViaChart;
    /**
     * Fallback method: sample individual timestamps via /prices/historical.
     * Slower (N requests) but works for tokens not indexed by the chart endpoint.
     */
    private getHistoricalPricesViaTimestamps;
    /**
     * Compute all technical indicators from price series.
     */
    computeTechnicalIndicators(prices: number[], horizon?: TradeRequest["horizon"]): TechnicalIndicators;
    /**
     * Compute DeFi-specific metrics from pool data.
     */
    computeDeFiMetrics(pools: PoolData[], historicalPrices: number[]): DeFiMetrics;
    /**
     * Compute data confidence score based on available data points vs minimum needed.
     */
    computeDataConfidence(dataPoints: number, horizon: TradeRequest["horizon"]): DataQuality;
    /**
     * Full analysis: fetches prices, computes indicators and DeFi metrics.
     * Returns a complete QuantScore for a single token.
     */
    analyzeToken(tokenAddress: Address, symbol: string, pools: PoolData[], horizon?: TradeRequest["horizon"]): Promise<QuantScore>;
    /**
     * RSI (Relative Strength Index) - 14-period default.
     * Returns value between 0 and 100.
     */
    private computeRSI;
    /**
     * MACD (Moving Average Convergence Divergence).
     * Uses EMA with periods (fast=12, slow=26, signal=9).
     */
    private computeMACD;
    /**
     * Bollinger Bands (20-period, 2 standard deviations).
     */
    private computeBollingerBands;
    /**
     * VWAP approximation. Without real volume data per candle, we use
     * a simple average of prices weighted by position (more recent = higher weight).
     */
    private computeVWAP;
    /**
     * Momentum: rate of change over the available period.
     * Returns percentage change from the oldest to the newest price.
     */
    private computeMomentum;
    /**
     * Compute Exponential Moving Average.
     */
    private computeEMA;
    /**
     * ADX (Average Directional Index) - measures trend strength.
     * Approximates high/low from consecutive price pairs.
     */
    private computeADX;
    /**
     * Aroon indicator - identifies trend changes.
     * Measures periods since highest high and lowest low.
     */
    private computeAroon;
    /**
     * Stochastic RSI - applies stochastic formula to RSI values.
     */
    private computeStochasticRSI;
    /**
     * Williams %R - momentum oscillator, range [-100, 0].
     * Approximates high/low from consecutive price pairs.
     */
    private computeWilliamsR;
    /**
     * ROC (Rate of Change) - percentage change over N periods.
     */
    private computeROC;
    /**
     * ATR (Average True Range) - volatility measure.
     * Approximates true range from consecutive prices.
     */
    private computeATR;
    /**
     * Historical volatility from log returns.
     */
    private computeHistoricalVolatility;
    /**
     * Bollinger Position: %B and bandwidth derived from Bollinger Bands.
     */
    private computeBollingerPosition;
    /**
     * Trend Strength Composite - weighted blend of multiple trend indicators.
     * Each input is normalized to [0, 100] before blending.
     */
    private computeTSC;
    /**
     * Liquidity depth score (0-100) based on pool liquidity.
     */
    private scoreLiquidityDepth;
    /**
     * Average fee APY across pools, normalized 0-100.
     */
    private scoreAvgFeeApy;
    /**
     * Volume trend score. Without live volume data, derive from pool metrics.
     */
    private scoreVolumeTrend;
    /**
     * TVL stability: derived from price volatility (lower volatility = more stable).
     */
    private scoreTvlStability;
    /**
     * Smart money flow heuristic. Uses momentum and liquidity as signals.
     * Positive momentum + high liquidity = likely inflows.
     */
    private scoreSmartMoneyFlow;
    /**
     * Generate human-readable reasoning for the analysis.
     */
    private generateReasoning;
}
export {};
//# sourceMappingURL=QuantAnalysis.d.ts.map