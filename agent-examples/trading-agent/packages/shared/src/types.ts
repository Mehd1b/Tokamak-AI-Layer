import type { Address, Hash, Hex } from "viem";

// ── Strategy Mode ───────────────────────────────────────
export type StrategyMode = "scalp" | "swing" | "position" | "investment";

// ── Position Direction & Type ───────────────────────────
export type PositionDirection = "long" | "short";
export type PositionType = "spot_long" | "leveraged_long" | "spot_short" | "leveraged_short";

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
    // Existing
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    bollingerBands: { upper: number; middle: number; lower: number };
    vwap: number;
    momentum: number;

    // New — Trend
    adx: { adx: number; plusDI: number; minusDI: number };
    aroon: { up: number; down: number; oscillator: number };

    // New — Oscillators
    stochasticRsi: { k: number; d: number; raw: number };
    williamsR: number;
    roc: number;

    // New — Volatility
    atr: { atr: number; atrPercent: number };
    historicalVolatility: { dailyVol: number; annualizedVol: number };

    // New — Derived
    vwapDeviation: number;
    bollingerPosition: { percentB: number; bandwidth: number };

    // New — Composite
    trendStrengthComposite: number;
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
  directionalScore?: DirectionalScore;
}

// ── Directional Score ───────────────────────────────────
export interface DirectionalScore {
  longScore: number;
  shortScore: number;
  preferredDirection: PositionDirection;
  directionConfidence: number; // 0-1, abs(longScore - shortScore) / 100
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
  positions?: LeveragedPosition[];
  lendingTransactions?: LendingTransaction[][];
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
  direction?: PositionDirection;
  positionType?: PositionType;
  leverageConfig?: LeverageConfig;
}

export interface RiskMetrics {
  score: number;
  maxDrawdown: number;
  stopLossPrice: bigint;
  takeProfitPrice: bigint;
  positionSizePercent: number;
  leverage?: number;
  liquidationPrice?: bigint;
  healthFactor?: number;
  borrowAPY?: number;
  fundingCostPerDay?: number;
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
  maxLeverage?: number;
  minHealthFactor?: number;
  maxBorrowUtilization?: number;
  allowShorts?: boolean;
}

// ── Leverage & Lending Types ────────────────────────────
export interface LeverageConfig {
  collateralToken: Address;
  debtToken: Address;
  leverageMultiplier: number; // 1.0 for spot, up to 5.0
  protocol: "aave-v3";
  useFlashLoan?: boolean;
}

export interface AaveReserveData {
  ltv: number; // basis points (e.g. 8000 = 80%)
  liquidationThreshold: number; // basis points
  liquidationBonus: number; // basis points
  variableBorrowRate: bigint; // ray (1e27)
  stableBorrowRate: bigint; // ray
  availableLiquidity: bigint;
  totalVariableDebt: bigint;
  totalStableDebt: bigint;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
  isActive: boolean;
  isFrozen: boolean;
}

export interface LeveragedPosition {
  id: string;
  direction: PositionDirection;
  positionType: PositionType;
  collateralToken: Address;
  debtToken: Address;
  collateralAmount: bigint;
  debtAmount: bigint;
  leverageMultiplier: number;
  healthFactor: number;
  liquidationPrice: bigint;
  entryPrice: bigint;
  openedAt: number;
  status: "open" | "closed" | "liquidated";
}

export type LendingTransactionType =
  | "approve"
  | "supply"
  | "borrow"
  | "repay"
  | "withdraw"
  | "swap";

export interface LendingTransaction {
  type: LendingTransactionType;
  to: Address;
  data: Hex;
  value: bigint;
  gasEstimate: bigint;
  description: string;
  token?: Address;
  amount?: bigint;
}
