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
// ── Common Tokens (Ethereum Mainnet) ─────────────────────
export const TOKENS = {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    MKR: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    SNX: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
};
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
// ── Default Risk Parameters ──────────────────────────────
export const DEFAULT_RISK_PARAMS = {
    maxSingleTradePercent: 50,
    maxSlippagePercent: 1,
    minPoolTvlUsd: 100_000,
    maxPriceImpactPercent: 2,
    requireStopLoss: true,
};
//# sourceMappingURL=constants.js.map