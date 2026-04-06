// ============================================================================
// Protocol Constants
// ============================================================================

/** Current protocol version (must match kernel-core PROTOCOL_VERSION). */
export const PROTOCOL_VERSION = 1;

/** Current kernel version (must match kernel-core KERNEL_VERSION). */
export const KERNEL_VERSION = 1;

/** Maximum number of actions per output. */
export const MAX_ACTIONS_PER_OUTPUT = 64;

/** Maximum payload size per action (16 KB). */
export const MAX_ACTION_PAYLOAD_BYTES = 16_384;

/** Maximum encoded size of a single ActionV1 (4 + 32 + 4 + 16384). */
export const MAX_SINGLE_ACTION_BYTES = 40 + MAX_ACTION_PAYLOAD_BYTES;

/** Maximum total agent input bytes (64 KB). */
export const MAX_AGENT_INPUT_BYTES = 64_000;

/** Maximum total agent output bytes (64 KB). */
export const MAX_AGENT_OUTPUT_BYTES = 64_000;

/** Fixed journal size in bytes. */
export const JOURNAL_SIZE = 209;

// ============================================================================
// Action Type Enum
// ============================================================================

/**
 * Action type constants matching Solidity KernelOutputParser.sol.
 *
 * These values are consensus-critical and must not be changed.
 */
export const ActionType = {
  /** Echo action for testing only (not executable on-chain). */
  ECHO: 1,
  /** Generic contract call: target.call{value}(calldata). */
  CALL: 2,
  /** ERC20 transfer: IERC20(token).transfer(to, amount). */
  TRANSFER_ERC20: 3,
  /** No operation - skipped during on-chain execution. */
  NO_OP: 4,
} as const;

export type ActionType = (typeof ActionType)[keyof typeof ActionType];

// ============================================================================
// Execution Status
// ============================================================================

/**
 * Execution status enum.
 *
 * - Success (0x01): Execution completed and constraints passed.
 * - Failure (0x02): Execution completed but constraints violated.
 * - 0x00 is reserved/invalid.
 */
export const ExecutionStatus = {
  Success: 1,
  Failure: 2,
} as const;

export type ExecutionStatus =
  (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

// ============================================================================
// Core Types
// ============================================================================

/**
 * Execution context provided to agents by the kernel.
 *
 * All byte fields are Uint8Array of fixed length 32.
 */
export interface AgentContext {
  /** Protocol version for wire format compatibility. */
  readonly protocolVersion: number;
  /** Kernel semantics version. */
  readonly kernelVersion: number;
  /** 32-byte agent identifier. */
  readonly agentId: Uint8Array;
  /** SHA-256 hash of the agent binary. */
  readonly agentCodeHash: Uint8Array;
  /** SHA-256 hash of the constraint set being enforced. */
  readonly constraintSetHash: Uint8Array;
  /** External state root (market/vault snapshot). */
  readonly inputRoot: Uint8Array;
  /** Monotonic nonce for replay protection. */
  readonly executionNonce: bigint;
}

/**
 * Structured action format for agent output.
 *
 * Wire format (little-endian):
 * - action_type: u32 (4 bytes)
 * - target: bytes32 (32 bytes)
 * - payload_len: u32 (4 bytes)
 * - payload: variable bytes
 */
export interface ActionV1 {
  /** 4-byte action type identifier. */
  readonly actionType: number;
  /** 32-byte target address/identifier. */
  readonly target: Uint8Array;
  /** Action-specific payload (max 16 KB). */
  readonly payload: Uint8Array;
}

/**
 * Structured agent output containing ordered actions.
 *
 * Wire format (little-endian):
 * - action_count: u32 (4 bytes)
 * - for each action: action_len (u32) + ActionV1 encoding
 */
export interface AgentOutput {
  readonly actions: readonly ActionV1[];
}

// ============================================================================
// Kernel Input / Journal
// ============================================================================

/**
 * Kernel input structure for P0.1 protocol.
 *
 * Wire format (little-endian):
 * - protocol_version: u32
 * - kernel_version: u32
 * - agent_id: bytes32
 * - agent_code_hash: bytes32
 * - constraint_set_hash: bytes32
 * - input_root: bytes32
 * - execution_nonce: u64
 * - opaque_agent_inputs_len: u32
 * - opaque_agent_inputs: variable bytes
 */
export interface KernelInputV1 {
  readonly protocolVersion: number;
  readonly kernelVersion: number;
  readonly agentId: Uint8Array;
  readonly agentCodeHash: Uint8Array;
  readonly constraintSetHash: Uint8Array;
  readonly inputRoot: Uint8Array;
  readonly executionNonce: bigint;
  readonly opaqueAgentInputs: Uint8Array;
}

/**
 * Kernel journal (output) structure for P0.1 protocol.
 *
 * Fixed size: 209 bytes.
 *
 * Wire format (little-endian):
 * - protocol_version: u32
 * - kernel_version: u32
 * - agent_id: bytes32
 * - agent_code_hash: bytes32
 * - constraint_set_hash: bytes32
 * - input_root: bytes32
 * - execution_nonce: u64
 * - input_commitment: bytes32
 * - action_commitment: bytes32
 * - execution_status: u8
 */
export interface KernelJournalV1 {
  readonly protocolVersion: number;
  readonly kernelVersion: number;
  readonly agentId: Uint8Array;
  readonly agentCodeHash: Uint8Array;
  readonly constraintSetHash: Uint8Array;
  readonly inputRoot: Uint8Array;
  readonly executionNonce: bigint;
  readonly inputCommitment: Uint8Array;
  readonly actionCommitment: Uint8Array;
  readonly executionStatus: ExecutionStatus;
}

// ============================================================================
// Oracle Types
// ============================================================================

/** A single price observation from the oracle feed. */
export interface PricePoint {
  /** Asset identifier (application-defined). */
  readonly assetId: number;
  /** Price in 1e8 fixed-point. */
  readonly price: bigint;
  /** Confidence interval in 1e8 fixed-point. */
  readonly conf: number;
}

/** ECDSA signature (v, r, s). */
export interface Signature {
  readonly v: number;
  readonly r: Uint8Array;
  readonly s: Uint8Array;
}

/** Decoded oracle price feed. */
export interface OraclePriceFeed {
  readonly feedVersion: number;
  readonly signer: Uint8Array;
  readonly timestamp: bigint;
  readonly priceCount: number;
  readonly prices: readonly PricePoint[];
  readonly signature: Signature;
}

// ============================================================================
// Oracle Constants
// ============================================================================

/** Maximum number of price points in a single feed. */
export const MAX_PRICE_COUNT = 32;

/** Required feed version byte. */
export const FEED_VERSION = 0x01;

/** Size of a single PricePoint in wire format (4 + 8 + 4 = 16 bytes). */
export const PRICE_POINT_SIZE = 16;

/** Size of the fixed header before prices (1 + 20 + 8 + 1 = 30 bytes). */
export const FEED_HEADER_SIZE = 30;

/** Size of the ECDSA signature (1 + 32 + 32 = 65 bytes). */
export const SIGNATURE_SIZE = 65;
