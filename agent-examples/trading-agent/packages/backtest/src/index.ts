export { BacktestEngine } from "./BacktestEngine.js";
export { HistoricalDataLoader } from "./HistoricalDataLoader.js";
export { SignalEngine } from "./SignalEngine.js";
export { Portfolio } from "./Portfolio.js";
export { SimulatedExchange } from "./SimulatedExchange.js";
export { PerformanceMetrics } from "./PerformanceMetrics.js";
export { ReportGenerator } from "./ReportGenerator.js";

export type {
  BacktestConfig,
  BacktestResult,
  StrategyConfig,
  ExecutionConfig,
  RiskConfig,
  PriceBar,
  Position,
  ClosedTrade,
  EquityPoint,
  ExitReason,
  SignalResult,
  FillResult,
  BarInterval,
  TrendFilterConfig,
} from "./types.js";

export {
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_EXECUTION_CONFIG,
  DEFAULT_RISK_CONFIG,
} from "./types.js";
