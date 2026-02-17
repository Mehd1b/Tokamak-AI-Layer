import type { BacktestResult } from "./types.js";
/**
 * Generates formatted backtest reports to console and JSON files.
 */
export declare class ReportGenerator {
    /**
     * Print a formatted performance report to stdout.
     */
    printReport(result: BacktestResult): void;
    /**
     * Export full result as JSON to disk.
     */
    exportJson(result: BacktestResult, outputPath: string): Promise<void>;
    /**
     * Generate a simple sparkline from numeric values.
     */
    private sparkline;
}
//# sourceMappingURL=ReportGenerator.d.ts.map