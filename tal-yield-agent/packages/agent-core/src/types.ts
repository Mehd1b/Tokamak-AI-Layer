import { z } from "zod";

// ============================================================
// Chain & Token Types
// ============================================================

export const ChainIdSchema = z.union([
  z.literal(1),      // Ethereum
  z.literal(10),     // Optimism
  z.literal(42161),  // Arbitrum
  z.literal(55004),  // Tokamak L2
]);
export type ChainId = z.infer<typeof ChainIdSchema>;

export const CHAIN_NAMES: Record<ChainId, string> = {
  1: "Ethereum",
  10: "Optimism",
  42161: "Arbitrum",
  55004: "Tokamak L2",
};

export const TokenInfoSchema = z.object({
  symbol: z.string(),
  address: z.string(),
  decimals: z.number().int().min(0).max(18),
  priceUSD: z.number().nonnegative(),
});
export type TokenInfo = z.infer<typeof TokenInfoSchema>;

// ============================================================
// Audit & Risk Types
// ============================================================

export const AuditInfoSchema = z.object({
  audited: z.boolean(),
  auditors: z.array(z.string()),
  auditCount: z.number().int().nonnegative(),
  bugBountyActive: z.boolean(),
  bugBountySize: z.number().nonnegative(),
});
export type AuditInfo = z.infer<typeof AuditInfoSchema>;

export const RiskMetricsSchema = z.object({
  overallScore: z.number().min(0).max(100),
  smartContractRisk: z.number().min(0).max(100),
  marketRisk: z.number().min(0).max(100),
  liquidityRisk: z.number().min(0).max(100),
  protocolRisk: z.number().min(0).max(100),
  centralizationRisk: z.number().min(0).max(100),
});
export type RiskMetrics = z.infer<typeof RiskMetricsSchema>;

// ============================================================
// Pool Data
// ============================================================

export const ProtocolTypeSchema = z.enum([
  "lending",
  "amm",
  "stableswap",
  "liquid-staking",
  "staking",
]);
export type ProtocolType = z.infer<typeof ProtocolTypeSchema>;

export const PoolDataSchema = z.object({
  protocol: z.string(),
  protocolType: ProtocolTypeSchema,
  chain: ChainIdSchema,
  poolId: z.string(),
  tokens: z.array(TokenInfoSchema),
  currentAPY: z.number(),
  tvl: z.number().nonnegative(),
  volume24h: z.number().nonnegative(),
  ilRisk: z.number().min(0).max(1),
  protocolRiskScore: z.number().min(0).max(100),
  auditStatus: AuditInfoSchema,
  contractAge: z.number().int().nonnegative(),
});
export type PoolData = z.infer<typeof PoolDataSchema>;

// ============================================================
// APY Timeseries
// ============================================================

export const APYDataPointSchema = z.object({
  timestamp: z.number(),
  apy: z.number(),
});
export type APYDataPoint = z.infer<typeof APYDataPointSchema>;

export const APYTimeseriesSchema = z.object({
  poolId: z.string(),
  protocol: z.string(),
  chain: ChainIdSchema,
  dataPoints: z.array(APYDataPointSchema),
  periodDays: z.number().positive(),
});
export type APYTimeseries = z.infer<typeof APYTimeseriesSchema>;

// ============================================================
// Data Snapshot (for StakeSecured validation)
// ============================================================

export const DataSnapshotSchema = z.object({
  snapshotId: z.string(),
  timestamp: z.number(),
  blockNumbers: z.record(z.string(), z.number()),
  poolStates: z.array(PoolDataSchema),
  priceFeed: z.record(z.string(), z.number()),
  metadata: z.object({
    sources: z.array(z.string()),
    fetchDuration: z.number().nonnegative(),
    adapterVersions: z.record(z.string(), z.string()),
  }),
});
export type DataSnapshot = z.infer<typeof DataSnapshotSchema>;

// ============================================================
// Protocol Adapter Interface
// ============================================================

export interface IProtocolAdapter {
  readonly protocolName: string;
  readonly protocolType: ProtocolType;
  readonly supportedChains: readonly ChainId[];

  getPoolData(poolId: string): Promise<PoolData>;
  getAllPools(): Promise<PoolData[]>;
  getHistoricalAPY(poolId: string, days: number): Promise<APYTimeseries>;
  getTVL(poolId: string): Promise<number>;
  getProtocolRisk(): Promise<RiskMetrics>;
}

// ============================================================
// Data Source Interface (injectable for testing)
// ============================================================

export interface IDataSource {
  fetch<T>(url: string, schema: z.ZodType<T>): Promise<T>;
  fetchRaw(url: string): Promise<unknown>;
}

// ============================================================
// IPFS Storage Interface (injectable)
// ============================================================

export interface IIPFSStorage {
  pin(data: unknown): Promise<string>;  // returns CID
  get<T>(cid: string, schema: z.ZodType<T>): Promise<T>;
}

// ============================================================
// DeFi Llama API Response Schemas
// ============================================================

export const DefiLlamaPoolSchema = z.object({
  pool: z.string(),
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  tvlUsd: z.number().nonnegative(),
  apy: z.number().nullable(),
  apyBase: z.number().nullable(),
  apyReward: z.number().nullable(),
  il7d: z.number().nullable(),
  volumeUsd1d: z.number().nullable(),
  exposure: z.string().nullable().optional(),
  underlyingTokens: z.array(z.string()).nullable().optional(),
});
export type DefiLlamaPool = z.infer<typeof DefiLlamaPoolSchema>;

export const DefiLlamaYieldsResponseSchema = z.object({
  status: z.string(),
  data: z.array(DefiLlamaPoolSchema),
});

export const DefiLlamaChartDataPointSchema = z.object({
  timestamp: z.string(),
  tvlUsd: z.number(),
  apy: z.number().nullable(),
  apyBase: z.number().nullable(),
  apyReward: z.number().nullable(),
  il7d: z.number().nullable(),
});

export const DefiLlamaChartResponseSchema = z.object({
  status: z.string(),
  data: z.array(DefiLlamaChartDataPointSchema),
});
