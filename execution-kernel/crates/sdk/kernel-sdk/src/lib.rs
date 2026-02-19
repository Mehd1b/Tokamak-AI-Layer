//! Canonical Agent SDK for zkVM Guest Execution
//!
//! This crate provides the minimal, stable interface for developing agents
//! that execute inside the zkVM guest. It enforces a strict boundary between
//! untrusted agent code and trusted kernel/constraint logic.
//!
//! # Design Principles
//!
//! 1. **Stability** - The interface is versioned and backwards-compatible
//! 2. **Minimalism** - Agents receive only what they strictly need
//! 3. **Isolation** - Agents cannot access forbidden APIs or kernel internals
//! 4. **Determinism** - Agent execution must be fully deterministic
//! 5. **Auditability** - Agent behavior must be inspectable and reproducible
//!
//! # SDK Structure
//!
//! - [`agent`] - Agent context and entrypoint definitions
//! - [`types`] - Action types, AgentOutput, and helper constructors
//! - [`math`] - Deterministic math helpers (checked arithmetic, basis points)
//! - [`bytes`] - Safe byte manipulation utilities
//!
//! # Canonical Entrypoint
//!
//! Every agent MUST expose exactly this function:
//!
//! ```ignore
//! #[no_mangle]
//! pub extern "Rust" fn agent_main(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput
//! ```
//!
//! - Uses `extern "Rust"` for safe ABI with Rust types
//! - The symbol name `agent_main` is fixed and mandatory
//! - No other entrypoints are recognized by the kernel
//! - Panics abort execution and invalidate the proof
//!
//! # Example Agent
//!
//! ```ignore
//! use kernel_sdk::prelude::*;
//!
//! #[no_mangle]
//! pub extern "Rust" fn agent_main(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
//!     // Echo the opaque inputs back as an action
//!     let action = echo_action(ctx.agent_id, opaque_inputs.to_vec());
//!
//!     // Build output with explicit, bounded allocation
//!     let mut actions = Vec::with_capacity(1);
//!     actions.push(action);
//!     AgentOutput { actions }
//! }
//! ```
//!
//! # Allowed Behavior
//!
//! Agents may use:
//! - Pure Rust logic (no unsafe unless carefully audited)
//! - Deterministic math (integer arithmetic only)
//! - Byte manipulation via SDK helpers
//! - Fixed-size or bounded collections
//!
//! # Forbidden Behavior
//!
//! Agents MUST NOT:
//! - Read system time (`std::time`)
//! - Generate randomness (`rand`)
//! - Perform I/O (`std::fs`, `std::net`)
//! - Call syscalls or host functions
//! - Access kernel internals
//! - Allocate unbounded memory
//!
//! The SDK is `#![no_std]` and `#![forbid(unsafe_code)]`, which prevents many
//! violations at compile time. Additional restrictions are enforced by the
//! guest runtime and zkVM execution environment.
//!
//! **Build requirements:** Agents should compile with `default-features = false`
//! and without `std`. CI should reject transitive `std` dependencies.
//!
//! # Versioning
//!
//! The agent interface is tied to `kernel_version`. Breaking changes
//! require a new major kernel version. Agents can check the version
//! via `ctx.kernel_version`.

#![cfg_attr(not(feature = "std"), no_std)]
#![forbid(unsafe_code)]
#![deny(clippy::std_instead_of_alloc)]
#![deny(clippy::std_instead_of_core)]

extern crate alloc;

// ============================================================================
// Public Modules
// ============================================================================

pub mod actions;
pub mod agent;
pub mod bytes;
pub mod math;
pub mod types;

#[cfg(any(test, feature = "testing"))]
pub mod testing;

// ============================================================================
// Prelude - Common Imports
// ============================================================================

/// Prelude module for convenient imports.
///
/// Use `use kernel_sdk::prelude::*;` to import common types and functions.
///
/// **Note:** The `vec![]` macro is intentionally NOT exported to discourage
/// unbounded allocations. Prefer:
/// - `Vec::with_capacity(n)` + `push()` for bounded, explicit allocations
/// - `Vec::from([a, b, c])` for small, fixed-size outputs
///
/// If you need `vec![]`, you can still use `alloc::vec![]` directly.
pub mod prelude {
    // Agent context + entrypoint type
    pub use crate::agent::{AgentContext, AgentEntrypoint};

    // Core types
    pub use crate::types::{
        ActionV1, AgentOutput, MAX_ACTIONS_PER_OUTPUT, MAX_ACTION_PAYLOAD_BYTES,
    };

    // Action type constants (re-exported from kernel-core)
    pub use crate::types::{ACTION_TYPE_CALL, ACTION_TYPE_NO_OP, ACTION_TYPE_TRANSFER_ERC20};

    #[cfg(any(test, feature = "testing"))]
    pub use crate::types::ACTION_TYPE_ECHO;

    // Action constructors
    pub use crate::types::{address_to_bytes32, call_action, no_op_action, transfer_erc20_action};

    #[cfg(any(test, feature = "testing"))]
    pub use crate::types::echo_action;

    // Math helpers (canonical primitives)
    pub use crate::math::{
        // Basis points
        apply_bps,
        calculate_bps,
        // Checked arithmetic
        checked_add_u64,
        checked_div_u64,
        checked_mul_div_u64,
        checked_mul_u64,
        checked_sub_u64,
        drawdown_bps,
        // Saturating arithmetic
        saturating_add_u64,
        saturating_mul_u64,
        saturating_sub_u64,
        BPS_DENOMINATOR,
    };

    // Byte helpers (fixed offset)
    pub use crate::bytes::{
        is_zero_bytes32, read_bytes20, read_bytes32, read_slice, read_u16_le, read_u32_le,
        read_u64_le, read_u8,
    };

    // Byte helpers (cursor-style)
    pub use crate::bytes::{
        read_bool_u8_at, read_bytes20_at, read_bytes32_at, read_slice_at, read_u16_le_at,
        read_u32_le_at, read_u64_le_at, read_u8_at,
    };

    // Action builder
    pub use crate::actions::CallBuilder;

    // Re-export Vec for no_std agent code
    // Note: vec![] macro intentionally not exported to discourage unbounded allocations
    pub use alloc::vec::Vec;
}

// ============================================================================
// Re-exports at Crate Root
// ============================================================================

pub use agent::{AgentContext, AgentEntrypoint};
pub use types::{ActionV1, AgentOutput};

// ============================================================================
// Agent Input Macro
// ============================================================================

/// Declarative macro that generates a struct with a `decode()` method
/// for parsing fixed-size agent inputs from opaque byte slices.
///
/// This eliminates 30-100 lines of manual byte parsing that agents
/// typically need to write.
///
/// # Supported Types
///
/// | Type | Size | Reader |
/// |------|------|--------|
/// | `u8` | 1 | `read_u8_at` |
/// | `u16` | 2 | `read_u16_le_at` |
/// | `u32` | 4 | `read_u32_le_at` |
/// | `u64` | 8 | `read_u64_le_at` |
/// | `bool` | 1 | `read_bool_u8_at` |
/// | `[u8; 20]` | 20 | `read_bytes20_at` |
/// | `[u8; 32]` | 32 | `read_bytes32_at` |
///
/// # Example
///
/// ```ignore
/// kernel_sdk::agent_input! {
///     struct MarketInput {
///         lending_pool: [u8; 20],
///         asset_token: [u8; 20],
///         vault_address: [u8; 20],
///         vault_balance: u64,
///         supply_rate_bps: u32,
///         action_flag: u8,
///     }
/// }
///
/// // Generated:
/// // - MarketInput::ENCODED_SIZE == 73
/// // - MarketInput::decode(bytes) -> Option<MarketInput>
/// ```
#[macro_export]
macro_rules! agent_input {
    (
        struct $name:ident {
            $( $field:ident : $ty:tt ),* $(,)?
        }
    ) => {
        struct $name {
            $( $field: $crate::_agent_input_field_type!($ty), )*
        }

        impl $name {
            pub const ENCODED_SIZE: usize = 0 $( + $crate::_agent_input_field_size!($ty) )*;

            pub fn decode(bytes: &[u8]) -> Option<Self> {
                if bytes.len() != Self::ENCODED_SIZE {
                    return None;
                }
                let mut offset = 0usize;
                $(
                    let $field = $crate::_agent_input_read!($ty, bytes, offset)?;
                )*
                Some(Self { $( $field, )* })
            }

            /// Encode this struct into canonical bytes (inverse of `decode`).
            pub fn encode(&self) -> alloc::vec::Vec<u8> {
                let mut buf = alloc::vec::Vec::with_capacity(Self::ENCODED_SIZE);
                $( $crate::_agent_input_write!($ty, &mut buf, &self.$field); )*
                buf
            }
        }
    };
}

/// Internal helper macro: map syntax token to Rust type.
#[macro_export]
#[doc(hidden)]
macro_rules! _agent_input_field_type {
    (u8)        => { u8 };
    (u16)       => { u16 };
    (u32)       => { u32 };
    (u64)       => { u64 };
    (bool)      => { bool };
    ([u8; 20])  => { [u8; 20] };
    ([u8; 32])  => { [u8; 32] };
}

/// Internal helper macro: map syntax token to byte size.
#[macro_export]
#[doc(hidden)]
macro_rules! _agent_input_field_size {
    (u8)        => { 1 };
    (u16)       => { 2 };
    (u32)       => { 4 };
    (u64)       => { 8 };
    (bool)      => { 1 };
    ([u8; 20])  => { 20 };
    ([u8; 32])  => { 32 };
}

/// Internal helper macro: map syntax token to reader call.
#[macro_export]
#[doc(hidden)]
macro_rules! _agent_input_read {
    (u8,        $bytes:expr, $offset:ident) => { $crate::bytes::read_u8_at($bytes, &mut $offset) };
    (u16,       $bytes:expr, $offset:ident) => { $crate::bytes::read_u16_le_at($bytes, &mut $offset) };
    (u32,       $bytes:expr, $offset:ident) => { $crate::bytes::read_u32_le_at($bytes, &mut $offset) };
    (u64,       $bytes:expr, $offset:ident) => { $crate::bytes::read_u64_le_at($bytes, &mut $offset) };
    (bool,      $bytes:expr, $offset:ident) => { $crate::bytes::read_bool_u8_at($bytes, &mut $offset) };
    ([u8; 20],  $bytes:expr, $offset:ident) => { $crate::bytes::read_bytes20_at($bytes, &mut $offset) };
    ([u8; 32],  $bytes:expr, $offset:ident) => { $crate::bytes::read_bytes32_at($bytes, &mut $offset) };
}

/// Internal helper macro: map syntax token to writer call.
#[macro_export]
#[doc(hidden)]
macro_rules! _agent_input_write {
    (u8,        $buf:expr, $val:expr) => { $buf.push(*$val) };
    (u16,       $buf:expr, $val:expr) => { $buf.extend_from_slice(&$val.to_le_bytes()) };
    (u32,       $buf:expr, $val:expr) => { $buf.extend_from_slice(&$val.to_le_bytes()) };
    (u64,       $buf:expr, $val:expr) => { $buf.extend_from_slice(&$val.to_le_bytes()) };
    (bool,      $buf:expr, $val:expr) => { $buf.push(if *$val { 0x01 } else { 0x00 }) };
    ([u8; 20],  $buf:expr, $val:expr) => { $buf.extend_from_slice($val) };
    ([u8; 32],  $buf:expr, $val:expr) => { $buf.extend_from_slice($val) };
}

// ============================================================================
// Agent Entrypoint Macro
// ============================================================================

/// Generate kernel binding code for an agent crate, eliminating the need for
/// a separate "binding" / "wrapper" crate.
///
/// This macro generates:
/// - A wrapper struct implementing `kernel_guest::AgentEntrypoint`
/// - `pub fn kernel_main(input: &[u8]) -> Result<Vec<u8>, KernelError>`
/// - `pub fn kernel_main_with_constraints(input: &[u8], cs: &ConstraintSetV1) -> Result<Vec<u8>, KernelError>`
/// - Re-export of `KernelError`
///
/// # Requirements
///
/// The calling crate's `Cargo.toml` must include:
/// - `kernel-guest` dependency
/// - `constraints` dependency
///
/// # Usage
///
/// ```ignore
/// // In your agent crate's lib.rs, after defining agent_main:
/// kernel_sdk::agent_entrypoint!(agent_main);
/// ```
#[macro_export]
macro_rules! agent_entrypoint {
    ($agent_fn:ident) => {
        struct __KernelAgentWrapper;

        impl ::kernel_guest::AgentEntrypoint for __KernelAgentWrapper {
            fn code_hash(&self) -> [u8; 32] {
                AGENT_CODE_HASH
            }

            fn run(
                &self,
                ctx: &$crate::agent::AgentContext,
                opaque_inputs: &[u8],
            ) -> $crate::types::AgentOutput {
                $agent_fn(ctx, opaque_inputs)
            }
        }

        /// Execute kernel with this agent.
        pub fn kernel_main(
            input_bytes: &[u8],
        ) -> ::core::result::Result<::alloc::vec::Vec<u8>, ::kernel_guest::KernelError> {
            ::kernel_guest::kernel_main_with_agent(input_bytes, &__KernelAgentWrapper)
        }

        /// Execute kernel with this agent and custom constraints.
        pub fn kernel_main_with_constraints(
            input_bytes: &[u8],
            constraint_set: &::constraints::ConstraintSetV1,
        ) -> ::core::result::Result<::alloc::vec::Vec<u8>, ::kernel_guest::KernelError> {
            ::kernel_guest::kernel_main_with_agent_and_constraints(
                input_bytes,
                &__KernelAgentWrapper,
                constraint_set,
            )
        }

        /// Re-export KernelError for convenience.
        pub use ::kernel_guest::KernelError;
    };
}

// ============================================================================
// SDK Version
// ============================================================================

/// SDK major version.
pub const SDK_VERSION_MAJOR: u8 = 0;

/// SDK minor version.
pub const SDK_VERSION_MINOR: u8 = 1;

/// SDK patch version.
pub const SDK_VERSION_PATCH: u8 = 0;

/// SDK version (major.minor.patch encoded as u32).
///
/// Format: `(major << 16) | (minor << 8) | patch`
pub const SDK_VERSION: u32 = ((SDK_VERSION_MAJOR as u32) << 16)
    | ((SDK_VERSION_MINOR as u32) << 8)
    | (SDK_VERSION_PATCH as u32);

/// Minimum supported kernel version.
pub const MIN_KERNEL_VERSION: u32 = 1;

/// Maximum supported kernel version.
pub const MAX_KERNEL_VERSION: u32 = 1;

/// Check if a kernel version is supported by this SDK.
#[inline]
pub fn is_kernel_version_supported(version: u32) -> bool {
    version >= MIN_KERNEL_VERSION && version <= MAX_KERNEL_VERSION
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sdk_version() {
        assert_eq!(SDK_VERSION, 0x00_01_00);
        assert_eq!(SDK_VERSION_MAJOR, 0);
        assert_eq!(SDK_VERSION_MINOR, 1);
        assert_eq!(SDK_VERSION_PATCH, 0);
    }

    #[test]
    fn test_kernel_version_supported() {
        assert!(is_kernel_version_supported(1));
        assert!(!is_kernel_version_supported(0));
        assert!(!is_kernel_version_supported(2));
    }

    // ====================================================================
    // agent_input! macro tests
    // ====================================================================

    agent_input! {
        struct TestInput {
            addr1: [u8; 20],
            addr2: [u8; 20],
            amount: u64,
            rate: u32,
            flag: u8,
        }
    }

    #[test]
    fn test_agent_input_encoded_size() {
        // 20 + 20 + 8 + 4 + 1 = 53
        assert_eq!(TestInput::ENCODED_SIZE, 53);
    }

    #[test]
    fn test_agent_input_decode_roundtrip() {
        let mut input = alloc::vec::Vec::with_capacity(53);
        input.extend_from_slice(&[0x11u8; 20]); // addr1
        input.extend_from_slice(&[0x22u8; 20]); // addr2
        input.extend_from_slice(&42u64.to_le_bytes()); // amount
        input.extend_from_slice(&100u32.to_le_bytes()); // rate
        input.push(0x01); // flag

        let parsed = TestInput::decode(&input).unwrap();
        assert_eq!(parsed.addr1, [0x11u8; 20]);
        assert_eq!(parsed.addr2, [0x22u8; 20]);
        assert_eq!(parsed.amount, 42);
        assert_eq!(parsed.rate, 100);
        assert_eq!(parsed.flag, 1);
    }

    #[test]
    fn test_agent_input_decode_wrong_size() {
        let short = alloc::vec![0u8; 10];
        assert!(TestInput::decode(&short).is_none());

        let long = alloc::vec![0u8; 100];
        assert!(TestInput::decode(&long).is_none());
    }

    // Test with all supported types
    agent_input! {
        struct AllTypesInput {
            val_u8: u8,
            val_u16: u16,
            val_u32: u32,
            val_u64: u64,
            val_bool: bool,
            val_bytes20: [u8; 20],
            val_bytes32: [u8; 32],
        }
    }

    #[test]
    fn test_agent_input_all_types_size() {
        // 1 + 2 + 4 + 8 + 1 + 20 + 32 = 68
        assert_eq!(AllTypesInput::ENCODED_SIZE, 68);
    }

    #[test]
    fn test_agent_input_all_types_decode() {
        let mut input = alloc::vec::Vec::with_capacity(68);
        input.push(0x42);                               // u8
        input.extend_from_slice(&0x1234u16.to_le_bytes()); // u16
        input.extend_from_slice(&0xDEADBEEFu32.to_le_bytes()); // u32
        input.extend_from_slice(&0x123456789ABCDEFu64.to_le_bytes()); // u64
        input.push(0x01);                               // bool = true
        input.extend_from_slice(&[0xAAu8; 20]);         // bytes20
        input.extend_from_slice(&[0xBBu8; 32]);         // bytes32

        let parsed = AllTypesInput::decode(&input).unwrap();
        assert_eq!(parsed.val_u8, 0x42);
        assert_eq!(parsed.val_u16, 0x1234);
        assert_eq!(parsed.val_u32, 0xDEADBEEF);
        assert_eq!(parsed.val_u64, 0x123456789ABCDEF);
        assert_eq!(parsed.val_bool, true);
        assert_eq!(parsed.val_bytes20, [0xAAu8; 20]);
        assert_eq!(parsed.val_bytes32, [0xBBu8; 32]);
    }

    // Reproduce the exact defi-yield-farmer MarketInput
    agent_input! {
        struct DefiMarketInput {
            lending_pool: [u8; 20],
            asset_token: [u8; 20],
            vault_address: [u8; 20],
            vault_balance: u64,
            supplied_amount: u64,
            supply_rate_bps: u32,
            min_supply_rate_bps: u32,
            target_utilization_bps: u32,
            action_flag: u8,
        }
    }

    #[test]
    fn test_agent_input_defi_market_size() {
        // 20*3 + 8*2 + 4*3 + 1 = 60 + 16 + 12 + 1 = 89
        assert_eq!(DefiMarketInput::ENCODED_SIZE, 89);
    }

    #[test]
    fn test_agent_input_defi_market_decode() {
        let mut input = alloc::vec::Vec::with_capacity(89);
        input.extend_from_slice(&[0x11u8; 20]); // lending_pool
        input.extend_from_slice(&[0x22u8; 20]); // asset_token
        input.extend_from_slice(&[0x33u8; 20]); // vault_address
        input.extend_from_slice(&1_000_000u64.to_le_bytes()); // vault_balance
        input.extend_from_slice(&500_000u64.to_le_bytes());   // supplied_amount
        input.extend_from_slice(&500u32.to_le_bytes());        // supply_rate_bps
        input.extend_from_slice(&200u32.to_le_bytes());        // min_supply_rate_bps
        input.extend_from_slice(&8000u32.to_le_bytes());       // target_utilization_bps
        input.push(0);                                          // action_flag

        let parsed = DefiMarketInput::decode(&input).unwrap();
        assert_eq!(parsed.lending_pool, [0x11u8; 20]);
        assert_eq!(parsed.asset_token, [0x22u8; 20]);
        assert_eq!(parsed.vault_address, [0x33u8; 20]);
        assert_eq!(parsed.vault_balance, 1_000_000);
        assert_eq!(parsed.supplied_amount, 500_000);
        assert_eq!(parsed.supply_rate_bps, 500);
        assert_eq!(parsed.min_supply_rate_bps, 200);
        assert_eq!(parsed.target_utilization_bps, 8000);
        assert_eq!(parsed.action_flag, 0);
    }

    // ====================================================================
    // agent_input! encode() roundtrip tests
    // ====================================================================

    #[test]
    fn test_agent_input_encode_roundtrip() {
        let mut input = alloc::vec::Vec::with_capacity(53);
        input.extend_from_slice(&[0x11u8; 20]); // addr1
        input.extend_from_slice(&[0x22u8; 20]); // addr2
        input.extend_from_slice(&42u64.to_le_bytes()); // amount
        input.extend_from_slice(&100u32.to_le_bytes()); // rate
        input.push(0x01); // flag

        let parsed = TestInput::decode(&input).unwrap();
        let re_encoded = parsed.encode();
        assert_eq!(re_encoded, input);

        // Decode again to verify full roundtrip
        let re_parsed = TestInput::decode(&re_encoded).unwrap();
        assert_eq!(re_parsed.addr1, parsed.addr1);
        assert_eq!(re_parsed.addr2, parsed.addr2);
        assert_eq!(re_parsed.amount, parsed.amount);
        assert_eq!(re_parsed.rate, parsed.rate);
        assert_eq!(re_parsed.flag, parsed.flag);
    }

    #[test]
    fn test_agent_input_all_types_encode_roundtrip() {
        let mut input = alloc::vec::Vec::with_capacity(68);
        input.push(0x42);                               // u8
        input.extend_from_slice(&0x1234u16.to_le_bytes()); // u16
        input.extend_from_slice(&0xDEADBEEFu32.to_le_bytes()); // u32
        input.extend_from_slice(&0x123456789ABCDEFu64.to_le_bytes()); // u64
        input.push(0x01);                               // bool = true
        input.extend_from_slice(&[0xAAu8; 20]);         // bytes20
        input.extend_from_slice(&[0xBBu8; 32]);         // bytes32

        let parsed = AllTypesInput::decode(&input).unwrap();
        let re_encoded = parsed.encode();
        assert_eq!(re_encoded, input);
    }

    #[test]
    fn test_agent_input_bool_false_encode_roundtrip() {
        let mut input = alloc::vec::Vec::with_capacity(68);
        input.push(0x00);                               // u8
        input.extend_from_slice(&0u16.to_le_bytes());   // u16
        input.extend_from_slice(&0u32.to_le_bytes());   // u32
        input.extend_from_slice(&0u64.to_le_bytes());   // u64
        input.push(0x00);                               // bool = false
        input.extend_from_slice(&[0x00u8; 20]);         // bytes20
        input.extend_from_slice(&[0x00u8; 32]);         // bytes32

        let parsed = AllTypesInput::decode(&input).unwrap();
        assert_eq!(parsed.val_bool, false);
        let re_encoded = parsed.encode();
        assert_eq!(re_encoded, input);
    }

    #[test]
    fn test_agent_input_defi_market_encode_roundtrip() {
        let mut input = alloc::vec::Vec::with_capacity(89);
        input.extend_from_slice(&[0x11u8; 20]);
        input.extend_from_slice(&[0x22u8; 20]);
        input.extend_from_slice(&[0x33u8; 20]);
        input.extend_from_slice(&1_000_000u64.to_le_bytes());
        input.extend_from_slice(&500_000u64.to_le_bytes());
        input.extend_from_slice(&500u32.to_le_bytes());
        input.extend_from_slice(&200u32.to_le_bytes());
        input.extend_from_slice(&8000u32.to_le_bytes());
        input.push(0);

        let parsed = DefiMarketInput::decode(&input).unwrap();
        let re_encoded = parsed.encode();
        assert_eq!(re_encoded, input);
    }

    /// Ensure all prelude exports compile and are accessible.
    /// This catches accidental rename/missing export regressions.
    #[test]
    fn test_prelude_imports_compile() {
        #[allow(unused_imports)]
        use crate::prelude::*;

        // Verify key types are accessible with 2-arg signature
        fn _check_types() {
            let _: fn(&AgentContext, &[u8]) -> AgentOutput = |_, _| AgentOutput {
                actions: Vec::new(),
            };
        }
    }
}
