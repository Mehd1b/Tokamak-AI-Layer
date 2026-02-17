import type { Address } from "viem";
import type { Position, ClosedTrade, EquityPoint, ExitReason, RiskConfig, ExecutionConfig } from "./types.js";
/**
 * Manages portfolio state: cash, positions, equity tracking.
 * Handles stop-loss, take-profit, and trailing stop execution.
 */
export declare class Portfolio {
    private cash;
    private positions;
    private closedTrades;
    private equityCurve;
    private peakEquity;
    private nextPositionId;
    private readonly exchange;
    constructor(initialCapital: number, executionConfig: ExecutionConfig);
    getCash(): number;
    getPositions(): readonly Position[];
    getClosedTrades(): readonly ClosedTrade[];
    getEquityCurve(): readonly EquityPoint[];
    getOpenPositionCount(): number;
    hasPositionFor(token: Address): boolean;
    /**
     * Compute mark-to-market equity.
     */
    computeEquity(currentPrices: Map<string, number>): number;
    /**
     * Open a new position.
     */
    openPosition(token: Address, symbol: string, direction: "long" | "short", price: number, equityPct: number, currentEquity: number, atr: number, riskConfig: RiskConfig, barIndex: number): Position | null;
    /**
     * Close a position at the given price.
     */
    closePosition(positionId: string, exitPrice: number, exitReason: ExitReason, barIndex: number, timestamp: number, entryTimestamp: number): ClosedTrade | null;
    /**
     * Check and execute pending stop-loss, take-profit, and trailing stop orders.
     * Called at the start of each bar with the current bar's price.
     */
    checkOrders(currentPrices: Map<string, number>, barIndex: number, timestamp: number, barTimestamps: Map<string, number[]>, riskConfig: RiskConfig): ClosedTrade[];
    /**
     * Record an equity point for the current bar.
     */
    recordEquityPoint(currentPrices: Map<string, number>, barIndex: number, timestamp: number): EquityPoint;
    /**
     * Close all remaining positions at end of backtest.
     */
    closeAllPositions(currentPrices: Map<string, number>, barIndex: number, timestamp: number, barTimestamps: Map<string, number[]>): ClosedTrade[];
    /**
     * Check if circuit breaker should halt trading.
     */
    isCircuitBreakerTriggered(maxDrawdownPct: number): boolean;
}
//# sourceMappingURL=Portfolio.d.ts.map