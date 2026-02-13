import type { TradingStrategy, RiskValidation, RiskParams } from "@tal-trading-agent/shared";
export interface RiskManagerConfig {
    params?: Partial<RiskParams>;
}
export declare class RiskManager {
    private readonly params;
    private readonly log;
    constructor(config?: RiskManagerConfig);
    /**
     * Validates a trading strategy against risk parameters.
     * Returns validation result with errors (hard blockers) and warnings (advisory).
     */
    validateStrategy(strategy: TradingStrategy): RiskValidation;
    /**
     * Adjusts a trading strategy to comply with risk limits.
     * Returns a new strategy with modifications applied.
     */
    adjustForRisk(strategy: TradingStrategy): TradingStrategy;
}
//# sourceMappingURL=RiskManager.d.ts.map