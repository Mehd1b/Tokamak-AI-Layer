import type { Hash, Hex, PublicClient, TransactionReceipt } from "viem";
import pino from "pino";
import type { UnsignedSwap, ExecutionResult } from "@tal-trading-agent/shared";

const logger = pino({ name: "trade-executor" });

// ── Minimal ABI for Swap event parsing ──────────────────────────

const swapEventAbi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount0", type: "int256", indexed: false },
      { name: "amount1", type: "int256", indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "tick", type: "int24", indexed: false },
    ],
  },
] as const;

// ── Types ────────────────────────────────────────────────────────

export interface SimulationResult {
  success: boolean;
  error?: string;
}

// ── TradeExecutor ────────────────────────────────────────────────

/**
 * Executes and monitors swap transactions. The server never holds private keys.
 *
 * Flow:
 * 1. SwapBuilder creates unsigned calldata (UnsignedSwap)
 * 2. Client signs the transaction with their wallet
 * 3. Client sends the signed (serialized) transaction back
 * 4. TradeExecutor broadcasts the signed tx and monitors for confirmation
 */
export class TradeExecutor {
  private readonly publicClient: PublicClient;

  constructor(config: { publicClient: PublicClient }) {
    this.publicClient = config.publicClient;
  }

  /**
   * Estimate gas for a swap. Returns the estimated gas units required.
   * The caller should multiply by current gas price for cost estimation.
   */
  async estimateGas(swap: UnsignedSwap): Promise<bigint> {
    try {
      const estimate = await this.publicClient.estimateGas({
        to: swap.to,
        data: swap.data,
        value: swap.value,
      });

      logger.info(
        { to: swap.to, estimate: estimate.toString() },
        "Gas estimated",
      );

      return estimate;
    } catch (error) {
      logger.warn(
        { error, to: swap.to },
        "Gas estimation failed, using swap default",
      );
      // Fall back to the builder's estimate
      return swap.gasEstimate;
    }
  }

  /**
   * Simulate a swap to check if it would succeed, without broadcasting.
   * Uses eth_call under the hood.
   */
  async simulateSwap(swap: UnsignedSwap): Promise<SimulationResult> {
    try {
      await this.publicClient.call({
        to: swap.to,
        data: swap.data,
        value: swap.value,
      });

      logger.info({ to: swap.to }, "Swap simulation succeeded");
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown simulation error";

      logger.warn({ error, to: swap.to }, "Swap simulation failed");
      return { success: false, error: message };
    }
  }

  /**
   * Broadcast a pre-signed serialized transaction to the network.
   * The server never constructs or signs transactions; only the client wallet does.
   */
  async broadcastSignedTx(serializedTx: Hex): Promise<{ txHash: Hash }> {
    const txHash = await this.publicClient.request({
      method: "eth_sendRawTransaction",
      params: [serializedTx],
    });

    logger.info({ txHash }, "Transaction broadcast");
    return { txHash: txHash as Hash };
  }

  /**
   * Wait for a transaction to be mined and return a structured result.
   * Parses swap events from the receipt to extract amountIn/amountOut.
   */
  async waitForReceipt(
    txHash: Hash,
    strategyId: string = "unknown",
  ): Promise<ExecutionResult> {
    logger.info({ txHash }, "Waiting for transaction receipt");

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 120_000, // 2 minutes
    });

    const { amountIn, amountOut } = this.parseSwapAmounts(receipt);

    const result: ExecutionResult = {
      strategyId,
      txHash,
      status: receipt.status === "success" ? "confirmed" : "failed",
      amountIn,
      amountOut,
      gasUsed: receipt.gasUsed,
      executedAt: Math.floor(Date.now() / 1000),
    };

    logger.info(
      {
        txHash,
        status: result.status,
        gasUsed: result.gasUsed.toString(),
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
      },
      "Transaction receipt received",
    );

    return result;
  }

  // ── Internal Helpers ──────────────────────────────────────────

  /**
   * Parse Swap event logs from the receipt to extract trade amounts.
   * The Uniswap V3 Pool emits `Swap(sender, recipient, amount0, amount1, ...)`.
   * amount0 and amount1 are signed: negative means the pool sent tokens out.
   */
  private parseSwapAmounts(receipt: TransactionReceipt): {
    amountIn: bigint;
    amountOut: bigint;
  } {
    // Swap event topic0
    const SWAP_TOPIC =
      "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" as Hex;

    let amountIn = 0n;
    let amountOut = 0n;

    for (const log of receipt.logs) {
      if (log.topics[0] !== SWAP_TOPIC) continue;

      try {
        // Decode amount0 and amount1 from the log data
        // data layout: amount0 (int256, bytes 0-31), amount1 (int256, bytes 32-63),
        //              sqrtPriceX96 (uint160), liquidity (uint128), tick (int24)
        const data = log.data;
        if (data.length < 130) continue; // 0x + 64 hex chars * 2 = 130 min

        const amount0 = BigInt("0x" + data.slice(2, 66));
        const amount1 = BigInt("0x" + data.slice(66, 130));

        // Convert from two's complement for signed int256
        const signed0 = this.toSigned256(amount0);
        const signed1 = this.toSigned256(amount1);

        // Positive value = tokens sent TO the pool (input)
        // Negative value = tokens sent FROM the pool (output)
        if (signed0 > 0n) amountIn += signed0;
        else amountOut += -signed0;

        if (signed1 > 0n) amountIn += signed1;
        else amountOut += -signed1;
      } catch {
        // Skip malformed logs
        continue;
      }
    }

    return { amountIn, amountOut };
  }

  /** Convert a uint256 to signed int256 (two's complement) */
  private toSigned256(value: bigint): bigint {
    const MAX_INT256 = (1n << 255n) - 1n;
    if (value <= MAX_INT256) return value;
    return value - (1n << 256n);
  }
}
