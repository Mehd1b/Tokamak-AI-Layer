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

// ── Uniswap V2 (Ethereum Mainnet) ───────────────────────
export const UNISWAP_V2 = {
  factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address,
  router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address,
} as const;

// ── Common Tokens (Ethereum Mainnet) ─────────────────────
export const TOKENS = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address,
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
  UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address,
  LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA" as Address,
  AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" as Address,
  MKR: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" as Address,
  SNX: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F" as Address,
} as const;

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

// ── Horizon to DeFiLlama chart period ───────────────────
export const HORIZON_TO_LLAMA_PERIOD: Record<TradeRequest["horizon"], string> = {
  "1h": "1w",
  "4h": "1w",
  "1d": "1w",
  "1w": "2w",
  "1m": "3m",
  "3m": "6m",
  "6m": "1y",
  "1y": "1y",
};

// ── Minimum data points per horizon for reliable indicators ─
export const MIN_DATA_POINTS: Record<TradeRequest["horizon"], number> = {
  "1h": 5,
  "4h": 10,
  "1d": 15,
  "1w": 20,
  "1m": 30,
  "3m": 50,
  "6m": 80,
  "1y": 100,
};

// ── Risk Presets per tolerance ───────────────────────────
export const RISK_PRESETS: Record<TradeRequest["riskTolerance"], RiskParams> = {
  conservative: {
    maxSingleTradePercent: 20,
    maxSlippagePercent: 0.5,
    minPoolTvlUsd: 500_000,
    maxPriceImpactPercent: 1,
    requireStopLoss: true,
  },
  moderate: {
    maxSingleTradePercent: 35,
    maxSlippagePercent: 1,
    minPoolTvlUsd: 100_000,
    maxPriceImpactPercent: 2,
    requireStopLoss: true,
  },
  aggressive: {
    maxSingleTradePercent: 50,
    maxSlippagePercent: 2,
    minPoolTvlUsd: 25_000,
    maxPriceImpactPercent: 5,
    requireStopLoss: false,
  },
};

// ── Default Risk Parameters ──────────────────────────────
export const DEFAULT_RISK_PARAMS = RISK_PRESETS.moderate;
