import type { Address, Hash, Hex } from "viem";

// ── Strategy Mode ───────────────────────────────────────
export type StrategyMode = "scalp" | "swing" | "position" | "investment";

// ── Trade Request (user input) ───────────────────────────
export interface TradeRequest {
  /** Natural language prompt from the user */
  prompt: string;
  /** Budget in wei (native token or ERC-20) */
  budget: bigint;
  /** Token the user is spending */
  budgetToken: Address;
  /** User's wallet address */
  walletAddress: Address;
  /** Trading time horizon */
  horizon: "1h" | "4h" | "1d" | "1w" | "1m" | "3m" | "6m" | "1y";
  /** Risk tolerance level */
  riskTolerance: "conservative" | "moderate" | "aggressive";
  /** Chain ID for execution */
  chainId: number;
}

// ── Pool Data ────────────────────────────────────────────
export interface PoolData {
  poolAddress: Address;
  token0: TokenInfo;
  token1: TokenInfo;
  feeTier: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
  tvlUsd: number;
  volume24hUsd: number;
  feeApy: number;
}

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number;
}

// ── Data Quality Assessment ─────────────────────────────
export interface DataQuality {
  priceDataPoints: number;
  indicatorsReliable: boolean;
  confidenceScore: number; // 0-1
  confidenceNote: string;
}

// ── Quantitative Analysis ────────────────────────────────
export interface QuantScore {
  tokenAddress: Address;
  symbol: string;
  indicators: {
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    bollingerBands: { upper: number; middle: number; lower: number };
    vwap: number;
    momentum: number;
  };
  defiMetrics: {
    liquidityDepth: number;
    feeApy: number;
    volumeTrend: number;
    tvlStability: number;
    smartMoneyFlow: number;
  };
  overallScore: number;
  reasoning: string;
  dataQuality?: DataQuality;
}

// ── Investment Plan Types ────────────────────────────────
export interface PortfolioAllocation {
  tokenAddress: string;
  symbol: string;
  targetPercent: number;
  reasoning: string;
}

export interface DCASchedule {
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  totalPeriods: number;
  amountPerPeriodPercent: number;
}

export interface RebalanceTrigger {
  type: "calendar" | "drift";
  frequency?: "weekly" | "monthly" | "quarterly";
  driftThresholdPercent?: number;
}

export interface ExitCriteria {
  takeProfitPercent?: number;
  stopLossPercent?: number;
  trailingStopPercent?: number;
  timeExitMonths?: number;
}

export interface InvestmentPlan {
  allocations: PortfolioAllocation[];
  entryStrategy: "lump-sum" | "dca" | "hybrid";
  dcaSchedule?: DCASchedule;
  rebalancing?: RebalanceTrigger;
  exitCriteria?: ExitCriteria;
  thesis: string;
}

// ── Trading Strategy (agent output) ──────────────────────
export interface TradingStrategy {
  id: string;
  request: TradeRequest;
  mode: StrategyMode;
  analysis: {
    marketCondition: "bullish" | "bearish" | "sideways";
    confidence: number;
    reasoning: string;
    topCandidates: QuantScore[];
  };
  trades: TradeAction[];
  investmentPlan?: InvestmentPlan;
  llmReasoning?: string;
  riskMetrics: RiskMetrics;
  estimatedReturn: {
    optimistic: number;
    expected: number;
    pessimistic: number;
  };
  generatedAt: number;
  expiresAt: number;
}

export interface TradeAction {
  action: "buy" | "sell";
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  poolFee: number;
  priceImpact: number;
  route: Address[];
}

export interface RiskMetrics {
  score: number;
  maxDrawdown: number;
  stopLossPrice: bigint;
  takeProfitPrice: bigint;
  positionSizePercent: number;
}

// ── Trade Execution ──────────────────────────────────────
export interface UnsignedSwap {
  to: Address;
  data: Hex;
  value: bigint;
  gasEstimate: bigint;
  description: string;
}

export interface ExecutionResult {
  strategyId: string;
  txHash: Hash;
  status: "pending" | "confirmed" | "failed";
  amountIn: bigint;
  amountOut: bigint;
  gasUsed: bigint;
  executedAt: number;
}

// ── SIWA Session ─────────────────────────────────────────
export interface SIWASession {
  address: Address;
  agentId: bigint;
  chainId: number;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  signature: Hex;
}

export interface SIWAMessageParams {
  domain: string;
  address: Address;
  statement: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

// ── Server Types ─────────────────────────────────────────
export interface AppConfig {
  // Network
  ethereumRpcUrl: string;
  thanosRpcUrl: string;
  chainId: number;

  // Agent
  agentId: bigint;
  agentPrivateKey: Hex;

  // LLM
  anthropicApiKey: string;
  openaiApiKey?: string;

  // IPFS
  pinataApiKey?: string;
  pinataSecretKey?: string;

  // Server
  port: number;
  host: string;
  nodeEnv: string;

  // Security
  apiKeys: Set<string>;
  eip712Auth: boolean;

  // SIWA
  siwaDomain: string;
  siwaSessionTtl: number;

  // Contracts (TAL on Thanos Sepolia)
  identityRegistryAddress: Address;
  reputationRegistryAddress: Address;
  validationRegistryAddress: Address;
  taskFeeEscrowAddress: Address;
}

// ── Risk Validation ──────────────────────────────────────
export interface RiskValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface RiskParams {
  maxSingleTradePercent: number;
  maxSlippagePercent: number;
  minPoolTvlUsd: number;
  maxPriceImpactPercent: number;
  requireStopLoss: boolean;
}
