import type { DefiLlamaPool, PoolData, DataSnapshot } from "../types.js";

// ============================================================
// DeFi Llama Mock API Responses
// ============================================================

export const MOCK_DEFILLAMA_POOLS: DefiLlamaPool[] = [
  // Aave V3 pools
  {
    pool: "aave-v3-eth-usdc",
    chain: "Ethereum",
    project: "aave-v3",
    symbol: "USDC",
    tvlUsd: 2_500_000_000,
    apy: 3.45,
    apyBase: 2.1,
    apyReward: 1.35,
    il7d: null,
    volumeUsd1d: 150_000_000,
    exposure: "single",
    underlyingTokens: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
  },
  {
    pool: "aave-v3-eth-weth",
    chain: "Ethereum",
    project: "aave-v3",
    symbol: "WETH",
    tvlUsd: 4_200_000_000,
    apy: 1.82,
    apyBase: 1.82,
    apyReward: 0,
    il7d: null,
    volumeUsd1d: 200_000_000,
    exposure: "single",
    underlyingTokens: ["0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"],
  },
  {
    pool: "aave-v3-arb-usdc",
    chain: "Arbitrum",
    project: "aave-v3",
    symbol: "USDC",
    tvlUsd: 800_000_000,
    apy: 4.21,
    apyBase: 2.5,
    apyReward: 1.71,
    il7d: null,
    volumeUsd1d: 45_000_000,
    exposure: "single",
    underlyingTokens: null,
  },
  {
    pool: "aave-v3-op-usdc",
    chain: "Optimism",
    project: "aave-v3",
    symbol: "USDC",
    tvlUsd: 350_000_000,
    apy: 3.89,
    apyBase: 2.0,
    apyReward: 1.89,
    il7d: null,
    volumeUsd1d: 20_000_000,
  },

  // Compound V3
  {
    pool: "compound-v3-eth-usdc",
    chain: "Ethereum",
    project: "compound-v3",
    symbol: "USDC",
    tvlUsd: 1_800_000_000,
    apy: 3.12,
    apyBase: 2.5,
    apyReward: 0.62,
    il7d: null,
    volumeUsd1d: 90_000_000,
  },

  // Uniswap V3
  {
    pool: "uniswap-v3-eth-usdc-weth",
    chain: "Ethereum",
    project: "uniswap-v3",
    symbol: "USDC-WETH",
    tvlUsd: 500_000_000,
    apy: 12.5,
    apyBase: 12.5,
    apyReward: null,
    il7d: -2.3,
    volumeUsd1d: 800_000_000,
  },
  {
    pool: "uniswap-v3-arb-usdc-weth",
    chain: "Arbitrum",
    project: "uniswap-v3",
    symbol: "USDC-WETH",
    tvlUsd: 120_000_000,
    apy: 15.8,
    apyBase: 15.8,
    apyReward: null,
    il7d: -3.1,
    volumeUsd1d: 200_000_000,
  },

  // Curve
  {
    pool: "curve-3pool",
    chain: "Ethereum",
    project: "curve-dex",
    symbol: "DAI-USDC-USDT",
    tvlUsd: 900_000_000,
    apy: 2.1,
    apyBase: 0.8,
    apyReward: 1.3,
    il7d: -0.01,
    volumeUsd1d: 50_000_000,
  },

  // Lido
  {
    pool: "lido-steth",
    chain: "Ethereum",
    project: "lido",
    symbol: "stETH",
    tvlUsd: 14_000_000_000,
    apy: 3.2,
    apyBase: 3.2,
    apyReward: null,
    il7d: null,
    volumeUsd1d: null,
  },

  // Tokamak
  {
    pool: "tokamak-ton-staking",
    chain: "Tokamak L2",
    project: "tokamak-network",
    symbol: "TON",
    tvlUsd: 50_000_000,
    apy: 5.5,
    apyBase: 5.5,
    apyReward: null,
    il7d: null,
    volumeUsd1d: null,
  },

  // Pool on unsupported chain (should be filtered out)
  {
    pool: "aave-v3-polygon-usdc",
    chain: "Polygon",
    project: "aave-v3",
    symbol: "USDC",
    tvlUsd: 300_000_000,
    apy: 4.5,
    apyBase: 3.0,
    apyReward: 1.5,
    il7d: null,
    volumeUsd1d: 15_000_000,
  },
];

export const MOCK_DEFILLAMA_YIELDS_RESPONSE = {
  status: "success",
  data: MOCK_DEFILLAMA_POOLS,
};

// Generate chart data with recent timestamps so the 30-day filter includes them
function recentTimestamp(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

export const MOCK_DEFILLAMA_CHART_RESPONSE = {
  status: "success",
  data: [
    { timestamp: recentTimestamp(21), tvlUsd: 2_400_000_000, apy: 3.2, apyBase: 2.0, apyReward: 1.2, il7d: null },
    { timestamp: recentTimestamp(14), tvlUsd: 2_450_000_000, apy: 3.3, apyBase: 2.1, apyReward: 1.2, il7d: null },
    { timestamp: recentTimestamp(7), tvlUsd: 2_480_000_000, apy: 3.4, apyBase: 2.2, apyReward: 1.2, il7d: null },
    { timestamp: recentTimestamp(1), tvlUsd: 2_500_000_000, apy: 3.45, apyBase: 2.1, apyReward: 1.35, il7d: null },
  ],
};

// ============================================================
// Mock Price Feed
// ============================================================

export const MOCK_PRICE_FEED: Record<string, number> = {
  ETH: 3200,
  WETH: 3200,
  USDC: 1.0,
  USDT: 1.0,
  DAI: 1.0,
  stETH: 3180,
  TON: 2.5,
  WBTC: 62000,
};

// ============================================================
// Expected Transformed Pools (subset for assertions)
// ============================================================

export const EXPECTED_AAVE_POOL: PoolData = {
  protocol: "Aave V3",
  protocolType: "lending",
  chain: 1,
  poolId: "aave-v3-eth-usdc",
  tokens: [{ symbol: "USDC", address: "0x0000000000000000000000000000000000000000", decimals: 18, priceUSD: 0 }],
  currentAPY: 3.45,
  tvl: 2_500_000_000,
  volume24h: 150_000_000,
  ilRisk: 0,
  protocolRiskScore: 15,
  auditStatus: {
    audited: true,
    auditors: ["OpenZeppelin", "Trail of Bits", "SigmaPrime", "ABDK"],
    auditCount: 12,
    bugBountyActive: true,
    bugBountySize: 10_000_000,
  },
  contractAge: 900,
};
