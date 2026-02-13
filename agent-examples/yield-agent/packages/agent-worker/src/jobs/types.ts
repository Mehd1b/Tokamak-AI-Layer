import type { RiskLevel } from "@tal-yield-agent/agent-core";

// ============================================================
// Job Names
// ============================================================

export const JOB_NAMES = {
  POOL_DATA_REFRESH: "pool-data-refresh",
  STRATEGY_GENERATE: "strategy-generate",
  STRATEGY_DELIVER: "strategy-deliver",
  APY_ACCURACY_CHECK: "apy-accuracy-check",
  SNAPSHOT_PIN: "snapshot-pin",
  REPUTATION_UPDATE: "reputation-update",
  PAYMENT_CLAIM: "payment-claim",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

// ============================================================
// Job Data Types
// ============================================================

export interface PoolDataRefreshData {
  triggeredBy: "cron" | "manual";
}

export interface StrategyGenerateData {
  taskId: string;
  requester: string;
  riskLevel: RiskLevel;
  capitalUSD: number;
  chainPreferences?: number[];
  excludeProtocols?: string[];
  maxSinglePoolAllocation?: number;
}

export interface StrategyDeliverData {
  taskId: string;
  snapshotId: string;
  executionHash: string;
  reportJson?: string;
  reportIpfsCid?: string;
}

export interface APYAccuracyCheckData {
  taskId: string;
  reportTimestamp: number;
  horizon: "7d" | "30d" | "90d";
}

export interface SnapshotPinData {
  snapshotId: string;
  snapshotData: string; // JSON-serialized DataSnapshot
}

export interface ReputationUpdateData {
  agentId: string;
  taskId: string;
  score: number;
  comment?: string;
}

export interface PaymentClaimData {
  taskId: string;
  agentId: string;
  taskRef: string;
}

// ============================================================
// Job Result Types
// ============================================================

export interface PoolDataRefreshResult {
  snapshotId: string;
  poolCount: number;
  durationMs: number;
}

export interface StrategyGenerateResult {
  taskId: string;
  snapshotId: string;
  executionHash: string;
  allocationCount: number;
  blendedAPY: number;
}

export interface StrategyDeliverResult {
  taskId: string;
  txHash?: string;
  ipfsCid?: string;
}
