import type { ChainId, PoolData, DataSnapshot } from "../types.js";

// ============================================================
// Risk Profile (user input)
// ============================================================

export type RiskLevel = "conservative" | "moderate" | "aggressive";

export interface RiskProfile {
  level: RiskLevel;
  maxILTolerance: number;
  minTVL: number;
  minProtocolAge: number;
  chainPreferences: ChainId[];
  excludeProtocols: string[];
  maxSinglePoolAllocation: number;
}

export const DEFAULT_RISK_PROFILES: Record<RiskLevel, RiskProfile> = {
  conservative: {
    level: "conservative",
    maxILTolerance: 0.02,
    minTVL: 500_000_000,
    minProtocolAge: 365,
    chainPreferences: [1],
    excludeProtocols: [],
    maxSinglePoolAllocation: 0.3,
  },
  moderate: {
    level: "moderate",
    maxILTolerance: 0.05,
    minTVL: 100_000_000,
    minProtocolAge: 180,
    chainPreferences: [1, 10, 42161],
    excludeProtocols: [],
    maxSinglePoolAllocation: 0.4,
  },
  aggressive: {
    level: "aggressive",
    maxILTolerance: 0.15,
    minTVL: 10_000_000,
    minProtocolAge: 30,
    chainPreferences: [1, 10, 42161, 55004],
    excludeProtocols: [],
    maxSinglePoolAllocation: 0.5,
  },
};

// ============================================================
// Risk Score (output)
// ============================================================

export interface RiskBreakdown {
  smartContractRisk: number;   // 0-25
  marketRisk: number;          // 0-20
  liquidityRisk: number;       // 0-20
  protocolRisk: number;        // 0-15
  impermanentLoss: number;     // 0-15
  regulatoryRisk: number;      // 0-5
}

export interface RiskScore {
  overall: number;             // 0-100
  breakdown: RiskBreakdown;
  confidence: number;          // 0-1
}

// ============================================================
// APY Prediction
// ============================================================

export interface APYRange {
  mean: number;
  low: number;
  high: number;
}

export interface APYFactor {
  name: string;
  impact: number;
  description: string;
}

export interface APYPrediction {
  pool: string;
  currentAPY: number;
  predicted7d: APYRange;
  predicted30d: APYRange;
  predicted90d: APYRange;
  confidence: number;
  methodology: string;
  factors: APYFactor[];
}

// ============================================================
// Strategy Report
// ============================================================

export interface Allocation {
  protocol: string;
  pool: string;
  chain: ChainId;
  percentage: number;
  amountUSD: number;
  expectedAPY: APYPrediction;
  riskScore: number;
}

export interface AlternativeStrategy {
  name: string;
  blendedAPY: number;
  riskScore: number;
  reason: string;
}

export interface StrategyReport {
  reportId: string;
  requestId: string;
  snapshotId: string;
  timestamp: number;
  riskProfile: RiskProfile;
  capitalUSD: number;

  allocations: Allocation[];
  expectedAPY: {
    blended: number;
    range: { low: number; high: number };
  };
  riskScore: RiskScore;

  reasoning: string[];
  alternativesConsidered: AlternativeStrategy[];
  warnings: string[];

  executionHash: string;
}

// ============================================================
// Execution Trace
// ============================================================

export interface TraceStep {
  stepId: number;
  operation: string;
  inputHash: string;
  outputHash: string;
  duration: number;
}

export interface ExecutionTrace {
  steps: TraceStep[];
  inputHash: string;
  outputHash: string;
  executionHash: string;
}

// ============================================================
// Scored Pool (internal)
// ============================================================

export interface ScoredPool {
  pool: PoolData;
  riskScore: RiskScore;
  prediction: APYPrediction;
  riskAdjustedReturn: number;
}
