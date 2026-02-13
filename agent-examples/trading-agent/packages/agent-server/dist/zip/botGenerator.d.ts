import type { TradingStrategy } from "@tal-trading-agent/shared";
/**
 * Generates a zip buffer containing a self-contained trading bot repo
 * for the given strategy. The user can unzip, fill in .env, and run.
 */
export declare function generateBotZip(strategy: TradingStrategy): Promise<Buffer>;
//# sourceMappingURL=botGenerator.d.ts.map