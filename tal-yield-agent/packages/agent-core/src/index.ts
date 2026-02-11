// Types
export type {
  ChainId,
  PoolData,
  TokenInfo,
  AuditInfo,
  RiskMetrics,
  ProtocolType,
  APYTimeseries,
  APYDataPoint,
  DataSnapshot,
  DefiLlamaPool,
  IProtocolAdapter,
  IDataSource,
  IIPFSStorage,
} from "./types.js";

export {
  ChainIdSchema,
  PoolDataSchema,
  TokenInfoSchema,
  AuditInfoSchema,
  RiskMetricsSchema,
  APYTimeseriesSchema,
  DataSnapshotSchema,
  DefiLlamaPoolSchema,
  DefiLlamaYieldsResponseSchema,
  DefiLlamaChartResponseSchema,
  CHAIN_NAMES,
} from "./types.js";

// Adapters
export {
  AaveV3Adapter,
  CompoundV3Adapter,
  UniswapV3Adapter,
  CurveAdapter,
  LidoAdapter,
  TokamakStakingAdapter,
  AdapterRegistry,
  HttpDataSource,
} from "./adapters/index.js";

// Snapshot
export { SnapshotManager } from "./snapshot/index.js";

// Pipeline
export { DataPipeline, RateLimiter } from "./pipeline/index.js";

// Analysis Engine
export {
  RiskScorer,
  APYPredictor,
  StrategyGenerator,
  ExecutionTracer,
  verifyTraces,
  DEFAULT_RISK_PROFILES,
} from "./analysis/index.js";

export type {
  RiskProfile,
  RiskLevel,
  RiskScore,
  RiskBreakdown,
  APYPrediction,
  APYRange,
  APYFactor,
  StrategyReport,
  Allocation,
  AlternativeStrategy,
  ScoredPool,
  ExecutionTrace,
  TraceStep,
} from "./analysis/index.js";
