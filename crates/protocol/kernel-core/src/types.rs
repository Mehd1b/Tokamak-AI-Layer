use alloc::vec::Vec;

// ============================================================================
// Action Type Constants (Protocol v1)
// ============================================================================
//
// These are the ONLY supported action types for on-chain execution via KernelVault.
// They are aligned with KernelOutputParser.sol constants.
//
// IMPORTANT: The numeric values are consensus-critical. Any agent emitting actions
// with these types will have them executed on-chain by the vault.

/// CALL action type for on-chain execution (0x00000002).
///
/// Used by KernelVault.execute() to perform arbitrary contract calls.
/// Matches KernelOutputParser.sol ACTION_TYPE_CALL.
///
/// Payload schema (ABI-encoded):
/// - `abi.encode(uint256 value, bytes callData)`
///
/// On-chain execution: `target.call{value: value}(callData)`
///
/// # Target Format
///
/// The target is a bytes32 with the EVM address left-padded:
/// - Upper 12 bytes: 0x00 (must be zero for valid EVM address)
/// - Lower 20 bytes: EVM address
pub const ACTION_TYPE_CALL: u32 = 0x00000002;

/// ERC20 transfer action type for on-chain execution (0x00000003).
///
/// Used by KernelVault.execute() to transfer ERC20 tokens.
/// Matches KernelOutputParser.sol ACTION_TYPE_TRANSFER_ERC20.
///
/// Payload schema (ABI-encoded):
/// - `abi.encode(address token, address to, uint256 amount)`
/// - Size: exactly 96 bytes
///
/// On-chain execution: `IERC20(token).transfer(to, amount)`
pub const ACTION_TYPE_TRANSFER_ERC20: u32 = 0x00000003;

/// No-op action type (0x00000004).
///
/// Used for testing or placeholder actions that should be skipped.
/// Matches KernelOutputParser.sol ACTION_TYPE_NO_OP.
///
/// Payload: empty (0 bytes)
pub const ACTION_TYPE_NO_OP: u32 = 0x00000004;

/// Echo action type for testing (0x00000001).
///
/// Used for testing and debugging. Payload is opaque bytes with no schema.
/// This action type is NOT executable by KernelVault - it will be rejected.
///
/// Only use this for unit tests and development.
#[cfg(any(test, feature = "testing"))]
pub const ACTION_TYPE_ECHO: u32 = 0x00000001;

/// Kernel input structure for P0.1 protocol.
///
/// Contains all consensus-critical fields needed to bind the proof to:
/// - The specific kernel semantics (kernel_version)
/// - The agent code being executed (agent_code_hash)
/// - The constraint policy enforced (constraint_set_hash)
/// - The external state observed (input_root)
/// - Replay protection (execution_nonce)
#[derive(Clone, Debug, PartialEq)]
pub struct KernelInputV1 {
    /// Protocol version for wire format compatibility
    pub protocol_version: u32,
    /// Kernel version declaring which semantics are being proven
    pub kernel_version: u32,
    /// 32-byte agent identifier
    pub agent_id: [u8; 32],
    /// SHA-256 hash of the agent binary/code
    pub agent_code_hash: [u8; 32],
    /// SHA-256 hash of the constraint set being enforced
    pub constraint_set_hash: [u8; 32],
    /// External state root (market/vault snapshot) the agent observes
    pub input_root: [u8; 32],
    /// Monotonic nonce for replay protection
    pub execution_nonce: u64,
    /// Opaque agent-specific input data (max 64KB)
    pub opaque_agent_inputs: Vec<u8>,
}

/// Kernel journal (output) structure for P0.1 protocol.
///
/// Contains all fields needed for on-chain verification:
/// - Identity fields (agent_id, agent_code_hash) for binding to strategy
/// - Constraint policy (constraint_set_hash) for proving policy enforcement
/// - Replay protection (execution_nonce) for ordering/dedup
/// - Cryptographic commitments for input/output verification
///
/// Journal size: 209 bytes fixed (4+4+32+32+32+32+8+32+32+1)
#[derive(Clone, Debug, PartialEq)]
pub struct KernelJournalV1 {
    /// Protocol version for wire format compatibility
    pub protocol_version: u32,
    /// Kernel version that produced this journal
    pub kernel_version: u32,
    /// Agent identifier (copied from input for verifier convenience)
    pub agent_id: [u8; 32],
    /// Agent code hash (proof binds to this specific agent)
    pub agent_code_hash: [u8; 32],
    /// Constraint set hash (proof binds to this policy)
    pub constraint_set_hash: [u8; 32],
    /// Input root (external state that was observed)
    pub input_root: [u8; 32],
    /// Execution nonce for replay protection
    pub execution_nonce: u64,
    /// SHA-256(full_input_bytes) - commits to entire input
    pub input_commitment: [u8; 32],
    /// SHA-256(agent_output_bytes) - commits to actions
    pub action_commitment: [u8; 32],
    /// Execution result status
    pub execution_status: ExecutionStatus,
}

/// Execution status enum.
///
/// Encoding:
/// - Success = 0x01: Execution completed and constraints passed
/// - Failure = 0x02: Execution completed but constraints violated
/// - 0x00 is reserved/invalid (prevents uninitialized memory from being interpreted as success)
/// - 0x03-0xFF are reserved for future expansion
///
/// On Failure, the journal is still produced with:
/// - action_commitment = SHA256(empty AgentOutput encoding)
/// - execution_status = Failure (0x02)
///
/// Verifiers/contracts should reject state transitions for Failure journals.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExecutionStatus {
    /// Execution completed successfully and all constraints passed. Encoded as 0x01.
    Success,
    /// Execution completed but constraints were violated. Encoded as 0x02.
    /// The action_commitment will be the commitment to an empty AgentOutput.
    Failure,
}

/// Structured action format for agent output.
///
/// Each action has:
/// - action_type: 4-byte identifier for the action kind
/// - target: 32-byte target address/identifier
/// - payload: Variable-length action data (max 16KB per action)
///
/// Actions are ordered and the ordering is consensus-critical.
/// The kernel enforces deterministic ordering by sorting actions
/// before commitment using lexicographic comparison:
///   1. action_type (ascending)
///   2. target (lexicographic)
///   3. payload (lexicographic)
///
/// This kernel-side canonicalization ensures determinism regardless
/// of the order in which agents produce actions.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionV1 {
    /// 4-byte action type identifier
    pub action_type: u32,
    /// 32-byte target address/identifier
    pub target: [u8; 32],
    /// Action-specific payload (max 16KB)
    pub payload: Vec<u8>,
}

/// Maximum payload size per action (2KB).
/// Reduced from 16,384 to 2,048 for HyperEVM 3M block gas limit compatibility.
pub const MAX_ACTION_PAYLOAD_BYTES: usize = 2_048;

/// Maximum number of actions per output.
/// Reduced from 64 to 10 for HyperEVM 3M block gas limit compatibility.
pub const MAX_ACTIONS_PER_OUTPUT: usize = 10;

/// Maximum encoded size of a single ActionV1.
/// Computed as: action_type (4) + target (32) + payload_len (4) + MAX_ACTION_PAYLOAD_BYTES
/// = 40 + 2048 = 2088 bytes
pub const MAX_SINGLE_ACTION_BYTES: usize = 40 + MAX_ACTION_PAYLOAD_BYTES;

/// Structured agent output containing ordered actions.
///
/// Actions are sorted into canonical order by the kernel before
/// commitment computation (see ActionV1 for ordering rules).
/// The action_commitment is computed over the encoded AgentOutput
/// after canonicalization.
#[derive(Clone, Debug, PartialEq)]
pub struct AgentOutput {
    /// Ordered list of actions (max 64 actions)
    pub actions: Vec<ActionV1>,
}

// Manual Ord implementation for ActionV1 to ensure deterministic ordering.
// Ordering: action_type (ascending) → target (lexicographic) → payload (lexicographic)
impl Ord for ActionV1 {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        match self.action_type.cmp(&other.action_type) {
            core::cmp::Ordering::Equal => {}
            ord => return ord,
        }
        match self.target.cmp(&other.target) {
            core::cmp::Ordering::Equal => {}
            ord => return ord,
        }
        self.payload.cmp(&other.payload)
    }
}

impl PartialOrd for ActionV1 {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl AgentOutput {
    /// Canonicalize actions by sorting them into deterministic order.
    ///
    /// NOTE: The `encode()` method automatically canonicalizes actions,
    /// so calling this explicitly is only needed if you want to inspect
    /// the canonical order without encoding.
    pub fn canonicalize(&mut self) {
        self.actions.sort();
    }

    /// Return a new AgentOutput with canonicalized action order.
    ///
    /// NOTE: The `encode()` method automatically canonicalizes actions,
    /// so calling this explicitly is only needed if you want to inspect
    /// the canonical order without encoding.
    pub fn into_canonical(mut self) -> Self {
        self.canonicalize();
        self
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum CodecError {
    InvalidLength,
    InvalidVersion { expected: u32, actual: u32 },
    InputTooLarge { size: u32, limit: usize },
    OutputTooLarge { size: u32, limit: usize },
    UnexpectedEndOfInput,
    InvalidExecutionStatus(u8),
    ArithmeticOverflow,
    TooManyActions { count: u32, limit: usize },
    ActionPayloadTooLarge { size: u32, limit: usize },
    ActionTooLarge { size: u32, limit: usize },
}

impl core::fmt::Display for CodecError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::InvalidLength => write!(f, "Invalid data length"),
            Self::InvalidVersion { expected, actual } => {
                write!(f, "Version mismatch: expected {}, got {}", expected, actual)
            }
            Self::InputTooLarge { size, limit } => {
                write!(f, "Input too large: {} bytes (limit: {})", size, limit)
            }
            Self::OutputTooLarge { size, limit } => {
                write!(f, "Output too large: {} bytes (limit: {})", size, limit)
            }
            Self::UnexpectedEndOfInput => {
                write!(f, "Unexpected end of input — data is truncated")
            }
            Self::InvalidExecutionStatus(code) => {
                write!(f, "Invalid execution status byte: 0x{:02x}", code)
            }
            Self::ArithmeticOverflow => write!(f, "Arithmetic overflow during encoding"),
            Self::TooManyActions { count, limit } => {
                write!(f, "Too many actions: {} (limit: {})", count, limit)
            }
            Self::ActionPayloadTooLarge { size, limit } => {
                write!(f, "Action payload too large: {} bytes (limit: {})", size, limit)
            }
            Self::ActionTooLarge { size, limit } => {
                write!(f, "Action too large: {} bytes (limit: {})", size, limit)
            }
        }
    }
}

/// Kernel-level execution errors.
///
/// Separate from CodecError to distinguish parsing failures from
/// execution failures. All errors result in kernel abort before
/// journal commit.
#[derive(Clone, Debug, PartialEq)]
pub enum KernelError {
    /// Input decoding failed
    Codec(CodecError),
    /// Protocol version not supported
    UnsupportedProtocolVersion { expected: u32, actual: u32 },
    /// Kernel version not supported
    UnsupportedKernelVersion { expected: u32, actual: u32 },
    /// Agent execution failed
    AgentExecutionFailed(AgentError),
    /// Constraint check failed
    ConstraintViolation(ConstraintError),
    /// Agent ID validation failed
    InvalidAgentId,
    /// Agent code hash mismatch
    AgentCodeHashMismatch,
    /// Output encoding failed
    EncodingFailed(CodecError),
}

impl core::fmt::Display for KernelError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Codec(e) => write!(f, "Codec error: {}", e),
            Self::UnsupportedProtocolVersion { expected, actual } => {
                write!(
                    f,
                    "Unsupported protocol version: expected {}, got {}",
                    expected, actual
                )
            }
            Self::UnsupportedKernelVersion { expected, actual } => {
                write!(
                    f,
                    "Unsupported kernel version: expected {}, got {}",
                    expected, actual
                )
            }
            Self::AgentExecutionFailed(e) => write!(f, "Agent execution failed: {}", e),
            Self::ConstraintViolation(e) => write!(f, "Constraint error: {}", e),
            Self::InvalidAgentId => write!(f, "Agent ID validation failed"),
            Self::AgentCodeHashMismatch => write!(
                f,
                "Agent code hash mismatch — the proven agent binary does not match the registered hash"
            ),
            Self::EncodingFailed(e) => write!(f, "Output encoding failed: {}", e),
        }
    }
}

/// Agent execution errors
#[derive(Clone, Debug, PartialEq)]
pub enum AgentError {
    /// Input data is invalid for this agent
    InvalidInput,
    /// Agent panicked or failed during execution
    ExecutionFailed,
    /// Output exceeds size limits
    OutputTooLarge,
    /// Too many actions produced
    TooManyActions,
}

impl core::fmt::Display for AgentError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::InvalidInput => write!(f, "Agent received invalid input data"),
            Self::ExecutionFailed => write!(f, "Agent panicked or failed during execution"),
            Self::OutputTooLarge => write!(f, "Agent output exceeds size limits"),
            Self::TooManyActions => write!(f, "Agent produced too many actions"),
        }
    }
}

/// Constraint violation reason codes (stable numeric codes for determinism).
///
/// These codes are used to identify the specific constraint that was violated.
/// The numeric values are stable and should not be changed once defined.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ConstraintViolationReason {
    /// Output structure is invalid (too many actions, payload too large)
    InvalidOutputStructure = 0x01,
    /// Action type is not recognized/supported
    UnknownActionType = 0x02,
    /// Asset is not in the whitelist
    AssetNotWhitelisted = 0x03,
    /// Position size exceeds maximum allowed
    PositionTooLarge = 0x04,
    /// Leverage exceeds maximum allowed
    LeverageTooHigh = 0x05,
    /// Drawdown exceeds maximum allowed
    DrawdownExceeded = 0x06,
    /// Cooldown period has not elapsed since last execution
    CooldownNotElapsed = 0x07,
    /// State snapshot is invalid or missing required fields
    InvalidStateSnapshot = 0x08,
    /// Constraint set configuration is invalid
    InvalidConstraintSet = 0x09,
    /// Action payload is malformed or invalid
    InvalidActionPayload = 0x0A,
}

impl ConstraintViolationReason {
    /// Get the numeric code for this violation reason.
    pub fn code(self) -> u8 {
        self as u8
    }
}

impl core::fmt::Display for ConstraintViolationReason {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::InvalidOutputStructure => write!(f, "Invalid output structure"),
            Self::UnknownActionType => write!(
                f,
                "Unknown action type. Allowed: CALL (0x02), ERC20_TRANSFER (0x03), NO_OP (0x04)"
            ),
            Self::AssetNotWhitelisted => write!(f, "Asset not in whitelist"),
            Self::PositionTooLarge => {
                write!(f, "Position exceeds max_position_notional limit")
            }
            Self::LeverageTooHigh => write!(f, "Leverage exceeds max_leverage_bps limit"),
            Self::DrawdownExceeded => write!(f, "Drawdown exceeds max_drawdown_bps limit"),
            Self::CooldownNotElapsed => {
                write!(f, "Cooldown period has not elapsed since last execution")
            }
            Self::InvalidStateSnapshot => write!(f, "Invalid state snapshot encoding"),
            Self::InvalidConstraintSet => write!(f, "Invalid constraint set encoding"),
            Self::InvalidActionPayload => write!(f, "Invalid action payload encoding"),
        }
    }
}

/// Detailed constraint violation information.
#[derive(Clone, Debug, PartialEq)]
pub struct ConstraintViolation {
    /// The specific reason for the violation
    pub reason: ConstraintViolationReason,
    /// Index of the action that violated the constraint (if applicable)
    /// None for global violations (cooldown, drawdown, etc.)
    pub action_index: Option<usize>,
}

impl ConstraintViolation {
    /// Create a new constraint violation for a specific action.
    pub fn action(reason: ConstraintViolationReason, index: usize) -> Self {
        Self {
            reason,
            action_index: Some(index),
        }
    }

    /// Create a new constraint violation for a global constraint.
    pub fn global(reason: ConstraintViolationReason) -> Self {
        Self {
            reason,
            action_index: None,
        }
    }
}

impl core::fmt::Display for ConstraintViolation {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self.action_index {
            Some(idx) => write!(f, "Constraint violation in action #{}: {}", idx, self.reason),
            None => write!(f, "Constraint violation (global): {}", self.reason),
        }
    }
}

/// Constraint checking errors (legacy compatibility + detailed violations)
#[derive(Clone, Debug, PartialEq)]
pub enum ConstraintError {
    /// A constraint was violated (detailed)
    Violation(ConstraintViolation),
    /// Output structure is invalid (legacy)
    InvalidOutput,
}

impl core::fmt::Display for ConstraintError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Violation(v) => write!(f, "{}", v),
            Self::InvalidOutput => write!(f, "Invalid output structure"),
        }
    }
}

impl From<ConstraintViolation> for ConstraintError {
    fn from(v: ConstraintViolation) -> Self {
        ConstraintError::Violation(v)
    }
}

impl From<CodecError> for KernelError {
    fn from(e: CodecError) -> Self {
        KernelError::Codec(e)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================================================
    // Action Type Invariant Tests
    // ========================================================================

    /// Verify action type constants match Solidity contract values.
    ///
    /// IMPORTANT: These values are consensus-critical and must match
    /// KernelOutputParser.sol exactly. Changing them will break on-chain
    /// execution compatibility.
    #[test]
    fn test_action_types_match_solidity_contract() {
        // Values from KernelOutputParser.sol
        assert_eq!(ACTION_TYPE_CALL, 0x00000002, "CALL must be 0x02");
        assert_eq!(
            ACTION_TYPE_TRANSFER_ERC20, 0x00000003,
            "TRANSFER_ERC20 must be 0x03"
        );
        assert_eq!(ACTION_TYPE_NO_OP, 0x00000004, "NO_OP must be 0x04");
    }

    /// Verify ECHO is available in test mode.
    #[test]
    fn test_echo_action_type_in_test_mode() {
        assert_eq!(ACTION_TYPE_ECHO, 0x00000001, "ECHO must be 0x01");
    }

    /// Verify action types are distinct.
    #[test]
    fn test_action_types_are_distinct() {
        let types = [
            ACTION_TYPE_ECHO,
            ACTION_TYPE_CALL,
            ACTION_TYPE_TRANSFER_ERC20,
            ACTION_TYPE_NO_OP,
        ];

        // Verify all pairs are distinct
        for i in 0..types.len() {
            for j in (i + 1)..types.len() {
                assert_ne!(
                    types[i], types[j],
                    "Action types at index {} and {} must be distinct",
                    i, j
                );
            }
        }
    }

    /// Verify action types are in expected order.
    ///
    /// This isn't strictly required by the protocol, but helps ensure
    /// we don't accidentally shuffle values around.
    #[test]
    #[allow(clippy::assertions_on_constants)]
    fn test_action_types_ordering() {
        assert!(ACTION_TYPE_ECHO < ACTION_TYPE_CALL);
        assert!(ACTION_TYPE_CALL < ACTION_TYPE_TRANSFER_ERC20);
        assert!(ACTION_TYPE_TRANSFER_ERC20 < ACTION_TYPE_NO_OP);
    }

    /// Verify action types fit in u32 range.
    #[test]
    fn test_action_types_are_u32() {
        let _: u32 = ACTION_TYPE_ECHO;
        let _: u32 = ACTION_TYPE_CALL;
        let _: u32 = ACTION_TYPE_TRANSFER_ERC20;
        let _: u32 = ACTION_TYPE_NO_OP;
    }
}
