import { describe, it, expect } from "vitest";
import { Actions } from "../actions.js";
import { ActionType } from "../types.js";
import type { Hex } from "../actions.js";

// ============================================================================
// Helpers
// ============================================================================

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================================
// Actions.call() Tests
// ============================================================================

describe("Actions.call()", () => {
  it("should set action type to CALL (2)", () => {
    const action = Actions.call(
      "0x1111111111111111111111111111111111111111",
      0n,
      "0x"
    );
    expect(action.actionType).toBe(ActionType.CALL);
  });

  it("should encode target as left-padded 32 bytes", () => {
    const addr = "0x1111111111111111111111111111111111111111" as Hex;
    const action = Actions.call(addr, 0n, "0x");

    expect(action.target.length).toBe(32);

    // First 12 bytes should be zero
    for (let i = 0; i < 12; i++) {
      expect(action.target[i]).toBe(0x00);
    }

    // Last 20 bytes should be the address
    for (let i = 12; i < 32; i++) {
      expect(action.target[i]).toBe(0x11);
    }
  });

  it("should ABI-encode payload with value and calldata", () => {
    const action = Actions.call(
      "0x1111111111111111111111111111111111111111",
      1000n,
      "0xabcdef12"
    );

    // Total: 32 (value) + 32 (offset) + 32 (length) + 32 (data padded) = 128
    expect(action.payload.length).toBe(128);

    // Verify value encoding (big-endian u256) - 1000 = 0x3E8
    expect(action.payload[30]).toBe(0x03);
    expect(action.payload[31]).toBe(0xe8);
    // Leading zeros
    for (let i = 0; i < 30; i++) {
      expect(action.payload[i]).toBe(0x00);
    }

    // Verify offset = 64 (0x40) at bytes 32-63
    expect(action.payload[63]).toBe(64);

    // Verify length = 4 at bytes 64-95
    expect(action.payload[95]).toBe(4);

    // Verify calldata at bytes 96-99
    expect(action.payload[96]).toBe(0xab);
    expect(action.payload[97]).toBe(0xcd);
    expect(action.payload[98]).toBe(0xef);
    expect(action.payload[99]).toBe(0x12);

    // Padding should be zero
    for (let i = 100; i < 128; i++) {
      expect(action.payload[i]).toBe(0x00);
    }
  });

  it("should produce 96-byte payload for empty calldata", () => {
    const action = Actions.call(
      "0x1111111111111111111111111111111111111111",
      0n,
      "0x"
    );

    // Empty calldata: 32 (value) + 32 (offset) + 32 (length) + 0 (no data) = 96
    expect(action.payload.length).toBe(96);
    // length should be 0
    expect(action.payload[95]).toBe(0);
  });
});

// ============================================================================
// Actions.transferERC20() Tests
// ============================================================================

describe("Actions.transferERC20()", () => {
  it("should set action type to TRANSFER_ERC20 (3)", () => {
    const action = Actions.transferERC20(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      1_000_000n
    );
    expect(action.actionType).toBe(ActionType.TRANSFER_ERC20);
  });

  it("should produce exactly 96-byte payload", () => {
    const action = Actions.transferERC20(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      1_000_000n
    );
    expect(action.payload.length).toBe(96);
  });

  it("should set target to zero (unused for ERC20 transfers)", () => {
    const action = Actions.transferERC20(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      100n
    );

    for (let i = 0; i < 32; i++) {
      expect(action.target[i]).toBe(0x00);
    }
  });

  it("should encode token address left-padded in payload bytes 0-31", () => {
    const action = Actions.transferERC20(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      100n
    );

    // First 12 bytes zero (left padding)
    for (let i = 0; i < 12; i++) {
      expect(action.payload[i]).toBe(0x00);
    }
    // Next 20 bytes are the token address
    for (let i = 12; i < 32; i++) {
      expect(action.payload[i]).toBe(0x11);
    }
  });

  it("should encode recipient address left-padded in payload bytes 32-63", () => {
    const action = Actions.transferERC20(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      100n
    );

    // Padding zeros
    for (let i = 32; i < 44; i++) {
      expect(action.payload[i]).toBe(0x00);
    }
    // Recipient address
    for (let i = 44; i < 64; i++) {
      expect(action.payload[i]).toBe(0x22);
    }
  });

  it("should encode amount as big-endian u256 in payload bytes 64-95", () => {
    const action = Actions.transferERC20(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      1_000_000n // 0xF4240
    );

    // 1_000_000 = 0x0F4240
    expect(action.payload[93]).toBe(0x0f);
    expect(action.payload[94]).toBe(0x42);
    expect(action.payload[95]).toBe(0x40);

    // Leading zeros
    for (let i = 64; i < 93; i++) {
      expect(action.payload[i]).toBe(0x00);
    }
  });
});

// ============================================================================
// Actions.noOp() Tests
// ============================================================================

describe("Actions.noOp()", () => {
  it("should set action type to NO_OP (4)", () => {
    const action = Actions.noOp();
    expect(action.actionType).toBe(ActionType.NO_OP);
  });

  it("should produce empty payload", () => {
    const action = Actions.noOp();
    expect(action.payload.length).toBe(0);
  });

  it("should set target to all zeros", () => {
    const action = Actions.noOp();
    expect(action.target.length).toBe(32);
    for (let i = 0; i < 32; i++) {
      expect(action.target[i]).toBe(0x00);
    }
  });
});
