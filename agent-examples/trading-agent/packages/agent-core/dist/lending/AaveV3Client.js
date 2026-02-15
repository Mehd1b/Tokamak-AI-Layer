import pino from "pino";
import { AAVE_V3 } from "@tal-trading-agent/shared";
import { aaveV3PoolAbi, aaveV3PoolDataProviderAbi, aaveV3OracleAbi, } from "./AaveV3Abi.js";
const logger = pino({ name: "AaveV3Client" });
export class AaveV3Client {
    client;
    poolAddress;
    dataProviderAddress;
    oracleAddress;
    constructor(client) {
        this.client = client;
        this.poolAddress = AAVE_V3.pool;
        this.dataProviderAddress = AAVE_V3.poolDataProvider;
        this.oracleAddress = AAVE_V3.oracle;
    }
    /**
     * Fetch reserve configuration and data for a token.
     */
    async getReserveData(token) {
        logger.info({ token }, "Fetching Aave V3 reserve data");
        const [configResult, dataResult] = await Promise.all([
            this.client.readContract({
                address: this.dataProviderAddress,
                abi: aaveV3PoolDataProviderAbi,
                functionName: "getReserveConfigurationData",
                args: [token],
            }),
            this.client.readContract({
                address: this.dataProviderAddress,
                abi: aaveV3PoolDataProviderAbi,
                functionName: "getReserveData",
                args: [token],
            }),
        ]);
        const [, // decimals
        ltv, liquidationThreshold, liquidationBonus, , // reserveFactor
        usageAsCollateralEnabled, borrowingEnabled, , // stableBorrowRateEnabled
        isActive, isFrozen,] = configResult;
        const [, // unbacked
        , // accruedToTreasuryScaled
        totalAToken, totalStableDebt, totalVariableDebt, , // liquidityRate
        variableBorrowRate, stableBorrowRate,] = dataResult;
        // Available liquidity = total aTokens - total debt
        const availableLiquidity = totalAToken - totalStableDebt - totalVariableDebt;
        return {
            ltv: Number(ltv),
            liquidationThreshold: Number(liquidationThreshold),
            liquidationBonus: Number(liquidationBonus),
            variableBorrowRate,
            stableBorrowRate,
            availableLiquidity: availableLiquidity > 0n ? availableLiquidity : 0n,
            totalVariableDebt,
            totalStableDebt,
            usageAsCollateralEnabled,
            borrowingEnabled,
            isActive,
            isFrozen,
        };
    }
    /**
     * Fetch a user's aggregate account data from Aave V3.
     */
    async getUserAccountData(user) {
        logger.info({ user }, "Fetching Aave V3 user account data");
        const result = await this.client.readContract({
            address: this.poolAddress,
            abi: aaveV3PoolAbi,
            functionName: "getUserAccountData",
            args: [user],
        });
        const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor,] = result;
        return {
            totalCollateralBase,
            totalDebtBase,
            availableBorrowsBase,
            currentLiquidationThreshold,
            ltv,
            healthFactor,
        };
    }
    /**
     * Check if a token can be used as collateral on Aave V3.
     */
    async canUseAsCollateral(token) {
        const data = await this.getReserveData(token);
        return data.usageAsCollateralEnabled && data.isActive && !data.isFrozen;
    }
    /**
     * Check if a token can be borrowed on Aave V3.
     */
    async canBorrow(token) {
        const data = await this.getReserveData(token);
        return data.borrowingEnabled && data.isActive && !data.isFrozen && data.availableLiquidity > 0n;
    }
    /**
     * Get the available liquidity for borrowing a token.
     */
    async getAvailableLiquidity(token) {
        const data = await this.getReserveData(token);
        return data.availableLiquidity;
    }
    /**
     * Get the oracle price for an asset (in base currency, typically USD with 8 decimals).
     */
    async getAssetPrice(token) {
        return await this.client.readContract({
            address: this.oracleAddress,
            abi: aaveV3OracleAbi,
            functionName: "getAssetPrice",
            args: [token],
        });
    }
    /**
     * Pure calculation: compute the liquidation price given position parameters.
     * liquidationPrice = (debtUsd * 10000) / (collateralAmount * liquidationThreshold)
     * Returns price in base currency units (8 decimals).
     */
    computeLiquidationPrice(collateralAmountBase, debtAmountBase, liquidationThreshold) {
        if (collateralAmountBase === 0n)
            return 0n;
        // threshold is in basis points (e.g. 8250 = 82.5%)
        // liqPrice = debt * 10000 / (collateral * threshold / 10000)
        // Simplified: liqPrice = debt * 10000 * 10000 / (collateral * threshold)
        return (debtAmountBase * 10000n * 10000n) / (collateralAmountBase * BigInt(liquidationThreshold));
    }
    /**
     * Pure calculation: compute health factor.
     * healthFactor = (collateralUsd * liquidationThreshold / 10000) / debtUsd
     * Returns as a float (1.0 = liquidation boundary).
     */
    computeHealthFactor(collateralUsd, debtUsd, liquidationThreshold) {
        if (debtUsd === 0n)
            return Infinity;
        const thresholdedCollateral = (collateralUsd * BigInt(liquidationThreshold)) / 10000n;
        return Number(thresholdedCollateral * 10000n / debtUsd) / 10000;
    }
}
//# sourceMappingURL=AaveV3Client.js.map