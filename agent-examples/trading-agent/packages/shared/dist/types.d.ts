import type { Address, Hash, Hex } from "viem";
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
    horizon: "1h" | "4h" | "1d" | "1w" | "1m";
    /** Risk tolerance level */
    riskTolerance: "conservative" | "moderate" | "aggressive";
    /** Chain ID for execution */
    chainId: number;
}
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
export interface QuantScore {
    tokenAddress: Address;
    symbol: string;
    indicators: {
        rsi: number;
        macd: {
            value: number;
            signal: number;
            histogram: number;
        };
        bollingerBands: {
            upper: number;
            middle: number;
            lower: number;
        };
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
}
export interface TradingStrategy {
    id: string;
    request: TradeRequest;
    analysis: {
        marketCondition: "bullish" | "bearish" | "sideways";
        confidence: number;
        reasoning: string;
        topCandidates: QuantScore[];
    };
    trades: TradeAction[];
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
export interface AppConfig {
    ethereumRpcUrl: string;
    thanosRpcUrl: string;
    chainId: number;
    agentId: bigint;
    agentPrivateKey: Hex;
    anthropicApiKey: string;
    openaiApiKey?: string;
    pinataApiKey?: string;
    pinataSecretKey?: string;
    port: number;
    host: string;
    nodeEnv: string;
    apiKeys: Set<string>;
    eip712Auth: boolean;
    siwaDomain: string;
    siwaSessionTtl: number;
    identityRegistryAddress: Address;
    reputationRegistryAddress: Address;
    validationRegistryAddress: Address;
    taskFeeEscrowAddress: Address;
}
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
//# sourceMappingURL=types.d.ts.map