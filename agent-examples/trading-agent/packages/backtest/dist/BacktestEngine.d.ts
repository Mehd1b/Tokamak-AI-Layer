import type { BacktestConfig, BacktestResult } from "./types.js";
/**
 * Main backtest orchestrator. Replays historical prices bar-by-bar,
 * computes indicators on the available lookback window (no look-ahead),
 * generates signals, and simulates fills with realistic costs.
 */
export declare class BacktestEngine {
    private readonly dataLoader;
    private readonly signalEngine;
    private readonly metrics;
    constructor();
    /**
     * Run a full backtest and return performance results.
     */
    run(config: BacktestConfig): Promise<BacktestResult>;
    /**
     * Load prices for all tokens in config.
     */
    private loadAllPrices;
    /**
     * Align timestamps across all tokens.
     * Uses the union of all timestamps; fills forward for missing bars.
     */
    private alignTimestamps;
    /**
     * Compute Simple Moving Average ending at barIdx (inclusive).
     * Returns null if insufficient data.
     */
    private computeSMA;
}
//# sourceMappingURL=BacktestEngine.d.ts.map