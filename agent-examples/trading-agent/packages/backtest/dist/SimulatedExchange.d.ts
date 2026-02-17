import type { ExecutionConfig, FillResult } from "./types.js";
/**
 * Simulates trade execution with slippage and fees.
 * Two models: fixed slippage (default) and sqrt-based (AMM-realistic).
 */
export declare class SimulatedExchange {
    private readonly config;
    constructor(config: ExecutionConfig);
    /**
     * Simulate a buy fill at the given market price.
     * Returns the fill price (higher due to slippage) and total fees.
     */
    simulateBuy(marketPrice: number, notionalUsd: number): FillResult;
    /**
     * Simulate a sell fill at the given market price.
     * Returns the fill price (lower due to slippage) and total fees.
     */
    simulateSell(marketPrice: number, notionalUsd: number): FillResult;
    /**
     * Compute slippage as a fraction (0.003 = 0.3%).
     */
    private computeSlippage;
}
//# sourceMappingURL=SimulatedExchange.d.ts.map