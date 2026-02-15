import type { Address } from "viem";
import type { LeveragedPosition, PositionDirection, PositionType, LendingTransaction } from "@tal-trading-agent/shared";
import { AaveV3Client } from "../lending/AaveV3Client.js";
import { LendingBuilder } from "./LendingBuilder.js";
export declare class PositionManager {
    private readonly positions;
    private readonly aaveClient;
    private readonly lendingBuilder;
    constructor(aaveClient: AaveV3Client, lendingBuilder: LendingBuilder);
    /**
     * Create and store a new leveraged position with a generated UUID.
     */
    createPosition(params: {
        direction: PositionDirection;
        positionType: PositionType;
        collateralToken: Address;
        debtToken: Address;
        collateralAmount: bigint;
        debtAmount: bigint;
        leverageMultiplier: number;
        healthFactor: number;
        liquidationPrice: bigint;
        entryPrice: bigint;
    }): LeveragedPosition;
    /**
     * Get a position by ID.
     */
    getPosition(id: string): LeveragedPosition | undefined;
    /**
     * Get all open positions.
     */
    getOpenPositions(): LeveragedPosition[];
    /**
     * Build the transaction sequence to close a position.
     */
    buildCloseTransactions(positionId: string, recipient: Address): LendingTransaction[];
    /**
     * Check the health factor for a user's Aave position.
     * Returns the health factor as a number (healthFactor / 1e18).
     */
    checkHealthFactor(user: Address): Promise<number>;
}
//# sourceMappingURL=PositionManager.d.ts.map