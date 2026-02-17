import type { EquityPoint, ClosedTrade, BacktestResult, BacktestConfig, PriceBar } from "./types.js";
/**
 * Computes all performance metrics from equity curve and trade list.
 */
export declare class PerformanceMetrics {
    /**
     * Compute full backtest result from raw data.
     */
    compute(config: BacktestConfig, equityCurve: EquityPoint[], trades: ClosedTrade[], tokenPrices: Map<string, PriceBar[]>): BacktestResult;
    /**
     * CAGR: Compound Annual Growth Rate.
     */
    private computeCAGR;
    /**
     * Max drawdown from equity curve high-water mark.
     * Also computes the longest underwater period and full drawdown curve.
     */
    private computeDrawdown;
    /**
     * Annualized volatility from bar-to-bar equity returns.
     */
    private computeAnnualizedVolatility;
    /**
     * Downside deviation: std dev of negative returns only.
     */
    private computeDownsideDeviation;
    /**
     * Trade statistics: win rate, profit factor, averages, extremes.
     */
    private computeTradeStats;
    /**
     * Buy-and-hold benchmark: equal-weight portfolio of all tokens, held start to end.
     */
    private computeBuyAndHold;
    private computeReturns;
    private barsPerYear;
}
//# sourceMappingURL=PerformanceMetrics.d.ts.map