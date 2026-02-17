import type { BacktestResult } from "./types.js";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Generates formatted backtest reports to console and JSON files.
 */
export class ReportGenerator {
  /**
   * Print a formatted performance report to stdout.
   */
  printReport(result: BacktestResult): void {
    const { config } = result;

    console.log("\n" + "=".repeat(70));
    console.log("  BACKTEST PERFORMANCE REPORT");
    console.log("=".repeat(70));

    // Config summary
    console.log("\n--- Configuration ---");
    console.log(`  Tokens:          ${config.tokens.length} tokens`);
    console.log(`  Period:          ${fmt(config.startDate)} to ${fmt(config.endDate)}`);
    console.log(`  Initial Capital: $${config.initialCapital.toLocaleString()}`);
    console.log(`  Bar Interval:    ${config.barInterval}`);
    console.log(`  Entry Threshold: ${config.strategy.entryThreshold}`);
    console.log(`  Exit Threshold:  ${config.strategy.exitThreshold}`);
    console.log(`  Max Positions:   ${config.strategy.maxPositions}`);
    console.log(`  Shorts Allowed:  ${config.strategy.useShorts ? "Yes" : "No"}`);
    console.log(`  Trend Filter:    ${config.strategy.trendFilter.enabled ? `WETH ${config.strategy.trendFilter.maPeriod}-bar MA` : "Off"}`);

    // Returns
    console.log("\n--- Returns ---");
    console.log(`  Total Return:      ${sign(result.totalReturnPct)}%`);
    console.log(`  Annualized (CAGR): ${sign(result.annualizedReturnPct)}%`);
    console.log(`  Buy & Hold:        ${sign(result.buyAndHoldReturnPct)}%`);
    console.log(`  Alpha:             ${sign(result.alpha)}%`);

    // Risk
    console.log("\n--- Risk ---");
    console.log(`  Max Drawdown:       ${result.maxDrawdownPct}%`);
    console.log(`  Max DD Duration:    ${result.maxDrawdownDurationBars} bars`);
    console.log(`  Annualized Vol:     ${result.annualizedVolatility}%`);
    console.log(`  Downside Deviation: ${result.downsideDeviation}%`);

    // Risk-adjusted
    console.log("\n--- Risk-Adjusted ---");
    console.log(`  Sharpe Ratio:  ${result.sharpeRatio}`);
    console.log(`  Sortino Ratio: ${result.sortinoRatio}`);
    console.log(`  Calmar Ratio:  ${result.calmarRatio}`);

    // Trade stats
    console.log("\n--- Trade Statistics ---");
    console.log(`  Total Trades:    ${result.totalTrades}`);
    console.log(`  Win Rate:        ${result.winRate}%`);
    console.log(`  Profit Factor:   ${result.profitFactor}`);
    console.log(`  Avg Win:         ${sign(result.avgWinPct)}%`);
    console.log(`  Avg Loss:        ${sign(result.avgLossPct)}%`);
    console.log(`  Largest Win:     ${sign(result.largestWinPct)}%`);
    console.log(`  Largest Loss:    ${sign(result.largestLossPct)}%`);
    console.log(`  Avg Holding:     ${result.avgHoldingBars} bars`);

    // Top trades
    if (result.trades.length > 0) {
      const sorted = [...result.trades].sort((a, b) => b.pnl - a.pnl);

      console.log("\n--- Top 5 Winning Trades ---");
      const topWins = sorted.filter((t) => t.pnl > 0).slice(0, 5);
      if (topWins.length === 0) {
        console.log("  (none)");
      } else {
        for (const t of topWins) {
          console.log(
            `  ${t.symbol} ${t.direction} | P&L: $${t.pnl.toFixed(2)} (${sign(t.pnlPercent)}%) | ${t.holdingBars} bars | ${t.exitReason}`,
          );
        }
      }

      console.log("\n--- Top 5 Losing Trades ---");
      const topLosses = sorted.filter((t) => t.pnl <= 0).slice(-5).reverse();
      if (topLosses.length === 0) {
        console.log("  (none)");
      } else {
        for (const t of topLosses) {
          console.log(
            `  ${t.symbol} ${t.direction} | P&L: $${t.pnl.toFixed(2)} (${sign(t.pnlPercent)}%) | ${t.holdingBars} bars | ${t.exitReason}`,
          );
        }
      }
    }

    // Equity curve sparkline
    if (result.equityCurve.length > 2) {
      console.log("\n--- Equity Curve ---");
      console.log(`  ${this.sparkline(result.equityCurve.map((e) => e.equity))}`);
      const final = result.equityCurve.at(-1)!;
      console.log(
        `  Start: $${config.initialCapital.toLocaleString()} -> End: $${final.equity.toFixed(2)}`,
      );
    }

    console.log("\n" + "=".repeat(70) + "\n");
  }

  /**
   * Export full result as JSON to disk.
   */
  async exportJson(result: BacktestResult, outputPath: string): Promise<void> {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Serialize with custom replacer for Dates
    const serializable = {
      ...result,
      config: {
        ...result.config,
        startDate: result.config.startDate.toISOString(),
        endDate: result.config.endDate.toISOString(),
      },
    };

    await writeFile(outputPath, JSON.stringify(serializable, null, 2), "utf-8");
    console.log(`Report exported to: ${outputPath}`);
  }

  /**
   * Generate a simple sparkline from numeric values.
   */
  private sparkline(values: number[]): string {
    const chars = "▁▂▃▄▅▆▇█";
    if (values.length === 0) return "";

    // Downsample to ~60 chars max
    const maxWidth = 60;
    let sampled: number[];
    if (values.length > maxWidth) {
      const step = values.length / maxWidth;
      sampled = [];
      for (let i = 0; i < maxWidth; i++) {
        sampled.push(values[Math.floor(i * step)]!);
      }
    } else {
      sampled = values;
    }

    const min = Math.min(...sampled);
    const max = Math.max(...sampled);
    const range = max - min;

    if (range === 0) return chars[4]!.repeat(sampled.length);

    return sampled
      .map((v) => {
        const idx = Math.round(((v - min) / range) * (chars.length - 1));
        return chars[idx] ?? chars[0];
      })
      .join("");
  }
}

// ── Helpers ─────────────────────────────────────────────

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
