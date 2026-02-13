import type { Address } from "viem";
import type { TradeAction, UnsignedSwap } from "@tal-trading-agent/shared";
export interface ExactInputSingleParams {
    tokenIn: Address;
    tokenOut: Address;
    fee: number;
    recipient: Address;
    amountIn: bigint;
    slippageBps: number;
}
export interface ExactInputParams {
    path: Address[];
    fees: number[];
    recipient: Address;
    amountIn: bigint;
    slippageBps: number;
}
export declare class SwapBuilder {
    private readonly routerAddress;
    constructor(config?: {
        routerAddress?: Address;
    });
    /**
     * Build calldata for a single-hop exact input swap via
     * SwapRouter.exactInputSingle.
     */
    buildExactInputSingle(params: ExactInputSingleParams): UnsignedSwap;
    /**
     * Build calldata for a multi-hop exact input swap via
     * SwapRouter.exactInput. The path is encoded as packed bytes:
     * tokenIn + fee0 + token1 + fee1 + ... + tokenOut
     */
    buildExactInput(params: ExactInputParams): UnsignedSwap;
    /**
     * Convert a TradeAction (produced by the strategy engine) into an
     * UnsignedSwap ready for signing.
     */
    buildFromTradeAction(action: TradeAction, recipient: Address): UnsignedSwap;
    /**
     * Encode the multi-hop path as packed bytes.
     * Format: address(20) + uint24(3) + address(20) + uint24(3) + ... + address(20)
     */
    private encodeMultihopPath;
    /**
     * Apply slippage to amountIn to compute amountOutMinimum.
     * This is a conservative floor: amountIn * (10000 - slippageBps) / 10000.
     * In practice the strategy engine provides minAmountOut from a quote;
     * this is a safety fallback.
     */
    private applySlippage;
    /**
     * Infer slippage bps from amountIn and minAmountOut.
     * If the strategy already computed a minAmountOut, we preserve it.
     */
    private inferSlippageBps;
    /** Deadline: current time + 20 minutes */
    private getDeadline;
    /** Check if the address is WETH (native ETH wrapper) */
    private isWETH;
}
//# sourceMappingURL=SwapBuilder.d.ts.map