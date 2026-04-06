/**
 * Wire format codec matching Rust kernel-core codec.rs byte-for-byte.
 *
 * CRITICAL: All integers are LITTLE-ENDIAN to match the Rust implementation.
 * This is consensus-critical -- any deviation will produce different hashes.
 */

import type { ActionV1, AgentOutput, KernelInputV1, KernelJournalV1 } from "./types.js";
import {
  ExecutionStatus,
  JOURNAL_SIZE,
  MAX_ACTIONS_PER_OUTPUT,
  MAX_ACTION_PAYLOAD_BYTES,
  MAX_AGENT_INPUT_BYTES,
  MAX_AGENT_OUTPUT_BYTES,
  MAX_SINGLE_ACTION_BYTES,
  PROTOCOL_VERSION,
  KERNEL_VERSION,
} from "./types.js";

// ============================================================================
// Helper Functions - Writing (Little-Endian)
// ============================================================================

/** Write a u32 as little-endian into a DataView at the given offset. Returns new offset. */
export function writeU32LE(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value, true);
  return offset + 4;
}

/** Write a u64 as little-endian into a DataView at the given offset. Returns new offset. */
export function writeU64LE(view: DataView, offset: number, value: bigint): number {
  view.setBigUint64(offset, value, true);
  return offset + 8;
}

/** Write a Uint8Array into a buffer at the given offset. Returns new offset. */
export function writeBytes(buf: Uint8Array, offset: number, data: Uint8Array): number {
  buf.set(data, offset);
  return offset + data.length;
}

// ============================================================================
// Helper Functions - Reading (Little-Endian)
// ============================================================================

/** Read a u32 from little-endian bytes at offset. Returns [value, newOffset]. */
export function readU32LE(view: DataView, offset: number): [number, number] {
  if (offset + 4 > view.byteLength) {
    throw new RangeError(`readU32LE: unexpected end of input at offset ${offset}`);
  }
  return [view.getUint32(offset, true), offset + 4];
}

/** Read a u64 from little-endian bytes at offset. Returns [value, newOffset]. */
export function readU64LE(view: DataView, offset: number): [bigint, number] {
  if (offset + 8 > view.byteLength) {
    throw new RangeError(`readU64LE: unexpected end of input at offset ${offset}`);
  }
  return [view.getBigUint64(offset, true), offset + 8];
}

/** Read a u8 at offset. Returns [value, newOffset]. */
export function readU8(data: Uint8Array, offset: number): [number, number] {
  if (offset >= data.length) {
    throw new RangeError(`readU8: unexpected end of input at offset ${offset}`);
  }
  return [data[offset]!, offset + 1];
}

/** Read N bytes at offset, returns a copy. Returns [bytes, newOffset]. */
export function readBytes(data: Uint8Array, offset: number, length: number): [Uint8Array, number] {
  const end = offset + length;
  if (end > data.length) {
    throw new RangeError(`readBytes: unexpected end of input at offset ${offset}, need ${length} bytes`);
  }
  return [data.slice(offset, end), end];
}

/** Read exactly 32 bytes at offset, returns a copy. */
export function readBytes32(data: Uint8Array, offset: number): [Uint8Array, number] {
  return readBytes(data, offset, 32);
}

// ============================================================================
// ActionV1 Codec
// ============================================================================

/**
 * Compute the encoded length of a single ActionV1.
 *
 * Layout: action_type (4) + target (32) + payload_len (4) + payload
 */
function actionEncodedLen(action: ActionV1): number {
  return 40 + action.payload.length;
}

/**
 * Encode a single ActionV1 into a buffer at the given offset.
 * Returns the new offset after writing.
 */
function encodeActionInto(buf: Uint8Array, view: DataView, offset: number, action: ActionV1): number {
  if (action.payload.length > MAX_ACTION_PAYLOAD_BYTES) {
    throw new Error(
      `Action payload too large: ${action.payload.length} bytes (limit: ${MAX_ACTION_PAYLOAD_BYTES})`
    );
  }

  offset = writeU32LE(view, offset, action.actionType);
  offset = writeBytes(buf, offset, action.target);
  offset = writeU32LE(view, offset, action.payload.length);
  offset = writeBytes(buf, offset, action.payload);
  return offset;
}

/**
 * Decode a single ActionV1 from a buffer slice.
 * The slice must contain exactly one action (no trailing bytes).
 */
function decodeAction(data: Uint8Array): ActionV1 {
  if (data.length < 40) {
    throw new Error("ActionV1: unexpected end of input");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  let actionType: number;
  [actionType, offset] = readU32LE(view, offset);

  let target: Uint8Array;
  [target, offset] = readBytes32(data, offset);

  let payloadLen: number;
  [payloadLen, offset] = readU32LE(view, offset);

  if (payloadLen > MAX_ACTION_PAYLOAD_BYTES) {
    throw new Error(
      `Action payload too large: ${payloadLen} bytes (limit: ${MAX_ACTION_PAYLOAD_BYTES})`
    );
  }

  let payload: Uint8Array;
  [payload, offset] = readBytes(data, offset, payloadLen);

  if (offset !== data.length) {
    throw new Error("ActionV1: trailing bytes after action");
  }

  return { actionType, target, payload };
}

// ============================================================================
// AgentOutput Codec
// ============================================================================

/**
 * Encode an AgentOutput into its canonical wire format.
 *
 * Layout (little-endian):
 * - action_count: u32 (4 bytes)
 * - for each action:
 *   - action_len: u32 (4 bytes)
 *   - ActionV1 encoding (variable)
 *
 * Action order is preserved as-is (agent is responsible for deterministic ordering).
 */
export function encodeAgentOutput(output: AgentOutput): Uint8Array {
  const n = output.actions.length;
  if (n > MAX_ACTIONS_PER_OUTPUT) {
    throw new Error(`Too many actions: ${n} (limit: ${MAX_ACTIONS_PER_OUTPUT})`);
  }

  // Compute total size
  let totalSize = 4; // action_count
  for (const action of output.actions) {
    const actionLen = actionEncodedLen(action);
    if (actionLen > MAX_SINGLE_ACTION_BYTES) {
      throw new Error(`Action too large: ${actionLen} bytes (limit: ${MAX_SINGLE_ACTION_BYTES})`);
    }
    totalSize += 4 + actionLen; // length prefix + action data
  }

  if (totalSize > MAX_AGENT_OUTPUT_BYTES) {
    throw new Error(`Output too large: ${totalSize} bytes (limit: ${MAX_AGENT_OUTPUT_BYTES})`);
  }

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let offset = 0;

  offset = writeU32LE(view, offset, n);

  for (const action of output.actions) {
    const actionLen = actionEncodedLen(action);
    offset = writeU32LE(view, offset, actionLen);
    offset = encodeActionInto(buf, view, offset, action);
  }

  return buf;
}

/**
 * Decode an AgentOutput from its canonical wire format.
 */
export function decodeAgentOutput(data: Uint8Array): AgentOutput {
  if (data.length > MAX_AGENT_OUTPUT_BYTES) {
    throw new Error(`Output too large: ${data.length} bytes (limit: ${MAX_AGENT_OUTPUT_BYTES})`);
  }

  if (data.length < 4) {
    throw new Error("AgentOutput: unexpected end of input");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  let actionCount: number;
  [actionCount, offset] = readU32LE(view, offset);

  if (actionCount > MAX_ACTIONS_PER_OUTPUT) {
    throw new Error(`Too many actions: ${actionCount} (limit: ${MAX_ACTIONS_PER_OUTPUT})`);
  }

  const actions: ActionV1[] = [];

  for (let i = 0; i < actionCount; i++) {
    let actionLen: number;
    [actionLen, offset] = readU32LE(view, offset);

    if (actionLen > MAX_SINGLE_ACTION_BYTES) {
      throw new Error(`Action too large: ${actionLen} bytes (limit: ${MAX_SINGLE_ACTION_BYTES})`);
    }

    const actionEnd = offset + actionLen;
    if (actionEnd > data.length) {
      throw new Error("AgentOutput: unexpected end of input while reading action");
    }

    const actionData = data.slice(offset, actionEnd);
    actions.push(decodeAction(actionData));
    offset = actionEnd;
  }

  if (offset !== data.length) {
    throw new Error("AgentOutput: trailing bytes after output");
  }

  return { actions };
}

// ============================================================================
// KernelInputV1 Codec
// ============================================================================

/**
 * Decode a KernelInputV1 from its canonical wire format.
 *
 * Layout (little-endian):
 * - protocol_version: u32 (4)
 * - kernel_version: u32 (4)
 * - agent_id: bytes32 (32)
 * - agent_code_hash: bytes32 (32)
 * - constraint_set_hash: bytes32 (32)
 * - input_root: bytes32 (32)
 * - execution_nonce: u64 (8)
 * - opaque_agent_inputs_len: u32 (4)
 * - opaque_agent_inputs: variable
 *
 * Minimum size: 148 bytes (with empty opaque_agent_inputs).
 */
export function decodeKernelInput(data: Uint8Array): KernelInputV1 {
  if (data.length < 148) {
    throw new Error("KernelInputV1: unexpected end of input");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  let protocolVersion: number;
  [protocolVersion, offset] = readU32LE(view, offset);

  let kernelVersion: number;
  [kernelVersion, offset] = readU32LE(view, offset);

  let agentId: Uint8Array;
  [agentId, offset] = readBytes32(data, offset);

  let agentCodeHash: Uint8Array;
  [agentCodeHash, offset] = readBytes32(data, offset);

  let constraintSetHash: Uint8Array;
  [constraintSetHash, offset] = readBytes32(data, offset);

  let inputRoot: Uint8Array;
  [inputRoot, offset] = readBytes32(data, offset);

  let executionNonce: bigint;
  [executionNonce, offset] = readU64LE(view, offset);

  let inputsLen: number;
  [inputsLen, offset] = readU32LE(view, offset);

  if (inputsLen > MAX_AGENT_INPUT_BYTES) {
    throw new Error(`Agent inputs too large: ${inputsLen} bytes (limit: ${MAX_AGENT_INPUT_BYTES})`);
  }

  let opaqueAgentInputs: Uint8Array;
  [opaqueAgentInputs, offset] = readBytes(data, offset, inputsLen);

  if (offset !== data.length) {
    throw new Error("KernelInputV1: trailing bytes");
  }

  return {
    protocolVersion,
    kernelVersion,
    agentId,
    agentCodeHash,
    constraintSetHash,
    inputRoot,
    executionNonce,
    opaqueAgentInputs,
  };
}

/**
 * Encode a KernelInputV1 into its canonical wire format.
 */
export function encodeKernelInput(input: KernelInputV1): Uint8Array {
  const inputsLen = input.opaqueAgentInputs.length;
  if (inputsLen > MAX_AGENT_INPUT_BYTES) {
    throw new Error(`Agent inputs too large: ${inputsLen} bytes (limit: ${MAX_AGENT_INPUT_BYTES})`);
  }

  const totalSize = 148 + inputsLen;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let offset = 0;

  offset = writeU32LE(view, offset, input.protocolVersion);
  offset = writeU32LE(view, offset, input.kernelVersion);
  offset = writeBytes(buf, offset, input.agentId);
  offset = writeBytes(buf, offset, input.agentCodeHash);
  offset = writeBytes(buf, offset, input.constraintSetHash);
  offset = writeBytes(buf, offset, input.inputRoot);
  offset = writeU64LE(view, offset, input.executionNonce);
  offset = writeU32LE(view, offset, inputsLen);
  offset = writeBytes(buf, offset, input.opaqueAgentInputs);

  return buf;
}

// ============================================================================
// KernelJournalV1 Codec
// ============================================================================

/**
 * Encode a KernelJournalV1 into its canonical wire format.
 *
 * Always produces exactly 209 bytes.
 */
export function encodeKernelJournal(journal: KernelJournalV1): Uint8Array {
  const buf = new Uint8Array(JOURNAL_SIZE);
  const view = new DataView(buf.buffer);
  let offset = 0;

  offset = writeU32LE(view, offset, journal.protocolVersion);
  offset = writeU32LE(view, offset, journal.kernelVersion);
  offset = writeBytes(buf, offset, journal.agentId);
  offset = writeBytes(buf, offset, journal.agentCodeHash);
  offset = writeBytes(buf, offset, journal.constraintSetHash);
  offset = writeBytes(buf, offset, journal.inputRoot);
  offset = writeU64LE(view, offset, journal.executionNonce);
  offset = writeBytes(buf, offset, journal.inputCommitment);
  offset = writeBytes(buf, offset, journal.actionCommitment);

  // ExecutionStatus: Success = 0x01, Failure = 0x02
  buf[offset] = journal.executionStatus;

  return buf;
}

/**
 * Decode a KernelJournalV1 from its canonical wire format.
 *
 * Input must be exactly 209 bytes.
 */
export function decodeKernelJournal(data: Uint8Array): KernelJournalV1 {
  if (data.length !== JOURNAL_SIZE) {
    throw new Error(
      `KernelJournalV1: invalid length ${data.length}, expected ${JOURNAL_SIZE}`
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  let protocolVersion: number;
  [protocolVersion, offset] = readU32LE(view, offset);

  let kernelVersion: number;
  [kernelVersion, offset] = readU32LE(view, offset);

  let agentId: Uint8Array;
  [agentId, offset] = readBytes32(data, offset);

  let agentCodeHash: Uint8Array;
  [agentCodeHash, offset] = readBytes32(data, offset);

  let constraintSetHash: Uint8Array;
  [constraintSetHash, offset] = readBytes32(data, offset);

  let inputRoot: Uint8Array;
  [inputRoot, offset] = readBytes32(data, offset);

  let executionNonce: bigint;
  [executionNonce, offset] = readU64LE(view, offset);

  let inputCommitment: Uint8Array;
  [inputCommitment, offset] = readBytes32(data, offset);

  let actionCommitment: Uint8Array;
  [actionCommitment, offset] = readBytes32(data, offset);

  const statusByte = data[offset]!;
  if (statusByte !== ExecutionStatus.Success && statusByte !== ExecutionStatus.Failure) {
    throw new Error(`Invalid execution status byte: 0x${statusByte.toString(16).padStart(2, "0")}`);
  }

  return {
    protocolVersion,
    kernelVersion,
    agentId,
    agentCodeHash,
    constraintSetHash,
    inputRoot,
    executionNonce,
    inputCommitment,
    actionCommitment,
    executionStatus: statusByte as ExecutionStatus,
  };
}
