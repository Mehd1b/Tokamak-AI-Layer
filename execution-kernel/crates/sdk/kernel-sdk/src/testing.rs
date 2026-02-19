//! Testing utilities for agent and kernel development.
//!
//! This module provides ergonomic helpers that reduce test boilerplate from
//! ~30 lines to ~5 lines per test case.
//!
//! # Quick Start
//!
//! ```ignore
//! use kernel_sdk::testing::*;
//!
//! #[test]
//! fn test_my_agent() {
//!     let result = TestHarness::new()
//!         .agent_id(bytes32("0x42"))
//!         .input(my_input.encode())
//!         .execute(agent_main);
//!
//!     result.assert_action_count(1);
//!     result.assert_action_type(0, ACTION_TYPE_CALL);
//! }
//! ```

use alloc::vec::Vec;
use crate::agent::AgentContext;
use crate::types::{ActionV1, AgentOutput};
use kernel_core::{
    CanonicalDecode, CanonicalEncode, ExecutionStatus, KernelError, KernelInputV1,
    KernelJournalV1,
};

// ============================================================================
// Hex Helpers
// ============================================================================

/// Convert an ASCII hex character to its nibble value.
fn hex_val(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        b'A'..=b'F' => c - b'A' + 10,
        _ => panic!("invalid hex character"),
    }
}

/// Parse arbitrary hex string into bytes.
///
/// Accepts optional "0x" prefix. Input must have even length after prefix removal.
///
/// # Panics
///
/// Panics if the input contains non-hex characters or has odd length.
///
/// # Example
///
/// ```ignore
/// let bytes = hex_bytes("0xDEADBEEF");
/// assert_eq!(bytes, vec![0xDE, 0xAD, 0xBE, 0xEF]);
/// ```
pub fn hex_bytes(hex: &str) -> Vec<u8> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    assert!(hex.len() % 2 == 0, "hex string must have even length");
    let bytes = hex.as_bytes();
    let mut result = Vec::with_capacity(hex.len() / 2);
    for chunk in bytes.chunks(2) {
        result.push((hex_val(chunk[0]) << 4) | hex_val(chunk[1]));
    }
    result
}

/// Parse hex string into a 20-byte address.
///
/// Accepts optional "0x" prefix. Right-pads with zeros if input is shorter
/// than 20 bytes, truncates if longer.
///
/// # Example
///
/// ```ignore
/// let address = addr("0x1111111111111111111111111111111111111111");
/// ```
pub fn addr(hex: &str) -> [u8; 20] {
    let bytes = hex_bytes(hex);
    let mut result = [0u8; 20];
    let len = bytes.len().min(20);
    result[..len].copy_from_slice(&bytes[..len]);
    result
}

/// Parse hex string into a 32-byte array.
///
/// Accepts optional "0x" prefix. Right-pads with zeros if input is shorter
/// than 32 bytes, truncates if longer.
///
/// # Example
///
/// ```ignore
/// let id = bytes32("0x4242424242424242424242424242424242424242424242424242424242424242");
/// ```
pub fn bytes32(hex: &str) -> [u8; 32] {
    let bytes = hex_bytes(hex);
    let mut result = [0u8; 32];
    let len = bytes.len().min(32);
    result[..len].copy_from_slice(&bytes[..len]);
    result
}

// ============================================================================
// ContextBuilder
// ============================================================================

/// Builder for `AgentContext` with sensible test defaults.
///
/// Default values:
/// - `protocol_version`: 1
/// - `kernel_version`: 1
/// - `agent_id`: `[0x42; 32]`
/// - `agent_code_hash`: `[0; 32]`
/// - `constraint_set_hash`: `[0; 32]`
/// - `input_root`: `[0; 32]`
/// - `execution_nonce`: 1
pub struct ContextBuilder {
    protocol_version: u32,
    kernel_version: u32,
    agent_id: [u8; 32],
    agent_code_hash: [u8; 32],
    constraint_set_hash: [u8; 32],
    input_root: [u8; 32],
    execution_nonce: u64,
}

impl ContextBuilder {
    /// Create a new ContextBuilder with sensible test defaults.
    pub fn new() -> Self {
        Self {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42; 32],
            agent_code_hash: [0; 32],
            constraint_set_hash: [0; 32],
            input_root: [0; 32],
            execution_nonce: 1,
        }
    }

    /// Set the agent ID.
    pub fn agent_id(mut self, id: [u8; 32]) -> Self {
        self.agent_id = id;
        self
    }

    /// Set the agent code hash.
    pub fn code_hash(mut self, hash: [u8; 32]) -> Self {
        self.agent_code_hash = hash;
        self
    }

    /// Set the execution nonce.
    pub fn nonce(mut self, n: u64) -> Self {
        self.execution_nonce = n;
        self
    }

    /// Set the input root.
    pub fn input_root(mut self, root: [u8; 32]) -> Self {
        self.input_root = root;
        self
    }

    /// Set the constraint set hash.
    pub fn constraint_set_hash(mut self, hash: [u8; 32]) -> Self {
        self.constraint_set_hash = hash;
        self
    }

    /// Build the `AgentContext`.
    pub fn build(self) -> AgentContext {
        AgentContext::new(
            self.protocol_version,
            self.kernel_version,
            self.agent_id,
            self.agent_code_hash,
            self.constraint_set_hash,
            self.input_root,
            self.execution_nonce,
        )
    }
}

impl Default for ContextBuilder {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// TestHarness
// ============================================================================

/// Main test harness for executing agents and kernels with minimal boilerplate.
///
/// # Example
///
/// ```ignore
/// let result = TestHarness::new()
///     .agent_id([0x42; 32])
///     .input(market_input.encode())
///     .execute(agent_main);
///
/// result.assert_action_count(2);
/// ```
pub struct TestHarness {
    ctx: ContextBuilder,
    opaque_input: Vec<u8>,
}

impl TestHarness {
    /// Create a new TestHarness with default context and empty input.
    pub fn new() -> Self {
        Self {
            ctx: ContextBuilder::new(),
            opaque_input: Vec::new(),
        }
    }

    /// Set the agent ID.
    pub fn agent_id(mut self, id: [u8; 32]) -> Self {
        self.ctx = self.ctx.agent_id(id);
        self
    }

    /// Set the agent code hash.
    pub fn code_hash(mut self, hash: [u8; 32]) -> Self {
        self.ctx = self.ctx.code_hash(hash);
        self
    }

    /// Set the execution nonce.
    pub fn nonce(mut self, n: u64) -> Self {
        self.ctx = self.ctx.nonce(n);
        self
    }

    /// Set the input root.
    pub fn input_root(mut self, root: [u8; 32]) -> Self {
        self.ctx = self.ctx.input_root(root);
        self
    }

    /// Set the opaque agent input bytes.
    pub fn input(mut self, bytes: impl AsRef<[u8]>) -> Self {
        self.opaque_input = bytes.as_ref().to_vec();
        self
    }

    /// Execute an agent function directly and return a `TestResult`.
    ///
    /// This calls the agent function with a constructed `AgentContext` and
    /// the configured input bytes.
    pub fn execute(self, agent_fn: fn(&AgentContext, &[u8]) -> AgentOutput) -> TestResult {
        let context = self.ctx.build();
        let output = agent_fn(&context, &self.opaque_input);
        TestResult {
            output,
            context,
            input_bytes: self.opaque_input,
        }
    }

    /// Execute a kernel function and return a `KernelTestResult`.
    ///
    /// Builds a `KernelInputV1`, encodes it, calls the kernel function,
    /// and decodes the resulting journal.
    pub fn execute_kernel(
        self,
        kernel_fn: fn(&[u8]) -> Result<Vec<u8>, KernelError>,
    ) -> KernelTestResult {
        let input = KernelInputV1 {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: self.ctx.agent_id,
            agent_code_hash: self.ctx.agent_code_hash,
            constraint_set_hash: self.ctx.constraint_set_hash,
            input_root: self.ctx.input_root,
            execution_nonce: self.ctx.execution_nonce,
            opaque_agent_inputs: self.opaque_input,
        };

        let input_bytes = input
            .encode()
            .expect("TestHarness: failed to encode KernelInputV1");

        let journal_bytes = kernel_fn(&input_bytes)
            .expect("TestHarness: kernel_fn returned error");

        let journal = KernelJournalV1::decode(&journal_bytes)
            .expect("TestHarness: failed to decode KernelJournalV1");

        KernelTestResult {
            journal,
            journal_bytes,
            input,
            input_bytes,
        }
    }

    /// Execute a kernel function with custom constraints and return a `KernelTestResult`.
    pub fn execute_kernel_with_constraints(
        self,
        kernel_fn: fn(&[u8], &constraints::ConstraintSetV1) -> Result<Vec<u8>, KernelError>,
        constraint_set: &constraints::ConstraintSetV1,
    ) -> KernelTestResult {
        let input = KernelInputV1 {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: self.ctx.agent_id,
            agent_code_hash: self.ctx.agent_code_hash,
            constraint_set_hash: self.ctx.constraint_set_hash,
            input_root: self.ctx.input_root,
            execution_nonce: self.ctx.execution_nonce,
            opaque_agent_inputs: self.opaque_input,
        };

        let input_bytes = input
            .encode()
            .expect("TestHarness: failed to encode KernelInputV1");

        let journal_bytes = kernel_fn(&input_bytes, constraint_set)
            .expect("TestHarness: kernel_fn returned error");

        let journal = KernelJournalV1::decode(&journal_bytes)
            .expect("TestHarness: failed to decode KernelJournalV1");

        KernelTestResult {
            journal,
            journal_bytes,
            input,
            input_bytes,
        }
    }
}

impl Default for TestHarness {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// TestResult (agent-level)
// ============================================================================

/// Result of executing an agent function via `TestHarness::execute()`.
pub struct TestResult {
    /// The agent's output.
    pub output: AgentOutput,
    /// The context that was passed to the agent.
    pub context: AgentContext,
    /// The raw input bytes that were passed to the agent.
    pub input_bytes: Vec<u8>,
}

impl TestResult {
    /// Number of actions in the output.
    pub fn action_count(&self) -> usize {
        self.output.actions.len()
    }

    /// Get a reference to the action at the given index.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds.
    pub fn action(&self, index: usize) -> &ActionV1 {
        &self.output.actions[index]
    }

    /// Check if the output has no actions.
    pub fn is_empty(&self) -> bool {
        self.output.actions.is_empty()
    }

    /// Get all actions with the given action type.
    pub fn actions_of_type(&self, action_type: u32) -> Vec<&ActionV1> {
        self.output
            .actions
            .iter()
            .filter(|a| a.action_type == action_type)
            .collect()
    }

    // ========================================================================
    // Assertion Helpers
    // ========================================================================

    /// Assert that the output contains exactly `n` actions.
    ///
    /// # Panics
    ///
    /// Panics with a descriptive message if the count doesn't match.
    pub fn assert_action_count(&self, n: usize) {
        assert_eq!(
            self.output.actions.len(),
            n,
            "expected {} actions, got {}",
            n,
            self.output.actions.len()
        );
    }

    /// Assert that the action at `index` has the expected action type.
    ///
    /// # Panics
    ///
    /// Panics if the action type doesn't match or index is out of bounds.
    pub fn assert_action_type(&self, index: usize, expected: u32) {
        let actual = self.output.actions[index].action_type;
        assert_eq!(
            actual, expected,
            "action[{}]: expected type 0x{:08x}, got 0x{:08x}",
            index, expected, actual
        );
    }

    /// Assert that the action at `index` targets the given 20-byte address.
    ///
    /// The target is compared as a left-padded bytes32.
    pub fn assert_target(&self, index: usize, address: &[u8; 20]) {
        let mut expected = [0u8; 32];
        expected[12..32].copy_from_slice(address);
        assert_eq!(
            self.output.actions[index].target, expected,
            "action[{}]: target mismatch",
            index
        );
    }

    /// Assert that the output has no actions.
    pub fn assert_empty(&self) {
        assert!(
            self.output.actions.is_empty(),
            "expected empty output, got {} actions",
            self.output.actions.len()
        );
    }

    /// Assert determinism: running the same agent function again produces identical output.
    pub fn assert_deterministic(&self, agent_fn: fn(&AgentContext, &[u8]) -> AgentOutput) {
        let output2 = agent_fn(&self.context, &self.input_bytes);
        assert_eq!(
            self.output, output2,
            "agent is not deterministic: outputs differ on re-execution"
        );
    }

    /// Assert that the action at `index` has the expected payload.
    pub fn assert_payload(&self, index: usize, expected: &[u8]) {
        assert_eq!(
            self.output.actions[index].payload, expected,
            "action[{}]: payload mismatch",
            index
        );
    }
}

// ============================================================================
// Snapshot Testing (behind std feature)
// ============================================================================

#[cfg(feature = "std")]
impl TestResult {
    /// Assert that the output matches a saved snapshot.
    ///
    /// On first run, creates the snapshot file. On subsequent runs, compares
    /// against the saved snapshot. Set `BLESS=1` to update snapshots.
    ///
    /// Snapshots are saved to `tests/snapshots/{name}.snap` relative to the
    /// crate root (determined by `CARGO_MANIFEST_DIR`).
    pub fn assert_snapshot(&self, name: &str) {
        let encoded = self
            .output
            .encode()
            .expect("failed to encode AgentOutput for snapshot");
        let hex = encode_hex(&encoded);
        let header = format!(
            "# Snapshot: {}\n# Action count: {}\n",
            name,
            self.output.actions.len()
        );
        let content = format!("{}{}\n", header, hex);

        assert_snapshot_impl(name, &content);
    }
}

// ============================================================================
// KernelTestResult (kernel-level)
// ============================================================================

/// Result of executing a kernel function via `TestHarness::execute_kernel()`.
pub struct KernelTestResult {
    /// The decoded journal.
    pub journal: KernelJournalV1,
    /// The raw journal bytes returned by the kernel.
    pub journal_bytes: Vec<u8>,
    /// The kernel input that was constructed.
    pub input: KernelInputV1,
    /// The raw input bytes that were passed to the kernel.
    pub input_bytes: Vec<u8>,
}

impl KernelTestResult {
    /// Get the execution status from the journal.
    pub fn status(&self) -> ExecutionStatus {
        self.journal.execution_status
    }

    /// Check if execution was successful.
    pub fn is_success(&self) -> bool {
        self.journal.execution_status == ExecutionStatus::Success
    }

    /// Check if execution failed (constraint violation).
    pub fn is_failure(&self) -> bool {
        self.journal.execution_status == ExecutionStatus::Failure
    }

    /// Get the action commitment from the journal.
    pub fn action_commitment(&self) -> [u8; 32] {
        self.journal.action_commitment
    }

    /// Get the input commitment from the journal.
    pub fn input_commitment(&self) -> [u8; 32] {
        self.journal.input_commitment
    }

    // ========================================================================
    // Assertion Helpers
    // ========================================================================

    /// Assert that execution was successful.
    pub fn assert_success(&self) {
        assert_eq!(
            self.journal.execution_status,
            ExecutionStatus::Success,
            "expected Success, got Failure"
        );
    }

    /// Assert that execution failed.
    pub fn assert_failure(&self) {
        assert_eq!(
            self.journal.execution_status,
            ExecutionStatus::Failure,
            "expected Failure, got Success"
        );
    }

    /// Assert determinism: running the same kernel function again produces identical output.
    pub fn assert_deterministic(
        &self,
        kernel_fn: fn(&[u8]) -> Result<Vec<u8>, KernelError>,
    ) {
        let journal_bytes2 = kernel_fn(&self.input_bytes)
            .expect("kernel_fn returned error on re-execution");
        assert_eq!(
            self.journal_bytes, journal_bytes2,
            "kernel is not deterministic: journal bytes differ on re-execution"
        );
    }

    /// Assert that the agent_id in the journal matches the expected value.
    pub fn assert_agent_id(&self, expected: &[u8; 32]) {
        assert_eq!(
            &self.journal.agent_id, expected,
            "journal agent_id mismatch"
        );
    }

    /// Assert that the nonce in the journal matches the expected value.
    pub fn assert_nonce(&self, expected: u64) {
        assert_eq!(
            self.journal.execution_nonce, expected,
            "journal nonce mismatch: expected {}, got {}",
            expected, self.journal.execution_nonce
        );
    }
}

#[cfg(feature = "std")]
impl KernelTestResult {
    /// Assert that the journal matches a saved snapshot.
    pub fn assert_snapshot(&self, name: &str) {
        let hex = encode_hex(&self.journal_bytes);
        let header = format!(
            "# Snapshot: {}\n# Status: {:?}\n",
            name, self.journal.execution_status
        );
        let content = format!("{}{}\n", header, hex);

        assert_snapshot_impl(name, &content);
    }
}

// ============================================================================
// Snapshot Implementation (std only)
// ============================================================================

#[cfg(feature = "std")]
fn encode_hex(bytes: &[u8]) -> alloc::string::String {
    use alloc::string::String;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use core::fmt::Write;
        write!(s, "{:02x}", b).unwrap();
    }
    s
}

#[cfg(feature = "std")]
fn assert_snapshot_impl(name: &str, content: &str) {
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let snap_dir = std::path::Path::new(&manifest_dir).join("tests").join("snapshots");
    let snap_path = snap_dir.join(format!("{}.snap", name));

    let bless = std::env::var("BLESS").map(|v| v == "1").unwrap_or(false);

    if snap_path.exists() && !bless {
        let saved = std::fs::read_to_string(&snap_path)
            .expect("failed to read snapshot file");
        if saved != content {
            panic!(
                "snapshot mismatch for '{}'\n\
                 --- saved ---\n{}\n\
                 --- actual ---\n{}\n\
                 Run with BLESS=1 to update snapshots.",
                name, saved, content
            );
        }
    } else {
        std::fs::create_dir_all(&snap_dir).expect("failed to create snapshots directory");
        std::fs::write(&snap_path, content).expect("failed to write snapshot file");
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{echo_action, ACTION_TYPE_ECHO, ACTION_TYPE_NO_OP};
    use crate::types::no_op_action;

    // ========================================================================
    // Hex Helper Tests
    // ========================================================================

    #[test]
    fn test_hex_bytes_basic() {
        assert_eq!(hex_bytes("DEADBEEF"), alloc::vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn test_hex_bytes_with_prefix() {
        assert_eq!(
            hex_bytes("0xDEADBEEF"),
            alloc::vec![0xDE, 0xAD, 0xBE, 0xEF]
        );
    }

    #[test]
    fn test_hex_bytes_lowercase() {
        assert_eq!(hex_bytes("0xdeadbeef"), alloc::vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn test_hex_bytes_empty() {
        assert_eq!(hex_bytes(""), alloc::vec![]);
        assert_eq!(hex_bytes("0x"), alloc::vec![]);
    }

    #[test]
    fn test_addr_basic() {
        let a = addr("0x1111111111111111111111111111111111111111");
        assert_eq!(a, [0x11; 20]);
    }

    #[test]
    fn test_addr_short_pads_with_zeros() {
        let a = addr("0xABCD");
        let mut expected = [0u8; 20];
        expected[0] = 0xAB;
        expected[1] = 0xCD;
        assert_eq!(a, expected);
    }

    #[test]
    fn test_bytes32_basic() {
        let b = bytes32("0x4242424242424242424242424242424242424242424242424242424242424242");
        assert_eq!(b, [0x42; 32]);
    }

    #[test]
    fn test_bytes32_short_pads() {
        let b = bytes32("0xFF");
        let mut expected = [0u8; 32];
        expected[0] = 0xFF;
        assert_eq!(b, expected);
    }

    // ========================================================================
    // ContextBuilder Tests
    // ========================================================================

    #[test]
    fn test_context_builder_defaults() {
        let ctx = ContextBuilder::new().build();
        assert_eq!(ctx.protocol_version, 1);
        assert_eq!(ctx.kernel_version, 1);
        assert_eq!(ctx.agent_id, [0x42; 32]);
        assert_eq!(ctx.agent_code_hash, [0; 32]);
        assert_eq!(ctx.constraint_set_hash, [0; 32]);
        assert_eq!(ctx.input_root, [0; 32]);
        assert_eq!(ctx.execution_nonce, 1);
    }

    #[test]
    fn test_context_builder_custom() {
        let ctx = ContextBuilder::new()
            .agent_id([0xAA; 32])
            .code_hash([0xBB; 32])
            .nonce(42)
            .input_root([0xCC; 32])
            .constraint_set_hash([0xDD; 32])
            .build();

        assert_eq!(ctx.agent_id, [0xAA; 32]);
        assert_eq!(ctx.agent_code_hash, [0xBB; 32]);
        assert_eq!(ctx.execution_nonce, 42);
        assert_eq!(ctx.input_root, [0xCC; 32]);
        assert_eq!(ctx.constraint_set_hash, [0xDD; 32]);
    }

    // ========================================================================
    // TestHarness + TestResult Tests
    // ========================================================================

    fn dummy_agent(_ctx: &AgentContext, _input: &[u8]) -> AgentOutput {
        AgentOutput {
            actions: alloc::vec![echo_action([0x42; 32], alloc::vec![1, 2, 3])],
        }
    }

    fn empty_agent(_ctx: &AgentContext, _input: &[u8]) -> AgentOutput {
        AgentOutput {
            actions: alloc::vec![],
        }
    }

    fn multi_agent(_ctx: &AgentContext, _input: &[u8]) -> AgentOutput {
        AgentOutput {
            actions: alloc::vec![
                echo_action([0x11; 32], alloc::vec![1]),
                no_op_action(),
                echo_action([0x22; 32], alloc::vec![2]),
            ],
        }
    }

    #[test]
    fn test_harness_execute_basic() {
        let result = TestHarness::new().execute(dummy_agent);

        assert_eq!(result.action_count(), 1);
        assert!(!result.is_empty());
        assert_eq!(result.action(0).action_type, ACTION_TYPE_ECHO);
    }

    #[test]
    fn test_harness_execute_empty() {
        let result = TestHarness::new().execute(empty_agent);

        assert_eq!(result.action_count(), 0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_harness_with_custom_context() {
        let result = TestHarness::new()
            .agent_id([0xAA; 32])
            .nonce(99)
            .execute(dummy_agent);

        assert_eq!(result.context.agent_id, [0xAA; 32]);
        assert_eq!(result.context.execution_nonce, 99);
    }

    #[test]
    fn test_harness_with_input() {
        fn input_echo_agent(_ctx: &AgentContext, input: &[u8]) -> AgentOutput {
            AgentOutput {
                actions: alloc::vec![echo_action([0; 32], input.to_vec())],
            }
        }

        let result = TestHarness::new()
            .input(&[0xAA, 0xBB, 0xCC])
            .execute(input_echo_agent);

        assert_eq!(result.action(0).payload, alloc::vec![0xAA, 0xBB, 0xCC]);
        assert_eq!(result.input_bytes, alloc::vec![0xAA, 0xBB, 0xCC]);
    }

    #[test]
    fn test_result_assert_action_count() {
        let result = TestHarness::new().execute(multi_agent);
        result.assert_action_count(3);
    }

    #[test]
    fn test_result_assert_action_type() {
        let result = TestHarness::new().execute(multi_agent);
        result.assert_action_type(0, ACTION_TYPE_ECHO);
        result.assert_action_type(1, ACTION_TYPE_NO_OP);
        result.assert_action_type(2, ACTION_TYPE_ECHO);
    }

    #[test]
    fn test_result_assert_empty() {
        let result = TestHarness::new().execute(empty_agent);
        result.assert_empty();
    }

    #[test]
    fn test_result_assert_deterministic() {
        let result = TestHarness::new().execute(dummy_agent);
        result.assert_deterministic(dummy_agent);
    }

    #[test]
    fn test_result_actions_of_type() {
        let result = TestHarness::new().execute(multi_agent);
        let echoes = result.actions_of_type(ACTION_TYPE_ECHO);
        assert_eq!(echoes.len(), 2);
        let nops = result.actions_of_type(ACTION_TYPE_NO_OP);
        assert_eq!(nops.len(), 1);
    }

    #[test]
    fn test_result_assert_target() {
        fn targeted_agent(_ctx: &AgentContext, _input: &[u8]) -> AgentOutput {
            let mut target = [0u8; 32];
            target[12..32].copy_from_slice(&[0x11; 20]);
            AgentOutput {
                actions: alloc::vec![echo_action(target, alloc::vec![])],
            }
        }

        let result = TestHarness::new().execute(targeted_agent);
        result.assert_target(0, &[0x11; 20]);
    }

    #[test]
    fn test_result_assert_payload() {
        let result = TestHarness::new().execute(dummy_agent);
        result.assert_payload(0, &[1, 2, 3]);
    }
}
