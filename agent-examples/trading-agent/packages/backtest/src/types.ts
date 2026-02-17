import type { Address } from "viem";

// ── Bar Intervals ───────────────────────────────────────

export type BarInterval = "1h" | "4h" | "1d";

// ── Configuration ───────────────────────────────────────

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

// ── Market Data ─────────────────────────────────────────

export interface PriceBar {
  timestamp: number;
  price: number;
}

// ── Positions & Trades ──────────────────────────────────

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

export type ExitReason =
  | "signal"
  | "stop_loss"
  | "take_profit"
  | "trailing_stop"
  | "circuit_breaker"
  | "end_of_data";

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

// ── Equity Tracking ─────────────────────────────────────

export interface EquityPoint {
  timestamp: number;
  bar: number;
  equity: number;
  cash: number;
  positionsValue: number;
  drawdownPct: number;
}

// ── Backtest Results ────────────────────────────────────

export interface BacktestResult {
  config: BacktestConfig;

  // Returns
  totalReturnPct: number;
  annualizedReturnPct: number;

  // Risk
  maxDrawdownPct: number;
  maxDrawdownDurationBars: number;
  annualizedVolatility: number;
  downsideDeviation: number;

  // Risk-adjusted
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;

  // Trade stats
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  largestWinPct: number;
  largestLossPct: number;
  avgHoldingBars: number;

  // Benchmark
  buyAndHoldReturnPct: number;
  alpha: number;

  // Data
  equityCurve: EquityPoint[];
  trades: ClosedTrade[];
  drawdownCurve: { timestamp: number; drawdownPct: number }[];
}

// ── Signal Output ───────────────────────────────────────

export interface SignalResult {
  longScore: number;
  shortScore: number;
  indicators: Record<string, unknown>;
  atr: number;
}

// ── Fill Result ─────────────────────────────────────────

export interface FillResult {
  fillPrice: number;
  totalFees: number;
}

// ── Defaults ────────────────────────────────────────────

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  entryThreshold: 62,
  exitThreshold: 40,
  maxPositions: 5,
  useShorts: false,
  shortEntryThreshold: 65,
  shortExitThreshold: 40,
  lookbackBars: 50,
  trendFilter: {
    enabled: false,
    token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
    maPeriod: 50,
  },
};

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  slippageModel: "fixed",
  fixedSlippageBps: 30,
  swapFeeBps: 30,
  gasPerTradeUsd: 5,
};

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxPositionPct: 20,
  stopLossAtrMultiple: 2,
  takeProfitAtrMultiple: 4,
  maxDrawdownPct: 25,
  trailingStopPct: null,
};
