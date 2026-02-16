import type { Address } from "viem";
import type { RiskParams, TradeRequest } from "./types.js";

// ── TAL Contracts (Thanos Sepolia) ───────────────────────
export const TAL_CONTRACTS = {
  identityRegistry:
    "0x3f89CD27fD877827E7665A9883b3c0180E22A525" as Address,
  reputationRegistry:
    "0x0052258E517835081c94c0B685409f2EfC4D502b" as Address,
  validationRegistry:
    "0x09447147C6E75a60A449f38532F06E19F5F632F3" as Address,
  stakingIntegrationModule:
    "0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30" as Address,
  taskFeeEscrow:
    "0x6D68Cd8fD89BF1746A1948783C92A00E591d1227" as Address,
} as const;

// ── Uniswap V3 (Ethereum Mainnet) ───────────────────────
export const UNISWAP_V3 = {
  factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984" as Address,
  swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564" as Address,
  quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as Address,
  nftPositionManager:
    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as Address,
} as const;

// ── Aave V3 (Ethereum Mainnet) ──────────────────────────
export const AAVE_V3 = {
  pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" as Address,
  poolDataProvider: "0x7B4EB56E7CD4b454BA8ff71E4518426c8fBFaef0" as Address,
  oracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2" as Address,
} as const;

// ── Aave V3 Common Tokens (Ethereum Mainnet) ────────────
export const AAVE_TOKENS = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address,
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
} as const;

// ── Uniswap V2 (Ethereum Mainnet) ───────────────────────
export const UNISWAP_V2 = {
  factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address,
  router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address,
} as const;

// ── Token Registry (re-exported from tokens.ts) ──────────
export { TOKENS, WETH_ADDRESS, USDT_ADDRESS, USDT_DECIMALS, TOKEN_REGISTRY } from "./tokens.js";
export type { TokenMeta, TokenCategory } from "./tokens.js";

// ── Fee Tiers ────────────────────────────────────────────
export const FEE_TIERS = [100, 500, 3000, 10000] as const;

// ── DeFiLlama API ────────────────────────────────────────
export const DEFILLAMA = {
  pricesUrl: "https://coins.llama.fi/prices/current",
  chartUrl: "https://coins.llama.fi/chart",
} as const;

// ── Chain IDs ────────────────────────────────────────────
export const CHAIN_IDS = {
  ethereum: 1,
  thanosSepolia: 111551119090,
} as const;

// ── Horizon to milliseconds ─────────────────────────────
export const HORIZON_MS: Record<TradeRequest["horizon"], number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "6m": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

// ── Horizon to DeFiLlama chart params ───────────────────
// Valid DeFiLlama periods: "1d", "7d", "30d", "90d", "180d", "365d"
// `span` = number of data points returned (NOT interval)
export const HORIZON_TO_LLAMA_CHART: Record<TradeRequest["horizon"], { period: string; span: number }> = {
  "1h": { period: "1d", span: 24 },    // 24 points over 1 day
  "4h": { period: "1d", span: 30 },    // 30 points over 1 day
  "1d": { period: "7d", span: 35 },    // 35 points over 7 days
  "1w": { period: "7d", span: 40 },    // 40 points over 7 days
  "1m": { period: "30d", span: 60 },   // 60 points over 30 days
  "3m": { period: "90d", span: 60 },   // 60 points over 90 days
  "6m": { period: "180d", span: 60 },  // 60 points over 180 days
  "1y": { period: "365d", span: 75 },  // 75 points over 365 days
};

/** @deprecated Use HORIZON_TO_LLAMA_CHART instead */
export const HORIZON_TO_LLAMA_PERIOD: Record<TradeRequest["horizon"], string> = {
  "1h": "1d",
  "4h": "1d",
  "1d": "7d",
  "1w": "7d",
  "1m": "30d",
  "3m": "90d",
  "6m": "180d",
  "1y": "365d",
};

// ── Target data points per horizon ──────────────────────
// Quality threshold: tokens need at least this many points for reliable indicators.
// RSI needs 15, MACD needs 27, Bollinger needs 20, ADX needs 28, StochRSI needs 30.
// Values are set below the chart `span` to allow for some API gaps.
export const MIN_DATA_POINTS: Record<TradeRequest["horizon"], number> = {
  "1h": 15,
  "4h": 20,
  "1d": 25,
  "1w": 30,
  "1m": 35,
  "3m": 40,
  "6m": 40,
  "1y": 50,
};

// ── Risk Presets per tolerance ───────────────────────────
export const RISK_PRESETS: Record<TradeRequest["riskTolerance"], RiskParams> = {
  conservative: {
    maxSingleTradePercent: 20,
    maxSlippagePercent: 0.5,
    minPoolTvlUsd: 500_000,
    maxPriceImpactPercent: 1,
    requireStopLoss: true,
    maxLeverage: 2,
    minHealthFactor: 1.5,
    maxBorrowUtilization: 0.5,
    allowShorts: false,
  },
  moderate: {
    maxSingleTradePercent: 35,
    maxSlippagePercent: 1,
    minPoolTvlUsd: 100_000,
    maxPriceImpactPercent: 2,
    requireStopLoss: true,
    maxLeverage: 3,
    minHealthFactor: 1.3,
    maxBorrowUtilization: 0.7,
    allowShorts: true,
  },
  aggressive: {
    maxSingleTradePercent: 50,
    maxSlippagePercent: 2,
    minPoolTvlUsd: 25_000,
    maxPriceImpactPercent: 5,
    requireStopLoss: false,
    maxLeverage: 5,
    minHealthFactor: 1.1,
    maxBorrowUtilization: 0.9,
    allowShorts: true,
  },
};

// ── Default Risk Parameters ──────────────────────────────
export const DEFAULT_RISK_PARAMS = RISK_PRESETS.moderate;
