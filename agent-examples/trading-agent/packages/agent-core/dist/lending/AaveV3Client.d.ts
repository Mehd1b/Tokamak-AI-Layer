import type { Address, PublicClient } from "viem";
import type { AaveReserveData } from "@tal-trading-agent/shared";
export interface UserAccountData {
    totalCollateralBase: bigint;
    totalDebtBase: bigint;
    availableBorrowsBase: bigint;
    currentLiquidationThreshold: bigint;
    ltv: bigint;
    healthFactor: bigint;
}
export declare class AaveV3Client {
    private readonly client;
    private readonly poolAddress;
    private readonly dataProviderAddress;
    private readonly oracleAddress;
    constructor(client: PublicClient);
    /**
     * Fetch reserve configuration and data for a token.
     */
    getReserveData(token: Address): Promise<AaveReserveData>;
    /**
     * Fetch a user's aggregate account data from Aave V3.
     */
    getUserAccountData(user: Address): Promise<UserAccountData>;
    /**
     * Check if a token can be used as collateral on Aave V3.
     */
    canUseAsCollateral(token: Address): Promise<boolean>;
    /**
     * Check if a token can be borrowed on Aave V3.
     */
    canBorrow(token: Address): Promise<boolean>;
    /**
     * Get the available liquidity for borrowing a token.
     */
    getAvailableLiquidity(token: Address): Promise<bigint>;
    /**
     * Get the oracle price for an asset (in base currency, typically USD with 8 decimals).
     */
    getAssetPrice(token: Address): Promise<bigint>;
    /**
     * Pure calculation: compute the liquidation price given position parameters.
     * liquidationPrice = (debtUsd * 10000) / (collateralAmount * liquidationThreshold)
     * Returns price in base currency units (8 decimals).
     */
    computeLiquidationPrice(collateralAmountBase: bigint, debtAmountBase: bigint, liquidationThreshold: number): bigint;
    /**
     * Pure calculation: compute health factor.
     * healthFactor = (collateralUsd * liquidationThreshold / 10000) / debtUsd
     * Returns as a float (1.0 = liquidation boundary).
     */
    computeHealthFactor(collateralUsd: bigint, debtUsd: bigint, liquidationThreshold: number): number;
}
//# sourceMappingURL=AaveV3Client.d.ts.map