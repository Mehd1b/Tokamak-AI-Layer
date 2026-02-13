import type { Hash, Hex, PublicClient } from "viem";
import type { UnsignedSwap, ExecutionResult } from "@tal-trading-agent/shared";
export interface SimulationResult {
    success: boolean;
    error?: string;
}
/**
 * Executes and monitors swap transactions. The server never holds private keys.
 *
 * Flow:
 * 1. SwapBuilder creates unsigned calldata (UnsignedSwap)
 * 2. Client signs the transaction with their wallet
 * 3. Client sends the signed (serialized) transaction back
 * 4. TradeExecutor broadcasts the signed tx and monitors for confirmation
 */
export declare class TradeExecutor {
    private readonly publicClient;
    constructor(config: {
        publicClient: PublicClient;
    });
    /**
     * Estimate gas for a swap. Returns the estimated gas units required.
     * The caller should multiply by current gas price for cost estimation.
     */
    estimateGas(swap: UnsignedSwap): Promise<bigint>;
    /**
     * Simulate a swap to check if it would succeed, without broadcasting.
     * Uses eth_call under the hood.
     */
    simulateSwap(swap: UnsignedSwap): Promise<SimulationResult>;
    /**
     * Broadcast a pre-signed serialized transaction to the network.
     * The server never constructs or signs transactions; only the client wallet does.
     */
    broadcastSignedTx(serializedTx: Hex): Promise<{
        txHash: Hash;
    }>;
    /**
     * Wait for a transaction to be mined and return a structured result.
     * Parses swap events from the receipt to extract amountIn/amountOut.
     */
    waitForReceipt(txHash: Hash, strategyId?: string): Promise<ExecutionResult>;
    /**
     * Parse Swap event logs from the receipt to extract trade amounts.
     * The Uniswap V3 Pool emits `Swap(sender, recipient, amount0, amount1, ...)`.
     * amount0 and amount1 are signed: negative means the pool sent tokens out.
     */
    private parseSwapAmounts;
    /** Convert a uint256 to signed int256 (two's complement) */
    private toSigned256;
}
//# sourceMappingURL=TradeExecutor.d.ts.map