import { getTokenBySymbol } from "@tal-trading-agent/shared";
import { BacktestEngine } from "./BacktestEngine.js";
import { ReportGenerator } from "./ReportGenerator.js";
import { DEFAULT_STRATEGY_CONFIG, DEFAULT_EXECUTION_CONFIG, DEFAULT_RISK_CONFIG, } from "./types.js";
// ── CLI Argument Parser ─────────────────────────────────
function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith("--")) {
                args[key] = next;
                i++;
            }
            else {
                args[key] = "true";
            }
        }
    }
    return args;
}
function printUsage() {
    console.log(`
Backtest Engine for TAL Trading Agent

Usage: pnpm --filter @tal-trading-agent/backtest backtest [options]

Options:
  --tokens        Comma-separated symbols (default: WETH,WBTC,UNI,AAVE,LINK)
  --start         Start date YYYY-MM-DD (default: 1 year ago)
  --end           End date YYYY-MM-DD (default: today)
  --capital       Initial capital USD (default: 10000)
  --interval      Bar interval: 1h, 4h, 1d (default: 1d)
  --entry         Entry score threshold (default: 62)
  --exit          Exit score threshold (default: 40)
  --max-positions Max concurrent positions (default: 5)
  --stop-atr      Stop-loss ATR multiple (default: 2)
  --tp-atr        Take-profit ATR multiple (default: 4)
  --trailing-stop Trailing stop % (default: off)
  --slippage      Fixed slippage bps (default: 30)
  --fee           Swap fee bps (default: 30)
  --shorts        Allow shorts (default: false)
  --short-entry   Short entry score threshold (default: 65)
  --short-exit    Short exit score threshold (default: 40)
  --trend-filter  Enable WETH 50-bar MA trend filter (default: false)
  --tf-period     Trend filter MA period (default: 50)
  --output        Output JSON path (default: .backtest-results/latest.json)
  --help          Show this help message
`);
}
// ── Token Resolution ────────────────────────────────────
function resolveTokens(symbolList) {
    const symbols = symbolList.split(",").map((s) => s.trim().toUpperCase());
    const addresses = [];
    for (const symbol of symbols) {
        const meta = getTokenBySymbol(symbol);
        if (meta) {
            addresses.push(meta.address);
        }
        else {
            console.warn(`Warning: Unknown token symbol "${symbol}", skipping`);
        }
    }
    return addresses;
}
// ── Main ────────────────────────────────────────────────
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args["help"] !== undefined) {
        printUsage();
        process.exit(0);
    }
    // Parse arguments with defaults
    const tokenSymbols = args["tokens"] ?? "WETH,WBTC,UNI,AAVE,LINK";
    const tokens = resolveTokens(tokenSymbols);
    if (tokens.length === 0) {
        console.error("Error: No valid tokens specified");
        process.exit(1);
    }
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const startDate = args["start"] ? new Date(args["start"]) : oneYearAgo;
    const endDate = args["end"] ? new Date(args["end"]) : now;
    const initialCapital = args["capital"] ? Number(args["capital"]) : 10000;
    const barInterval = (args["interval"] ?? "1d");
    const outputPath = args["output"] ?? ".backtest-results/latest.json";
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error("Error: Invalid date format. Use YYYY-MM-DD");
        process.exit(1);
    }
    if (startDate >= endDate) {
        console.error("Error: Start date must be before end date");
        process.exit(1);
    }
    // Resolve quote token (USDC by default)
    const quoteToken = (getTokenBySymbol("USDC")?.address ?? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    const config = {
        tokens,
        quoteToken,
        startDate,
        endDate,
        initialCapital,
        barInterval,
        strategy: {
            ...DEFAULT_STRATEGY_CONFIG,
            entryThreshold: args["entry"] ? Number(args["entry"]) : DEFAULT_STRATEGY_CONFIG.entryThreshold,
            exitThreshold: args["exit"] ? Number(args["exit"]) : DEFAULT_STRATEGY_CONFIG.exitThreshold,
            maxPositions: args["max-positions"] ? Number(args["max-positions"]) : DEFAULT_STRATEGY_CONFIG.maxPositions,
            useShorts: args["shorts"] === "true",
            shortEntryThreshold: args["short-entry"] ? Number(args["short-entry"]) : DEFAULT_STRATEGY_CONFIG.shortEntryThreshold,
            shortExitThreshold: args["short-exit"] ? Number(args["short-exit"]) : DEFAULT_STRATEGY_CONFIG.shortExitThreshold,
            trendFilter: {
                ...DEFAULT_STRATEGY_CONFIG.trendFilter,
                enabled: args["trend-filter"] === "true",
                maPeriod: args["tf-period"] ? Number(args["tf-period"]) : DEFAULT_STRATEGY_CONFIG.trendFilter.maPeriod,
            },
        },
        execution: {
            ...DEFAULT_EXECUTION_CONFIG,
            fixedSlippageBps: args["slippage"] ? Number(args["slippage"]) : DEFAULT_EXECUTION_CONFIG.fixedSlippageBps,
            swapFeeBps: args["fee"] ? Number(args["fee"]) : DEFAULT_EXECUTION_CONFIG.swapFeeBps,
        },
        risk: {
            ...DEFAULT_RISK_CONFIG,
            stopLossAtrMultiple: args["stop-atr"] ? Number(args["stop-atr"]) : DEFAULT_RISK_CONFIG.stopLossAtrMultiple,
            takeProfitAtrMultiple: args["tp-atr"] ? Number(args["tp-atr"]) : DEFAULT_RISK_CONFIG.takeProfitAtrMultiple,
            trailingStopPct: args["trailing-stop"] ? Number(args["trailing-stop"]) : DEFAULT_RISK_CONFIG.trailingStopPct,
        },
    };
    console.log(`\nBacktest: ${tokenSymbols} | ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)} | $${initialCapital} | ${barInterval}`);
    console.log("Loading historical data...\n");
    const engine = new BacktestEngine();
    const result = await engine.run(config);
    const reporter = new ReportGenerator();
    reporter.printReport(result);
    await reporter.exportJson(result, outputPath);
}
main().catch((error) => {
    console.error("Backtest failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map