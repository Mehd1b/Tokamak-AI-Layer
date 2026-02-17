import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pino from "pino";
const logger = pino({ name: "BacktestContext" });
// ── In-memory cache ──
let cachedContext = null;
let cacheKey = null;
function classifyRegime(totalReturnPct) {
    if (totalReturnPct > 10)
        return "bull";
    if (totalReturnPct < -10)
        return "bear";
    return "sideways";
}
function formatPromptSection(m, regime) {
    const regimeLabel = regime === "bull" ? "bullish" : regime === "bear" ? "bearish" : "sideways";
    const oppositeAdvice = regime === "bear"
        ? "In bullish conditions, these conservative parameters may underperform. Consider widening entry thresholds."
        : regime === "bull"
            ? "In bearish conditions, these aggressive parameters may amplify losses. Consider tightening stops."
            : "Parameters were tuned for range-bound markets. Strong trends in either direction may require adjustment.";
    return `## Historical Backtest Performance
The following metrics are from backtesting this signal pipeline on ${m.config.barInterval} bars over ${m.config.startDate.slice(0, 10)} to ${m.config.endDate.slice(0, 10)}:
- Total Return: ${m.totalReturnPct.toFixed(1)}% | Buy & Hold: ${m.buyAndHoldReturnPct.toFixed(1)}% | Alpha: ${m.alpha.toFixed(1)}%
- Sharpe: ${m.sharpeRatio.toFixed(2)} | Sortino: ${m.sortinoRatio.toFixed(2)} | Calmar: ${m.calmarRatio.toFixed(2)}
- Max Drawdown: ${m.maxDrawdownPct.toFixed(1)}% over ${m.maxDrawdownDurationBars} bars
- Win Rate: ${m.winRate.toFixed(1)}% | Profit Factor: ${m.profitFactor.toFixed(2)} | Total Trades: ${m.totalTrades}
- Avg Win: ${m.avgWinPct.toFixed(1)}% | Avg Loss: ${m.avgLossPct.toFixed(1)}%
- Optimal parameters: entry threshold ${m.config.strategy.entryThreshold}, short-entry ${m.config.strategy.shortEntryThreshold}, stop-loss ${m.config.risk.stopLossAtrMultiple}x ATR${m.config.risk.trailingStopPct != null ? `, trailing stop ${m.config.risk.trailingStopPct}%` : ""}

KEY INSIGHT: These parameters were optimized for a ${regimeLabel} market (${m.totalReturnPct.toFixed(1)}% return period).
${oppositeAdvice}
Use these historical results to calibrate confidence, but do NOT blindly copy parameters — adapt to current conditions.`;
}
/**
 * Load backtest context from `.backtest-results/latest.json`.
 * Searches relative to process.cwd() (the monorepo or backtest package root).
 * Returns null if no file exists or parsing fails.
 */
export async function loadBacktestContext() {
    // Try multiple possible locations for the backtest results
    const searchPaths = [
        resolve(process.cwd(), ".backtest-results", "latest.json"),
        resolve(process.cwd(), "packages", "backtest", ".backtest-results", "latest.json"),
    ];
    for (const filePath of searchPaths) {
        // Check cache
        if (cacheKey === filePath && cachedContext) {
            return cachedContext;
        }
        try {
            const raw = await readFile(filePath, "utf-8");
            const data = JSON.parse(raw);
            // Basic validation
            if (typeof data.totalReturnPct !== "number" || typeof data.sharpeRatio !== "number") {
                logger.warn({ filePath }, "Backtest file exists but has invalid shape");
                continue;
            }
            const regime = classifyRegime(data.totalReturnPct);
            const promptSection = formatPromptSection(data, regime);
            const ctx = { metrics: data, regime, promptSection };
            cachedContext = ctx;
            cacheKey = filePath;
            logger.info({ filePath, regime, totalReturn: data.totalReturnPct, sharpe: data.sharpeRatio }, "Loaded backtest context");
            return ctx;
        }
        catch {
            // File doesn't exist or can't be parsed — try next path
        }
    }
    logger.debug("No backtest results found — proceeding without historical context");
    return null;
}
/**
 * Return the cached backtest context synchronously.
 * Returns null if `loadBacktestContext()` has not been called yet or found no data.
 */
export function getCachedBacktestContext() {
    return cachedContext;
}
/**
 * Clear cached backtest context (useful for testing).
 */
export function clearBacktestCache() {
    cachedContext = null;
    cacheKey = null;
}
//# sourceMappingURL=BacktestContext.js.map