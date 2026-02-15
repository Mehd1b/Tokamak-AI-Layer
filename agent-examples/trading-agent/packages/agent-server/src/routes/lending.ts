import type { FastifyInstance } from "fastify";
import { isAddress, type Address } from "viem";
import type { AppContext } from "../context.js";

export async function lendingRoutes(app: FastifyInstance, ctx: AppContext) {
  // ── GET /api/v1/lending/reserves/:token ───────────────
  app.get<{ Params: { token: string } }>(
    "/api/v1/lending/reserves/:token",
    async (req, reply) => {
      const { token } = req.params;

      if (!isAddress(token)) {
        return reply.code(400).send({ error: "Invalid token address" });
      }

      try {
        const data = await ctx.aaveV3Client.getReserveData(token as Address);

        return reply.send({
          token,
          ltv: data.ltv,
          liquidationThreshold: data.liquidationThreshold,
          liquidationBonus: data.liquidationBonus,
          variableBorrowRate: data.variableBorrowRate.toString(),
          stableBorrowRate: data.stableBorrowRate.toString(),
          availableLiquidity: data.availableLiquidity.toString(),
          totalVariableDebt: data.totalVariableDebt.toString(),
          totalStableDebt: data.totalStableDebt.toString(),
          usageAsCollateralEnabled: data.usageAsCollateralEnabled,
          borrowingEnabled: data.borrowingEnabled,
          isActive: data.isActive,
          isFrozen: data.isFrozen,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch reserve data";
        ctx.logger.error({ token, error }, "Reserve data fetch failed");
        return reply.code(500).send({ error: message });
      }
    },
  );

  // ── GET /api/v1/lending/account/:address ──────────────
  app.get<{ Params: { address: string } }>(
    "/api/v1/lending/account/:address",
    async (req, reply) => {
      const { address } = req.params;

      if (!isAddress(address)) {
        return reply.code(400).send({ error: "Invalid wallet address" });
      }

      try {
        const data = await ctx.aaveV3Client.getUserAccountData(address as Address);

        const healthFactor = data.healthFactor === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
          ? "max"
          : (Number(data.healthFactor) / 1e18).toFixed(4);

        return reply.send({
          address,
          totalCollateralBase: data.totalCollateralBase.toString(),
          totalDebtBase: data.totalDebtBase.toString(),
          availableBorrowsBase: data.availableBorrowsBase.toString(),
          currentLiquidationThreshold: data.currentLiquidationThreshold.toString(),
          ltv: data.ltv.toString(),
          healthFactor,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch account data";
        ctx.logger.error({ address, error }, "Account data fetch failed");
        return reply.code(500).send({ error: message });
      }
    },
  );

  // ── POST /api/v1/lending/simulate ─────────────────────
  app.post<{
    Body: {
      collateralToken: string;
      debtToken: string;
      collateralAmount: string;
      leverageMultiplier: number;
      direction: "long" | "short";
    };
  }>("/api/v1/lending/simulate", async (req, reply) => {
    const { collateralToken, debtToken, collateralAmount, leverageMultiplier, direction } = req.body;

    if (!collateralToken || !isAddress(collateralToken)) {
      return reply.code(400).send({ error: "Invalid collateral token address" });
    }
    if (!debtToken || !isAddress(debtToken)) {
      return reply.code(400).send({ error: "Invalid debt token address" });
    }
    if (!collateralAmount || leverageMultiplier == null) {
      return reply.code(400).send({ error: "Missing required fields: collateralAmount, leverageMultiplier" });
    }

    try {
      const [collateralReserve, debtReserve, collateralPrice, debtPrice] = await Promise.all([
        ctx.aaveV3Client.getReserveData(collateralToken as Address),
        ctx.aaveV3Client.getReserveData(debtToken as Address),
        ctx.aaveV3Client.getAssetPrice(collateralToken as Address),
        ctx.aaveV3Client.getAssetPrice(debtToken as Address),
      ]);

      const collateralAmountBig = BigInt(collateralAmount);
      const collateralValueUsd = collateralAmountBig * collateralPrice;
      const debtAmount = collateralAmountBig * BigInt(Math.round((leverageMultiplier - 1) * 100)) / 100n;
      const debtValueUsd = debtAmount * debtPrice;

      const healthFactor = ctx.aaveV3Client.computeHealthFactor(
        collateralValueUsd,
        debtValueUsd,
        collateralReserve.liquidationThreshold,
      );

      const liquidationPrice = ctx.aaveV3Client.computeLiquidationPrice(
        collateralValueUsd,
        debtValueUsd,
        collateralReserve.liquidationThreshold,
      );

      // Annual borrow rate as percentage
      const borrowRatePercent = Number(debtReserve.variableBorrowRate) / 1e25;

      return reply.send({
        simulation: {
          direction: direction ?? "long",
          collateralToken,
          debtToken,
          collateralAmount: collateralAmount,
          debtAmount: debtAmount.toString(),
          leverageMultiplier,
          healthFactor: healthFactor.toFixed(4),
          liquidationPrice: liquidationPrice.toString(),
          borrowAPY: borrowRatePercent.toFixed(2),
          collateralLtv: collateralReserve.ltv,
          liquidationThreshold: collateralReserve.liquidationThreshold,
          canBorrow: debtReserve.borrowingEnabled && debtReserve.availableLiquidity > debtAmount,
          canUseAsCollateral: collateralReserve.usageAsCollateralEnabled,
          warnings: [
            ...(healthFactor < 1.5 ? ["Low health factor — high liquidation risk"] : []),
            ...(debtReserve.availableLiquidity < debtAmount ? ["Insufficient borrow liquidity"] : []),
            ...(!collateralReserve.usageAsCollateralEnabled ? ["Collateral token not enabled for Aave collateral"] : []),
            ...(!debtReserve.borrowingEnabled ? ["Debt token borrowing is disabled on Aave"] : []),
          ],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Simulation failed";
      ctx.logger.error({ error }, "Lending simulation failed");
      return reply.code(500).send({ error: message });
    }
  });
}
