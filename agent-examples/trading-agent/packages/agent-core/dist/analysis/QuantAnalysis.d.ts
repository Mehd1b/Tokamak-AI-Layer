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
     * Fetch historical price data by sampling individual timestamps via
     * DeFiLlama's /prices/historical endpoint.
     *
     * The chart endpoint returns too few data points for reliable indicators,
     * so we build the price series ourselves using evenly spaced timestamps.
     */
    getHistoricalPrices(tokenAddress: Address, horizon?: TradeRequest["horizon"]): Promise<number[]>;
    /**
     * Compute all technical indicators from price series.
     */
    computeTechnicalIndicators(prices: number[]): TechnicalIndicators;
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