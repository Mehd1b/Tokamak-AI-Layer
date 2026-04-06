/**
 * Example agent: Simple Yield Monitor
 *
 * Reads oracle price feed from inputs and, if a mock balance exceeds a
 * threshold, emits a CALL action to deposit into a yield vault.
 * Otherwise emits a no-op.
 *
 * This demonstrates the full `defineAgent` pattern.
 */

import {
  defineAgent,
  Actions,
  parseOracleFeed,
  getPrice,
  encodeAgentOutput,
} from "../src/index.js";
import type { AgentContext, AgentOutput } from "../src/index.js";

// ============================================================================
// Configuration
// ============================================================================

/** Mock balance in token units (1e8 fixed-point). */
const MOCK_BALANCE = 100_000n * 100_000_000n; // 100,000 tokens

/** Minimum balance threshold to trigger deposit. */
const DEPOSIT_THRESHOLD = 50_000n * 100_000_000n; // 50,000 tokens

/** Deposit amount when threshold is met. */
const DEPOSIT_AMOUNT = 10_000n * 100_000_000n; // 10,000 tokens

/** Asset ID for the token we monitor (e.g., ETH = 1). */
const MONITORED_ASSET_ID = 1;

/** Minimum acceptable price (in 1e8 fixed-point). */
const MIN_PRICE = 1_000n * 100_000_000n; // $1,000

/** Yield vault contract address. */
const YIELD_VAULT: `0x${string}` =
  "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD20";

/** ERC20 token address. */
const TOKEN_ADDRESS: `0x${string}` =
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

/** Recipient for ERC20 transfer. */
const VAULT_RECIPIENT: `0x${string}` =
  "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD20";

// ============================================================================
// Agent Definition
// ============================================================================

/**
 * The agent function receives context and opaque inputs (wire-encoded
 * oracle feed), then decides whether to deposit.
 */
const yieldAgent = defineAgent(
  (ctx: AgentContext, inputs: Uint8Array): AgentOutput => {
    // 1. Parse the oracle price feed from opaque inputs
    const feed = parseOracleFeed(inputs);

    if (!feed) {
      // Cannot parse feed -- emit no-op
      return { actions: [Actions.noOp()] };
    }

    // 2. Look up the price of our monitored asset
    const pricePoint = getPrice(feed, MONITORED_ASSET_ID);

    if (!pricePoint) {
      // Asset not in feed -- emit no-op
      return { actions: [Actions.noOp()] };
    }

    // 3. Check if the price is above our minimum threshold
    if (pricePoint.price < MIN_PRICE) {
      // Price too low -- emit no-op
      return { actions: [Actions.noOp()] };
    }

    // 4. Check if our mock balance exceeds the deposit threshold
    if (MOCK_BALANCE < DEPOSIT_THRESHOLD) {
      return { actions: [Actions.noOp()] };
    }

    // 5. Balance is sufficient and price is acceptable -- deposit!
    //    Emit a CALL action to the yield vault's deposit function.
    //
    //    For this example, we use a mock function selector for `deposit(uint256)`.
    //    Selector: 0xb6b55f25 = keccak256("deposit(uint256)").slice(0, 4)
    //
    //    The calldata is: selector + abi.encode(amount)

    // Build calldata: function selector + encoded amount
    const selector = "0xb6b55f25"; // deposit(uint256)

    // Encode amount as uint256 (32 bytes, big-endian)
    const amountHex = DEPOSIT_AMOUNT.toString(16).padStart(64, "0");
    const calldata = `0x${selector.slice(2)}${amountHex}` as `0x${string}`;

    const depositAction = Actions.call(YIELD_VAULT, 0n, calldata);

    return { actions: [depositAction] };
  }
);

// ============================================================================
// Example Usage
// ============================================================================

// In production, the kernel calls agent.run(ctx, inputs) with real data.
// Here we demonstrate with mock data.

const mockCtx: AgentContext = {
  protocolVersion: 1,
  kernelVersion: 1,
  agentId: new Uint8Array(32).fill(0x01),
  agentCodeHash: new Uint8Array(32).fill(0xaa),
  constraintSetHash: new Uint8Array(32).fill(0xbb),
  inputRoot: new Uint8Array(32).fill(0xcc),
  executionNonce: 1n,
};

// Build a mock oracle feed (in real usage, this comes from the kernel)
function buildMockOracleFeed(): Uint8Array {
  const priceCount = 1;
  const bodyLen = 30 + 16 * priceCount;
  const totalLen = bodyLen + 65; // + signature
  const buf = new Uint8Array(totalLen);
  const view = new DataView(buf.buffer);

  let offset = 0;

  // feed_version
  buf[offset] = 0x01;
  offset += 1;

  // signer (20 bytes)
  buf.fill(0xaa, offset, offset + 20);
  offset += 20;

  // timestamp (u64 LE)
  view.setBigUint64(offset, 1_700_000_000n, true);
  offset += 8;

  // price_count
  buf[offset] = priceCount;
  offset += 1;

  // Price: asset_id=1, price=50000*1e8, conf=100
  view.setUint32(offset, MONITORED_ASSET_ID, true);
  offset += 4;
  view.setBigUint64(offset, 50_000n * 100_000_000n, true);
  offset += 8;
  view.setUint32(offset, 100, true);
  offset += 4;

  // Signature (65 bytes of zeros -- mock)
  // Already zero-filled

  return buf;
}

const mockInputs = buildMockOracleFeed();
const output = yieldAgent.run(mockCtx, mockInputs);

console.log(`Agent produced ${output.actions.length} action(s)`);
for (const action of output.actions) {
  console.log(`  - Type: ${action.actionType}, Payload size: ${action.payload.length} bytes`);
}

// Encode to wire format
const encoded = encodeAgentOutput(output);
console.log(`Encoded output: ${encoded.length} bytes`);
