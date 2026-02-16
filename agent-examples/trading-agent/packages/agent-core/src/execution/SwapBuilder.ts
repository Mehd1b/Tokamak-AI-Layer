import type { Address, Hex } from "viem";
import { encodeFunctionData, encodePacked } from "viem";
import pino from "pino";
import { UNISWAP_V3, WETH_ADDRESS } from "@tal-trading-agent/shared";
import type { TradeAction, UnsignedSwap } from "@tal-trading-agent/shared";

const logger = pino({ name: "swap-builder" });

// ── SwapRouter ABI (Uniswap V3) ──────────────────────────────

const swapRouterAbi = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "exactInput",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

// ── Constants ─────────────────────────────────────────────────

/** 20 minutes from now */
const DEFAULT_DEADLINE_SECONDS = 20 * 60;

/** Basis points denominator */
const BPS_DENOMINATOR = 10_000n;

// ── Types ─────────────────────────────────────────────────────

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

// ── SwapBuilder ───────────────────────────────────────────────

export class SwapBuilder {
  private readonly routerAddress: Address;

  constructor(config?: { routerAddress?: Address }) {
    this.routerAddress = config?.routerAddress ?? UNISWAP_V3.swapRouter;
  }

  /**
   * Build calldata for a single-hop exact input swap via
   * SwapRouter.exactInputSingle.
   */
  buildExactInputSingle(params: ExactInputSingleParams): UnsignedSwap {
    const {
      tokenIn,
      tokenOut,
      fee,
      recipient,
      amountIn,
      slippageBps,
    } = params;

    const amountOutMinimum = this.applySlippage(amountIn, slippageBps);
    const deadline = this.getDeadline();
    const isNativeEth = this.isWETH(tokenIn);

    const data = encodeFunctionData({
      abi: swapRouterAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee,
          recipient,
          deadline,
          amountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    logger.info(
      {
        tokenIn,
        tokenOut,
        fee,
        amountIn: amountIn.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        isNativeEth,
      },
      "Built exactInputSingle calldata",
    );

    return {
      to: this.routerAddress,
      data,
      value: isNativeEth ? amountIn : 0n,
      gasEstimate: 200_000n,
      description: `Swap ${amountIn.toString()} ${isNativeEth ? "ETH" : tokenIn} -> ${tokenOut} (fee: ${fee / 10_000}%)`,
    };
  }

  /**
   * Build calldata for a multi-hop exact input swap via
   * SwapRouter.exactInput. The path is encoded as packed bytes:
   * tokenIn + fee0 + token1 + fee1 + ... + tokenOut
   */
  buildExactInput(params: ExactInputParams): UnsignedSwap {
    const { path, fees, recipient, amountIn, slippageBps } = params;

    if (path.length < 2) {
      throw new Error("Multi-hop swap requires at least 2 tokens in path");
    }
    if (fees.length !== path.length - 1) {
      throw new Error(
        `Fee array length (${fees.length}) must equal path length - 1 (${path.length - 1})`,
      );
    }

    const encodedPath = this.encodeMultihopPath(path, fees);
    const amountOutMinimum = this.applySlippage(amountIn, slippageBps);
    const deadline = this.getDeadline();
    const isNativeEth = this.isWETH(path[0]!);

    const data = encodeFunctionData({
      abi: swapRouterAbi,
      functionName: "exactInput",
      args: [
        {
          path: encodedPath,
          recipient,
          deadline,
          amountIn,
          amountOutMinimum,
        },
      ],
    });

    logger.info(
      {
        hops: path.length - 1,
        amountIn: amountIn.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
      },
      "Built exactInput calldata",
    );

    return {
      to: this.routerAddress,
      data,
      value: isNativeEth ? amountIn : 0n,
      gasEstimate: BigInt(150_000 + (path.length - 1) * 100_000),
      description: `Multi-hop swap (${path.length - 1} hops): ${amountIn.toString()} via ${path.join(" -> ")}`,
    };
  }

  /**
   * Convert a TradeAction (produced by the strategy engine) into an
   * UnsignedSwap ready for signing.
   */
  buildFromTradeAction(action: TradeAction, recipient: Address): UnsignedSwap {
    // If the route has more than 2 tokens, use multi-hop
    if (action.route.length > 2) {
      // Derive fees: use the poolFee for all hops (the strategy engine
      // currently provides a single fee; multi-fee routes can be added later)
      const fees = Array.from(
        { length: action.route.length - 1 },
        () => action.poolFee,
      );

      return this.buildExactInput({
        path: action.route,
        fees,
        recipient,
        amountIn: action.amountIn,
        // Convert minAmountOut to slippage bps relative to amountIn
        slippageBps: this.inferSlippageBps(action.amountIn, action.minAmountOut),
      });
    }

    // Single-hop swap
    return this.buildExactInputSingle({
      tokenIn: action.tokenIn,
      tokenOut: action.tokenOut,
      fee: action.poolFee,
      recipient,
      amountIn: action.amountIn,
      slippageBps: this.inferSlippageBps(action.amountIn, action.minAmountOut),
    });
  }

  // ── Internal Helpers ──────────────────────────────────────────

  /**
   * Encode the multi-hop path as packed bytes.
   * Format: address(20) + uint24(3) + address(20) + uint24(3) + ... + address(20)
   */
  private encodeMultihopPath(path: Address[], fees: number[]): Hex {
    const types: ("address" | "uint24")[] = [];
    const values: (Address | number)[] = [];

    for (let i = 0; i < path.length; i++) {
      types.push("address");
      values.push(path[i]!);
      if (i < fees.length) {
        types.push("uint24");
        values.push(fees[i]!);
      }
    }

    return encodePacked(types, values);
  }

  /**
   * Apply slippage to amountIn to compute amountOutMinimum.
   * This is a conservative floor: amountIn * (10000 - slippageBps) / 10000.
   * In practice the strategy engine provides minAmountOut from a quote;
   * this is a safety fallback.
   */
  private applySlippage(amount: bigint, slippageBps: number): bigint {
    const bps = BigInt(Math.max(0, Math.min(slippageBps, 10_000)));
    return (amount * (BPS_DENOMINATOR - bps)) / BPS_DENOMINATOR;
  }

  /**
   * Infer slippage bps from amountIn and minAmountOut.
   * If the strategy already computed a minAmountOut, we preserve it.
   */
  private inferSlippageBps(amountIn: bigint, minAmountOut: bigint): number {
    if (amountIn === 0n) return 100; // default 1%
    // slippageBps = (1 - minAmountOut/amountIn) * 10000
    const slippage = Number(
      ((amountIn - minAmountOut) * BPS_DENOMINATOR) / amountIn,
    );
    return Math.max(0, Math.min(slippage, 10_000));
  }

  /** Deadline: current time + 20 minutes */
  private getDeadline(): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  }

  /** Check if the address is WETH (native ETH wrapper) */
  private isWETH(address: Address): boolean {
    return address.toLowerCase() === WETH_ADDRESS.toLowerCase();
  }
}
