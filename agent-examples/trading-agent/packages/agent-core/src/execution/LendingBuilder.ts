import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import pino from "pino";
import { AAVE_V3 } from "@tal-trading-agent/shared";
import type { LendingTransaction, LeverageConfig } from "@tal-trading-agent/shared";
import { aaveV3PoolAbi, erc20ApproveAbi } from "../lending/AaveV3Abi.js";
import { SwapBuilder } from "./SwapBuilder.js";

const logger = pino({ name: "LendingBuilder" });

export class LendingBuilder {
  private readonly swapBuilder: SwapBuilder;
  private readonly poolAddress: Address;

  constructor(config?: { swapBuilder?: SwapBuilder; poolAddress?: Address }) {
    this.swapBuilder = config?.swapBuilder ?? new SwapBuilder();
    this.poolAddress = config?.poolAddress ?? AAVE_V3.pool;
  }

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
  }): LendingTransaction[] {
    const {
      collateralToken,
      targetToken,
      stablecoin,
      collateralAmount,
      leverageMultiplier,
      recipient,
      poolFee,
    } = config;

    const txs: LendingTransaction[] = [];

    // Step 1: Approve collateral token for Aave Pool
    const approveData = encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [this.poolAddress, collateralAmount],
    });

    txs.push({
      type: "approve",
      to: collateralToken,
      data: approveData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Approve ${collateralAmount.toString()} collateral for Aave Pool`,
      token: collateralToken,
      amount: collateralAmount,
    });

    // Step 2: Supply collateral to Aave
    const supplyData = encodeFunctionData({
      abi: aaveV3PoolAbi,
      functionName: "supply",
      args: [collateralToken, collateralAmount, recipient, 0],
    });

    txs.push({
      type: "supply",
      to: this.poolAddress,
      data: supplyData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Supply ${collateralAmount.toString()} collateral to Aave V3`,
      token: collateralToken,
      amount: collateralAmount,
    });

    // Step 3: Borrow stablecoin (variable rate = 2)
    const borrowAmount = collateralAmount * BigInt(Math.round((leverageMultiplier - 1) * 100)) / 100n;

    const borrowData = encodeFunctionData({
      abi: aaveV3PoolAbi,
      functionName: "borrow",
      args: [stablecoin, borrowAmount, 2n, 0, recipient],
    });

    txs.push({
      type: "borrow",
      to: this.poolAddress,
      data: borrowData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Borrow ${borrowAmount.toString()} stablecoin at ${leverageMultiplier}x leverage`,
      token: stablecoin,
      amount: borrowAmount,
    });

    // Step 4: Swap borrowed stablecoin -> target token
    const swap = this.swapBuilder.buildExactInputSingle({
      tokenIn: stablecoin,
      tokenOut: targetToken,
      fee: poolFee,
      recipient,
      amountIn: borrowAmount,
      slippageBps: 100, // 1% default slippage
    });

    txs.push({
      type: "swap",
      to: swap.to,
      data: swap.data,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Swap ${borrowAmount.toString()} stablecoin -> ${targetToken}`,
      token: stablecoin,
      amount: borrowAmount,
    });

    logger.info(
      {
        collateralToken,
        targetToken,
        collateralAmount: collateralAmount.toString(),
        borrowAmount: borrowAmount.toString(),
        leverageMultiplier,
        steps: txs.length,
      },
      "Built leveraged long transactions",
    );

    return txs;
  }

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
  }): LendingTransaction[] {
    const {
      targetToken,
      stablecoin,
      collateralAmount,
      borrowAmount,
      recipient,
      poolFee,
    } = config;

    const txs: LendingTransaction[] = [];

    // Step 1: Approve stablecoin for Aave Pool
    const approveData = encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [this.poolAddress, collateralAmount],
    });

    txs.push({
      type: "approve",
      to: stablecoin,
      data: approveData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Approve ${collateralAmount.toString()} stablecoin for Aave Pool`,
      token: stablecoin,
      amount: collateralAmount,
    });

    // Step 2: Supply stablecoin as collateral
    const supplyData = encodeFunctionData({
      abi: aaveV3PoolAbi,
      functionName: "supply",
      args: [stablecoin, collateralAmount, recipient, 0],
    });

    txs.push({
      type: "supply",
      to: this.poolAddress,
      data: supplyData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Supply ${collateralAmount.toString()} stablecoin as collateral`,
      token: stablecoin,
      amount: collateralAmount,
    });

    // Step 3: Borrow target token (variable rate = 2)
    const borrowData = encodeFunctionData({
      abi: aaveV3PoolAbi,
      functionName: "borrow",
      args: [targetToken, borrowAmount, 2n, 0, recipient],
    });

    txs.push({
      type: "borrow",
      to: this.poolAddress,
      data: borrowData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Borrow ${borrowAmount.toString()} of target token to short`,
      token: targetToken,
      amount: borrowAmount,
    });

    // Step 4: Swap borrowed target token -> stablecoin
    const swap = this.swapBuilder.buildExactInputSingle({
      tokenIn: targetToken,
      tokenOut: stablecoin,
      fee: poolFee,
      recipient,
      amountIn: borrowAmount,
      slippageBps: 100, // 1% default slippage
    });

    txs.push({
      type: "swap",
      to: swap.to,
      data: swap.data,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Swap ${borrowAmount.toString()} target token -> stablecoin`,
      token: targetToken,
      amount: borrowAmount,
    });

    logger.info(
      {
        targetToken,
        stablecoin,
        collateralAmount: collateralAmount.toString(),
        borrowAmount: borrowAmount.toString(),
        steps: txs.length,
      },
      "Built spot short transactions",
    );

    return txs;
  }

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
  }): LendingTransaction[] {
    const {
      direction,
      collateralToken,
      debtToken,
      repayAmount,
      withdrawAmount,
      recipient,
      poolFee,
    } = config;

    const txs: LendingTransaction[] = [];

    if (direction === "long") {
      // Closing long: swap target token back to stablecoin (debtToken)
      // The user holds the target token (collateral is the original collateral,
      // debt is in stablecoin). Swap the acquired target back to stablecoin to repay.
      const swap = this.swapBuilder.buildExactInputSingle({
        tokenIn: collateralToken, // target token held
        tokenOut: debtToken,      // stablecoin to repay
        fee: poolFee,
        recipient,
        amountIn: repayAmount,
        slippageBps: 100,
      });

      txs.push({
        type: "swap",
        to: swap.to,
        data: swap.data,
        value: 0n,
        gasEstimate: 200_000n,
        description: `Swap to obtain ${debtToken} for debt repayment`,
        token: collateralToken,
        amount: repayAmount,
      });
    } else {
      // Closing short: swap stablecoin back to target token (debtToken)
      const swap = this.swapBuilder.buildExactInputSingle({
        tokenIn: collateralToken, // stablecoin held
        tokenOut: debtToken,      // target token to repay
        fee: poolFee,
        recipient,
        amountIn: repayAmount,
        slippageBps: 100,
      });

      txs.push({
        type: "swap",
        to: swap.to,
        data: swap.data,
        value: 0n,
        gasEstimate: 200_000n,
        description: `Swap to obtain ${debtToken} for debt repayment`,
        token: collateralToken,
        amount: repayAmount,
      });
    }

    // Approve debt token for repayment
    const approveData = encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [this.poolAddress, repayAmount],
    });

    txs.push({
      type: "approve",
      to: debtToken,
      data: approveData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Approve ${repayAmount.toString()} debt token for repayment`,
      token: debtToken,
      amount: repayAmount,
    });

    // Repay debt
    const repayData = encodeFunctionData({
      abi: aaveV3PoolAbi,
      functionName: "repay",
      args: [debtToken, repayAmount, 2n, recipient],
    });

    txs.push({
      type: "repay",
      to: this.poolAddress,
      data: repayData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Repay ${repayAmount.toString()} debt to Aave V3`,
      token: debtToken,
      amount: repayAmount,
    });

    // Withdraw collateral
    const withdrawData = encodeFunctionData({
      abi: aaveV3PoolAbi,
      functionName: "withdraw",
      args: [collateralToken, withdrawAmount, recipient],
    });

    txs.push({
      type: "withdraw",
      to: this.poolAddress,
      data: withdrawData,
      value: 0n,
      gasEstimate: 200_000n,
      description: `Withdraw ${withdrawAmount.toString()} collateral from Aave V3`,
      token: collateralToken,
      amount: withdrawAmount,
    });

    logger.info(
      {
        direction,
        collateralToken,
        debtToken,
        repayAmount: repayAmount.toString(),
        withdrawAmount: withdrawAmount.toString(),
        steps: txs.length,
      },
      "Built close position transactions",
    );

    return txs;
  }
}
