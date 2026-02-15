import pino from "pino";
const logger = pino({ name: "PositionManager" });
export class PositionManager {
    positions = new Map();
    aaveClient;
    lendingBuilder;
    constructor(aaveClient, lendingBuilder) {
        this.aaveClient = aaveClient;
        this.lendingBuilder = lendingBuilder;
    }
    /**
     * Create and store a new leveraged position with a generated UUID.
     */
    createPosition(params) {
        const id = crypto.randomUUID();
        const position = {
            id,
            direction: params.direction,
            positionType: params.positionType,
            collateralToken: params.collateralToken,
            debtToken: params.debtToken,
            collateralAmount: params.collateralAmount,
            debtAmount: params.debtAmount,
            leverageMultiplier: params.leverageMultiplier,
            healthFactor: params.healthFactor,
            liquidationPrice: params.liquidationPrice,
            entryPrice: params.entryPrice,
            openedAt: Date.now(),
            status: "open",
        };
        this.positions.set(id, position);
        logger.info({
            id,
            direction: position.direction,
            positionType: position.positionType,
            collateralAmount: position.collateralAmount.toString(),
            debtAmount: position.debtAmount.toString(),
            leverageMultiplier: position.leverageMultiplier,
            healthFactor: position.healthFactor,
        }, "Created new leveraged position");
        return position;
    }
    /**
     * Get a position by ID.
     */
    getPosition(id) {
        return this.positions.get(id);
    }
    /**
     * Get all open positions.
     */
    getOpenPositions() {
        return Array.from(this.positions.values()).filter((p) => p.status === "open");
    }
    /**
     * Build the transaction sequence to close a position.
     */
    buildCloseTransactions(positionId, recipient) {
        const position = this.positions.get(positionId);
        if (!position) {
            throw new Error(`Position ${positionId} not found`);
        }
        if (position.status !== "open") {
            throw new Error(`Position ${positionId} is already ${position.status}`);
        }
        logger.info({ positionId, direction: position.direction }, "Building close transactions for position");
        return this.lendingBuilder.buildClosePosition({
            direction: position.direction,
            collateralToken: position.collateralToken,
            debtToken: position.debtToken,
            repayAmount: position.debtAmount,
            withdrawAmount: position.collateralAmount,
            recipient,
            poolFee: 3000, // default 0.3% pool fee
        });
    }
    /**
     * Check the health factor for a user's Aave position.
     * Returns the health factor as a number (healthFactor / 1e18).
     */
    async checkHealthFactor(user) {
        const accountData = await this.aaveClient.getUserAccountData(user);
        const healthFactor = Number(accountData.healthFactor) / 1e18;
        logger.info({
            user,
            healthFactor,
            totalCollateral: accountData.totalCollateralBase.toString(),
            totalDebt: accountData.totalDebtBase.toString(),
        }, "Checked health factor");
        return healthFactor;
    }
}
//# sourceMappingURL=PositionManager.js.map