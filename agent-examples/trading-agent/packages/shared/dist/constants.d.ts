import type { Address } from "viem";
import type { RiskParams, TradeRequest } from "./types.js";
export declare const TAL_CONTRACTS: {
    readonly identityRegistry: Address;
    readonly reputationRegistry: Address;
    readonly validationRegistry: Address;
    readonly stakingIntegrationModule: Address;
    readonly taskFeeEscrow: Address;
};
export declare const UNISWAP_V3: {
    readonly factory: Address;
    readonly swapRouter: Address;
    readonly quoterV2: Address;
    readonly nftPositionManager: Address;
};
export declare const UNISWAP_V2: {
    readonly factory: Address;
    readonly router: Address;
};
export declare const TOKENS: {
    readonly WETH: Address;
    readonly USDC: Address;
    readonly USDT: Address;
    readonly DAI: Address;
    readonly WBTC: Address;
    readonly UNI: Address;
    readonly LINK: Address;
    readonly AAVE: Address;
    readonly MKR: Address;
    readonly SNX: Address;
};
export declare const FEE_TIERS: readonly [100, 500, 3000, 10000];
export declare const DEFILLAMA: {
    readonly pricesUrl: "https://coins.llama.fi/prices/current";
    readonly chartUrl: "https://coins.llama.fi/chart";
};
export declare const CHAIN_IDS: {
    readonly ethereum: 1;
    readonly thanosSepolia: 111551119090;
};
export declare const HORIZON_MS: Record<TradeRequest["horizon"], number>;
export declare const HORIZON_TO_LLAMA_PERIOD: Record<TradeRequest["horizon"], string>;
export declare const MIN_DATA_POINTS: Record<TradeRequest["horizon"], number>;
export declare const RISK_PRESETS: Record<TradeRequest["riskTolerance"], RiskParams>;
export declare const DEFAULT_RISK_PARAMS: RiskParams;
//# sourceMappingURL=constants.d.ts.map