import { describe, it, expect } from "vitest";
import {
  encodeAgentOutput,
  decodeAgentOutput,
  encodeKernelInput,
  decodeKernelInput,
  encodeKernelJournal,
  decodeKernelJournal,
} from "../codec.js";
import type { ActionV1, AgentOutput, KernelInputV1, KernelJournalV1 } from "../types.js";
import {
  ActionType,
  ExecutionStatus,
  JOURNAL_SIZE,
  MAX_ACTIONS_PER_OUTPUT,
  PROTOCOL_VERSION,
  KERNEL_VERSION,
} from "../types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeAction(actionType: number, targetFill: number, payload: number[]): ActionV1 {
  const target = new Uint8Array(32).fill(targetFill);
  return { actionType, target, payload: new Uint8Array(payload) };
}

function makeKernelInput(opaqueInputs: Uint8Array = new Uint8Array(0)): KernelInputV1 {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kernelVersion: KERNEL_VERSION,
    agentId: new Uint8Array(32).fill(0x42),
    agentCodeHash: new Uint8Array(32).fill(0xaa),
    constraintSetHash: new Uint8Array(32).fill(0xbb),
    inputRoot: new Uint8Array(32).fill(0xcc),
    executionNonce: 12345n,
    opaqueAgentInputs: opaqueInputs,
  };
}

function makeJournal(): KernelJournalV1 {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kernelVersion: KERNEL_VERSION,
    agentId: new Uint8Array(32).fill(0x42),
    agentCodeHash: new Uint8Array(32).fill(0xaa),
    constraintSetHash: new Uint8Array(32).fill(0xbb),
    inputRoot: new Uint8Array(32).fill(0xcc),
    executionNonce: 99n,
    inputCommitment: new Uint8Array(32).fill(0xdd),
    actionCommitment: new Uint8Array(32).fill(0xee),
    executionStatus: ExecutionStatus.Success,
  };
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ============================================================================
// AgentOutput Codec Tests
// ============================================================================

describe("AgentOutput codec", () => {
  it("should encode and decode an empty actions array", () => {
    const output: AgentOutput = { actions: [] };
    const encoded = encodeAgentOutput(output);

    // 4 bytes for action_count = 0
    expect(encoded.length).toBe(4);

    const view = new DataView(encoded.buffer);
    expect(view.getUint32(0, true)).toBe(0);

    const decoded = decodeAgentOutput(encoded);
    expect(decoded.actions.length).toBe(0);
  });

  it("should round-trip a single action", () => {
    const action = makeAction(ActionType.CALL, 0x11, [0xab, 0xcd, 0xef]);
    const output: AgentOutput = { actions: [action] };

    const encoded = encodeAgentOutput(output);
    const decoded = decodeAgentOutput(encoded);

    expect(decoded.actions.length).toBe(1);
    expect(decoded.actions[0]!.actionType).toBe(ActionType.CALL);
    expect(arraysEqual(decoded.actions[0]!.target, action.target)).toBe(true);
    expect(arraysEqual(decoded.actions[0]!.payload, action.payload)).toBe(true);
  });

  it("should round-trip multiple actions", () => {
    const actions: ActionV1[] = [
      makeAction(ActionType.CALL, 0x11, [1, 2, 3]),
      makeAction(ActionType.TRANSFER_ERC20, 0x22, [4, 5, 6, 7, 8]),
      makeAction(ActionType.NO_OP, 0x00, []),
    ];
    const output: AgentOutput = { actions };

    const encoded = encodeAgentOutput(output);
    const decoded = decodeAgentOutput(encoded);

    expect(decoded.actions.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(decoded.actions[i]!.actionType).toBe(actions[i]!.actionType);
      expect(arraysEqual(decoded.actions[i]!.target, actions[i]!.target)).toBe(true);
      expect(arraysEqual(decoded.actions[i]!.payload, actions[i]!.payload)).toBe(true);
    }
  });

  it("should preserve action order", () => {
    // Deliberately put type=2 before type=1 -- order must be preserved
    const actions: ActionV1[] = [
      makeAction(0x02, 0x11, []),
      makeAction(0x01, 0x22, []),
    ];
    const output: AgentOutput = { actions };

    const encoded = encodeAgentOutput(output);
    const decoded = decodeAgentOutput(encoded);

    expect(decoded.actions[0]!.actionType).toBe(0x02);
    expect(decoded.actions[1]!.actionType).toBe(0x01);
  });

  it("should handle max actions (64)", () => {
    const actions: ActionV1[] = [];
    for (let i = 0; i < MAX_ACTIONS_PER_OUTPUT; i++) {
      actions.push(makeAction(ActionType.NO_OP, 0x00, []));
    }
    const output: AgentOutput = { actions };

    const encoded = encodeAgentOutput(output);
    const decoded = decodeAgentOutput(encoded);
    expect(decoded.actions.length).toBe(MAX_ACTIONS_PER_OUTPUT);
  });

  it("should reject more than 64 actions", () => {
    const actions: ActionV1[] = [];
    for (let i = 0; i < MAX_ACTIONS_PER_OUTPUT + 1; i++) {
      actions.push(makeAction(ActionType.NO_OP, 0x00, []));
    }
    const output: AgentOutput = { actions };

    expect(() => encodeAgentOutput(output)).toThrow("Too many actions");
  });

  it("should encode action types as little-endian u32", () => {
    const action = makeAction(ActionType.CALL, 0x00, []);
    const output: AgentOutput = { actions: [action] };
    const encoded = encodeAgentOutput(output);

    // Skip: action_count (4) + action_len (4) = offset 8
    // Then action_type is at offset 8
    const view = new DataView(encoded.buffer);
    const actionType = view.getUint32(8, true);
    expect(actionType).toBe(ActionType.CALL);
  });

  it("should encode action_count as little-endian u32", () => {
    const output: AgentOutput = { actions: [makeAction(ActionType.ECHO, 0x42, [1, 2])] };
    const encoded = encodeAgentOutput(output);
    const view = new DataView(encoded.buffer);
    expect(view.getUint32(0, true)).toBe(1);
  });
});

// ============================================================================
// KernelInputV1 Codec Tests
// ============================================================================

describe("KernelInputV1 codec", () => {
  it("should round-trip with empty opaque inputs", () => {
    const input = makeKernelInput();
    const encoded = encodeKernelInput(input);

    // 148 bytes minimum (144 fixed + 4 length prefix)
    expect(encoded.length).toBe(148);

    const decoded = decodeKernelInput(encoded);
    expect(decoded.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(decoded.kernelVersion).toBe(KERNEL_VERSION);
    expect(arraysEqual(decoded.agentId, input.agentId)).toBe(true);
    expect(arraysEqual(decoded.agentCodeHash, input.agentCodeHash)).toBe(true);
    expect(arraysEqual(decoded.constraintSetHash, input.constraintSetHash)).toBe(true);
    expect(arraysEqual(decoded.inputRoot, input.inputRoot)).toBe(true);
    expect(decoded.executionNonce).toBe(12345n);
    expect(decoded.opaqueAgentInputs.length).toBe(0);
  });

  it("should round-trip with opaque inputs", () => {
    const opaqueInputs = new Uint8Array([10, 20, 30, 40, 50]);
    const input = makeKernelInput(opaqueInputs);
    const encoded = encodeKernelInput(input);

    expect(encoded.length).toBe(148 + 5);

    const decoded = decodeKernelInput(encoded);
    expect(arraysEqual(decoded.opaqueAgentInputs, opaqueInputs)).toBe(true);
  });

  it("should reject truncated input", () => {
    const encoded = new Uint8Array(100); // too short
    expect(() => decodeKernelInput(encoded)).toThrow();
  });

  it("should reject input with trailing bytes", () => {
    const input = makeKernelInput();
    const encoded = encodeKernelInput(input);

    // Add trailing byte
    const withTrailing = new Uint8Array(encoded.length + 1);
    withTrailing.set(encoded);
    expect(() => decodeKernelInput(withTrailing)).toThrow("trailing bytes");
  });

  it("should encode execution_nonce as little-endian u64", () => {
    const input = makeKernelInput();
    input.executionNonce; // 12345n

    const encoded = encodeKernelInput(input);
    const view = new DataView(encoded.buffer);

    // nonce is at offset 136 (4+4+32+32+32+32 = 136)
    const nonce = view.getBigUint64(136, true);
    expect(nonce).toBe(12345n);
  });
});

// ============================================================================
// KernelJournalV1 Codec Tests
// ============================================================================

describe("KernelJournalV1 codec", () => {
  it("should produce exactly 209 bytes", () => {
    const journal = makeJournal();
    const encoded = encodeKernelJournal(journal);
    expect(encoded.length).toBe(JOURNAL_SIZE);
    expect(encoded.length).toBe(209);
  });

  it("should round-trip with Success status", () => {
    const journal = makeJournal();
    const encoded = encodeKernelJournal(journal);
    const decoded = decodeKernelJournal(encoded);

    expect(decoded.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(decoded.kernelVersion).toBe(KERNEL_VERSION);
    expect(arraysEqual(decoded.agentId, journal.agentId)).toBe(true);
    expect(arraysEqual(decoded.agentCodeHash, journal.agentCodeHash)).toBe(true);
    expect(arraysEqual(decoded.constraintSetHash, journal.constraintSetHash)).toBe(true);
    expect(arraysEqual(decoded.inputRoot, journal.inputRoot)).toBe(true);
    expect(decoded.executionNonce).toBe(99n);
    expect(arraysEqual(decoded.inputCommitment, journal.inputCommitment)).toBe(true);
    expect(arraysEqual(decoded.actionCommitment, journal.actionCommitment)).toBe(true);
    expect(decoded.executionStatus).toBe(ExecutionStatus.Success);
  });

  it("should round-trip with Failure status", () => {
    const journal: KernelJournalV1 = {
      ...makeJournal(),
      executionStatus: ExecutionStatus.Failure,
    };
    const encoded = encodeKernelJournal(journal);
    const decoded = decodeKernelJournal(encoded);

    expect(decoded.executionStatus).toBe(ExecutionStatus.Failure);
  });

  it("should encode execution status as last byte", () => {
    const journal = makeJournal();
    const encoded = encodeKernelJournal(journal);

    // Last byte is execution_status
    expect(encoded[208]).toBe(0x01); // Success
  });

  it("should reject invalid execution status", () => {
    const journal = makeJournal();
    const encoded = encodeKernelJournal(journal);

    // Corrupt the last byte to invalid status
    encoded[208] = 0x00;
    expect(() => decodeKernelJournal(encoded)).toThrow("Invalid execution status");

    encoded[208] = 0x03;
    expect(() => decodeKernelJournal(encoded)).toThrow("Invalid execution status");
  });

  it("should reject wrong-length input", () => {
    expect(() => decodeKernelJournal(new Uint8Array(208))).toThrow("invalid length");
    expect(() => decodeKernelJournal(new Uint8Array(210))).toThrow("invalid length");
  });

  it("should encode all fixed fields at correct offsets", () => {
    const journal = makeJournal();
    const encoded = encodeKernelJournal(journal);
    const view = new DataView(encoded.buffer);

    // Offset 0: protocol_version (u32 LE)
    expect(view.getUint32(0, true)).toBe(PROTOCOL_VERSION);

    // Offset 4: kernel_version (u32 LE)
    expect(view.getUint32(4, true)).toBe(KERNEL_VERSION);

    // Offset 8: agent_id (32 bytes of 0x42)
    expect(encoded[8]).toBe(0x42);
    expect(encoded[39]).toBe(0x42);

    // Offset 40: agent_code_hash (32 bytes of 0xAA)
    expect(encoded[40]).toBe(0xaa);

    // Offset 72: constraint_set_hash (32 bytes of 0xBB)
    expect(encoded[72]).toBe(0xbb);

    // Offset 104: input_root (32 bytes of 0xCC)
    expect(encoded[104]).toBe(0xcc);

    // Offset 136: execution_nonce (u64 LE)
    expect(view.getBigUint64(136, true)).toBe(99n);

    // Offset 144: input_commitment (32 bytes of 0xDD)
    expect(encoded[144]).toBe(0xdd);

    // Offset 176: action_commitment (32 bytes of 0xEE)
    expect(encoded[176]).toBe(0xee);

    // Offset 208: execution_status (1 byte)
    expect(encoded[208]).toBe(0x01);
  });
});

// ============================================================================
// Wire Format Compatibility Tests
// ============================================================================

describe("wire format compatibility", () => {
  it("should encode integers as little-endian (matching Rust codec)", () => {
    // Verify that 0x04030201 encodes as [0x01, 0x02, 0x03, 0x04] in LE
    const output: AgentOutput = { actions: [] };
    const encoded = encodeAgentOutput(output);
    // action_count = 0 -> [0x00, 0x00, 0x00, 0x00]
    expect(encoded[0]).toBe(0x00);
    expect(encoded[1]).toBe(0x00);
    expect(encoded[2]).toBe(0x00);
    expect(encoded[3]).toBe(0x00);
  });

  it("should encode action_type as little-endian u32", () => {
    // ActionType.CALL = 2 -> LE bytes: [0x02, 0x00, 0x00, 0x00]
    const action = makeAction(ActionType.CALL, 0x00, []);
    const output: AgentOutput = { actions: [action] };
    const encoded = encodeAgentOutput(output);

    // action_count(4) + action_len(4) + action_type starts at offset 8
    expect(encoded[8]).toBe(0x02);
    expect(encoded[9]).toBe(0x00);
    expect(encoded[10]).toBe(0x00);
    expect(encoded[11]).toBe(0x00);
  });

  it("should encode payload length as little-endian u32", () => {
    const payload = new Uint8Array(256);
    const action: ActionV1 = {
      actionType: ActionType.ECHO,
      target: new Uint8Array(32),
      payload,
    };
    const output: AgentOutput = { actions: [action] };
    const encoded = encodeAgentOutput(output);

    // action_count(4) + action_len(4) + action_type(4) + target(32) = offset 44
    // payload_len at offset 44
    const view = new DataView(encoded.buffer);
    expect(view.getUint32(44, true)).toBe(256);
  });
});
