import type { Address } from "viem";
import type { LendingTransaction } from "@tal-trading-agent/shared";
import { SwapBuilder } from "./SwapBuilder.js";
export declare class LendingBuilder {
    private readonly swapBuilder;
    private readonly poolAddress;
    constructor(config?: {
        swapBuilder?: SwapBuilder;
        poolAddress?: Address;
    });
    /**
     * Build transaction sequence for a leveraged long position.
     *
     * Flow: supply collateral -> borrow stablecoin -> swap stablecoin for target token.
     */
    buildLeveragedLong(config: {
        collateralToken: Address;
        targetToken: Address;
        stablecoin: Address;
        collateralAmount: bigint;
        leverageMultiplier: number;
        recipient: Address;
        poolFee: number;
    }): LendingTransaction[];
    /**
     * Build transaction sequence for a spot short position.
     *
     * Flow: supply stablecoin as collateral -> borrow target token -> swap target for stablecoin.
     */
    buildSpotShort(config: {
        targetToken: Address;
        stablecoin: Address;
        collateralAmount: bigint;
        borrowAmount: bigint;
        recipient: Address;
        poolFee: number;
    }): LendingTransaction[];
    /**
     * Build transaction sequence to close a leveraged or short position.
     *
     * Long close: swap target -> stablecoin, repay debt, withdraw collateral.
     * Short close: swap stablecoin -> target, repay debt, withdraw collateral.
     */
    buildClosePosition(config: {
        direction: "long" | "short";
        collateralToken: Address;
        debtToken: Address;
        repayAmount: bigint;
        withdrawAmount: bigint;
        recipient: Address;
        poolFee: number;
    }): LendingTransaction[];
}
//# sourceMappingURL=LendingBuilder.d.ts.map