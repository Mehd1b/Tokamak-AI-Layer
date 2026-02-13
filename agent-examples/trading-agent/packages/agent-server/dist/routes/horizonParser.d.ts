import type { TradeRequest } from "@tal-trading-agent/shared";
type Horizon = TradeRequest["horizon"];
type RiskTolerance = TradeRequest["riskTolerance"];
/**
 * Infer the trading horizon from a natural language prompt.
 * Returns undefined if no recognizable time reference is found.
 *
 * Examples:
 *   "Invest $100k for the next 6 months"  → "6m"
 *   "Buy tokens for a year"               → "1y"
 *   "Quick trade for 4 hours"             → "4h"
 */
export declare function inferHorizonFromPrompt(prompt: string): Horizon | undefined;
/**
 * Infer the risk tolerance from a natural language prompt.
 * Returns undefined if no recognizable risk preference is found.
 *
 * Examples:
 *   "invest aggressively"          → "aggressive"
 *   "safe low-risk investment"     → "conservative"
 *   "moderate risk"                → "moderate"
 */
export declare function inferRiskToleranceFromPrompt(prompt: string): RiskTolerance | undefined;
export {};
//# sourceMappingURL=horizonParser.d.ts.map