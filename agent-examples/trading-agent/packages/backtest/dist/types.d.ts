import type { Address } from "viem";
export type BarInterval = "1h" | "4h" | "1d";
export interface BacktestConfig {
    /** Tokens to trade */
    tokens: Address[];
    /** Quote token (USDC/USDT/WETH) */
    quoteToken: Address;
    /** Backtest start date */
    startDate: Date;
    /** Backtest end date */
    endDate: Date;
    /** Starting capital in USD */
    initialCapital: number;
    /** Bar interval */
    barInterval: BarInterval;
    /** Strategy parameters */
    strategy: StrategyConfig;
    /** Execution parameters */
    execution: ExecutionConfig;
    /** Risk parameters */
    risk: RiskConfig;
}
export interface TrendFilterConfig {
    /** Enable the trend filter (default false) */
    enabled: boolean;
    /** Token address to compute the MA on (default WETH) */
    token: Address;
    /** MA period in bars (default 50) */
    maPeriod: number;
}
export interface StrategyConfig {
    /** Score > threshold triggers buy (default 62) */
    entryThreshold: number;
    /** Score < threshold triggers sell (default 40) */
    exitThreshold: number;
    /** Max concurrent positions (default 5) */
    maxPositions: number;
    /** Allow short signals (default false) */
    useShorts: boolean;
    /** Short score > threshold triggers short (default 65) */
    shortEntryThreshold: number;
    /** Short score < threshold triggers cover (default 40) */
    shortExitThreshold: number;
    /** Indicator lookback window in bars (default 50) */
    lookbackBars: number;
    /** Trend filter: gate longs/shorts based on MA direction */
    trendFilter: TrendFilterConfig;
}
export interface ExecutionConfig {
    /** Slippage model type */
    slippageModel: "fixed" | "sqrt";
    /** Fixed slippage in basis points (default 30 = 0.3%) */
    fixedSlippageBps: number;
    /** Swap fee in basis points (default 30) */
    swapFeeBps: number;
    /** Average gas cost per trade in USD (default 5) */
    gasPerTradeUsd: number;
}
export interface RiskConfig {
    /** Max % of equity per position (default 20) */
    maxPositionPct: number;
    /** Stop-loss = entry - N*ATR (default 2) */
    stopLossAtrMultiple: number;
    /** Take-profit = entry + N*ATR (default 4) */
    takeProfitAtrMultiple: number;
    /** Circuit breaker max drawdown % (default 25) */
    maxDrawdownPct: number;
    /** Trailing stop % or null for disabled (default null) */
    trailingStopPct: number | null;
}
export interface PriceBar {
    timestamp: number;
    price: number;
}
export interface Position {
    id: string;
    token: Address;
    symbol: string;
    direction: "long" | "short";
    entryPrice: number;
    entryBar: number;
    size: number;
    costBasis: number;
    stopLoss: number;
    takeProfit: number;
    trailingStop: number | null;
}
export type ExitReason = "signal" | "stop_loss" | "take_profit" | "trailing_stop" | "circuit_breaker" | "end_of_data";
export interface ClosedTrade {
    token: Address;
    symbol: string;
    direction: "long" | "short";
    entryPrice: number;
    exitPrice: number;
    entryTimestamp: number;
    exitTimestamp: number;
    pnl: number;
    pnlPercent: number;
    holdingBars: number;
    exitReason: ExitReason;
    fees: number;
}
export interface EquityPoint {
    timestamp: number;
    bar: number;
    equity: number;
    cash: number;
    positionsValue: number;
    drawdownPct: number;
}
export interface BacktestResult {
    config: BacktestConfig;
    totalReturnPct: number;
    annualizedReturnPct: number;
    maxDrawdownPct: number;
    maxDrawdownDurationBars: number;
    annualizedVolatility: number;
    downsideDeviation: number;
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    avgWinPct: number;
    avgLossPct: number;
    largestWinPct: number;
    largestLossPct: number;
    avgHoldingBars: number;
    buyAndHoldReturnPct: number;
    alpha: number;
    equityCurve: EquityPoint[];
    trades: ClosedTrade[];
    drawdownCurve: {
        timestamp: number;
        drawdownPct: number;
    }[];
}
export interface SignalResult {
    longScore: number;
    shortScore: number;
    indicators: Record<string, unknown>;
    atr: number;
}
export interface FillResult {
    fillPrice: number;
    totalFees: number;
}
export declare const DEFAULT_STRATEGY_CONFIG: StrategyConfig;
export declare const DEFAULT_EXECUTION_CONFIG: ExecutionConfig;
export declare const DEFAULT_RISK_CONFIG: RiskConfig;
//# sourceMappingURL=types.d.ts.map