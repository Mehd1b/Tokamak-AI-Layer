import type { SignalResult } from "./types.js";
/**
 * Generates trading signals from price data using the same indicator pipeline
 * as the live agent. Technical signals only (no DeFi metrics available historically).
 * Weights are re-normalized so the output is on [0, 100].
 */
export declare class SignalEngine {
    private readonly quant;
    constructor();
    /**
     * Compute long/short scores for a price window.
     * Uses only the provided lookback prices (no future data).
     */
    computeSignal(prices: number[]): SignalResult;
}
//# sourceMappingURL=SignalEngine.d.ts.map