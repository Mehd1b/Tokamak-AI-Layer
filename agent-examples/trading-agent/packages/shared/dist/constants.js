// ── TAL Contracts (Thanos Sepolia) ───────────────────────
export const TAL_CONTRACTS = {
    identityRegistry: "0x3f89CD27fD877827E7665A9883b3c0180E22A525",
    reputationRegistry: "0x0052258E517835081c94c0B685409f2EfC4D502b",
    validationRegistry: "0x09447147C6E75a60A449f38532F06E19F5F632F3",
    stakingIntegrationModule: "0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30",
    taskFeeEscrow: "0x6D68Cd8fD89BF1746A1948783C92A00E591d1227",
};
// ── Uniswap V3 (Ethereum Mainnet) ───────────────────────
export const UNISWAP_V3 = {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    nftPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
};
// ── Uniswap V2 (Ethereum Mainnet) ───────────────────────
export const UNISWAP_V2 = {
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
};
// ── Token Registry (re-exported from tokens.ts) ──────────
export { TOKENS, WETH_ADDRESS, TOKEN_REGISTRY } from "./tokens.js";
// ── Fee Tiers ────────────────────────────────────────────
export const FEE_TIERS = [100, 500, 3000, 10000];
// ── DeFiLlama API ────────────────────────────────────────
export const DEFILLAMA = {
    pricesUrl: "https://coins.llama.fi/prices/current",
    chartUrl: "https://coins.llama.fi/chart",
};
// ── Chain IDs ────────────────────────────────────────────
export const CHAIN_IDS = {
    ethereum: 1,
    thanosSepolia: 111551119090,
};
// ── Horizon to milliseconds ─────────────────────────────
export const HORIZON_MS = {
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
// `span` = interval between data points in hours
export const HORIZON_TO_LLAMA_CHART = {
    "1h": { period: "1d", span: 1 }, // ~24 points
    "4h": { period: "1d", span: 1 }, // ~24 points
    "1d": { period: "7d", span: 4 }, // ~42 points
    "1w": { period: "7d", span: 4 }, // ~42 points
    "1m": { period: "30d", span: 12 }, // ~60 points
    "3m": { period: "90d", span: 24 }, // ~90 points
    "6m": { period: "180d", span: 48 }, // ~90 points
    "1y": { period: "365d", span: 72 }, // ~122 points
};
/** @deprecated Use HORIZON_TO_LLAMA_CHART instead */
export const HORIZON_TO_LLAMA_PERIOD = {
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
// Used both as the fetch target and the threshold for data quality.
// RSI needs 15, MACD needs 27, Bollinger needs 20, ADX needs 28, StochRSI needs 30.
export const MIN_DATA_POINTS = {
    "1h": 20,
    "4h": 25,
    "1d": 30,
    "1w": 30,
    "1m": 35,
    "3m": 50,
    "6m": 50,
    "1y": 60,
};
// ── Risk Presets per tolerance ───────────────────────────
export const RISK_PRESETS = {
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
//# sourceMappingURL=constants.js.map