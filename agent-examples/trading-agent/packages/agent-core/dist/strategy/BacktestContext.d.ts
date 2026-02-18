export interface BacktestMetrics {
    totalReturnPct: number;
    annualizedReturnPct: number;
    maxDrawdownPct: number;
    maxDrawdownDurationBars: number;
    annualizedVolatility: number;
    downsideDeviation: number;
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    avgWinPct: number;
    avgLossPct: number;
    largestWinPct: number;
    largestLossPct: number;
    avgHoldingBars: number;
    buyAndHoldReturnPct: number;
    alpha: number;
    config: {
        startDate: string;
        endDate: string;
        barInterval: string;
        strategy: {
            entryThreshold: number;
            exitThreshold: number;
            shortEntryThreshold: number;
            shortExitThreshold: number;
            useShorts: boolean;
        };
        risk: {
            stopLossAtrMultiple: number;
            trailingStopPct: number | null;
            maxDrawdownPct: number;
        };
    };
}
export type MarketRegime = "bull" | "bear" | "sideways";
export interface BacktestContext {
    metrics: BacktestMetrics;
    regime: MarketRegime;
    promptSection: string;
}
/**
 * Load backtest context from `.backtest-results/latest.json`.
 * Searches relative to process.cwd() (the monorepo or backtest package root).
 * Returns null if no file exists or parsing fails.
 */
export declare function loadBacktestContext(): Promise<BacktestContext | null>;
/**
 * Return the cached backtest context synchronously.
 * Returns null if `loadBacktestContext()` has not been called yet or found no data.
 */
export declare function getCachedBacktestContext(): BacktestContext | null;
/**
 * Clear cached backtest context (useful for testing).
 */
export declare function clearBacktestCache(): void;
//# sourceMappingURL=BacktestContext.d.ts.map