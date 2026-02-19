//! Fluent action builders for agent development.
//!
//! This module provides ergonomic helpers for constructing on-chain actions,
//! replacing manual ABI encoding with a type-safe builder pattern.
//!
//! # CallBuilder
//!
//! ```ignore
//! use kernel_sdk::actions::CallBuilder;
//!
//! let action = CallBuilder::new(pool_address)
//!     .selector(0x617ba037)
//!     .param_address(&asset_token)
//!     .param_u256_from_u64(amount)
//!     .param_address(&on_behalf_of)
//!     .param_u16(0)
//!     .build();
//! ```
//!
//! # ERC20 Helpers
//!
//! ```ignore
//! use kernel_sdk::actions::erc20;
//!
//! let approve = erc20::approve(&token, &spender, amount);
//! let transfer = erc20::transfer(&token, &to, amount);
//! ```

use alloc::vec::Vec;
use crate::types::{ActionV1, address_to_bytes32, call_action};

// ============================================================================
// CallBuilder
// ============================================================================

/// Fluent builder for CALL action calldata.
///
/// Constructs ABI-encoded calldata for contract calls, then wraps it
/// in an `ActionV1` via [`call_action()`].
///
/// All parameter methods encode values as 32-byte ABI words.
pub struct CallBuilder {
    target: [u8; 20],
    value: u128,
    calldata: Vec<u8>,
}

impl CallBuilder {
    /// Create a new CallBuilder targeting the given 20-byte address.
    #[inline]
    #[must_use]
    pub fn new(target: [u8; 20]) -> Self {
        Self {
            target,
            value: 0,
            calldata: Vec::new(),
        }
    }

    /// Append a 4-byte function selector (big-endian).
    #[inline]
    #[must_use]
    pub fn selector(mut self, sel: u32) -> Self {
        self.calldata.extend_from_slice(&sel.to_be_bytes());
        self
    }

    /// Append an address parameter (left-padded to 32 bytes).
    #[inline]
    #[must_use]
    pub fn param_address(mut self, addr: &[u8; 20]) -> Self {
        self.calldata.extend_from_slice(&address_to_bytes32(addr));
        self
    }

    /// Append a u256 parameter from a u64 value (big-endian, right-aligned in 32 bytes).
    #[inline]
    #[must_use]
    pub fn param_u256_from_u64(mut self, val: u64) -> Self {
        let mut word = [0u8; 32];
        word[24..32].copy_from_slice(&val.to_be_bytes());
        self.calldata.extend_from_slice(&word);
        self
    }

    /// Append a u256 parameter from a u128 value (big-endian, right-aligned in 32 bytes).
    #[inline]
    #[must_use]
    pub fn param_u256(mut self, val: u128) -> Self {
        let mut word = [0u8; 32];
        word[16..32].copy_from_slice(&val.to_be_bytes());
        self.calldata.extend_from_slice(&word);
        self
    }

    /// Append a bytes32 parameter.
    #[inline]
    #[must_use]
    pub fn param_bytes32(mut self, val: &[u8; 32]) -> Self {
        self.calldata.extend_from_slice(val);
        self
    }

    /// Append a bool parameter (0 or 1, right-aligned in 32 bytes).
    #[inline]
    #[must_use]
    pub fn param_bool(mut self, val: bool) -> Self {
        let mut word = [0u8; 32];
        if val {
            word[31] = 1;
        }
        self.calldata.extend_from_slice(&word);
        self
    }

    /// Append a u16 parameter (big-endian, right-aligned in 32 bytes).
    #[inline]
    #[must_use]
    pub fn param_u16(mut self, val: u16) -> Self {
        let mut word = [0u8; 32];
        word[30..32].copy_from_slice(&val.to_be_bytes());
        self.calldata.extend_from_slice(&word);
        self
    }

    /// Set the ETH value (in wei) to send with the call.
    #[inline]
    #[must_use]
    pub fn value(mut self, val: u128) -> Self {
        self.value = val;
        self
    }

    /// Build the final `ActionV1`.
    ///
    /// Uses [`call_action()`] internally, so the output is byte-identical
    /// to manually constructing the action.
    #[inline]
    #[must_use]
    pub fn build(self) -> ActionV1 {
        let target = address_to_bytes32(&self.target);
        call_action(target, self.value, &self.calldata)
    }
}

// ============================================================================
// ERC20 Helpers
// ============================================================================

/// Pre-built ERC20 action constructors.
///
/// Each function returns a complete `ActionV1` ready for inclusion
/// in `AgentOutput.actions`.
pub mod erc20 {
    use super::*;

    /// ERC20 approve function selector: `keccak256("approve(address,uint256)")[:4]`
    const APPROVE_SELECTOR: u32 = 0x095ea7b3;

    /// ERC20 transfer function selector: `keccak256("transfer(address,uint256)")[:4]`
    const TRANSFER_SELECTOR: u32 = 0xa9059cbb;

    /// ERC20 transferFrom function selector: `keccak256("transferFrom(address,address,uint256)")[:4]`
    const TRANSFER_FROM_SELECTOR: u32 = 0x23b872dd;

    /// Build an ERC20 `approve(spender, amount)` action.
    ///
    /// Targets the `token` contract.
    #[inline]
    #[must_use]
    pub fn approve(token: &[u8; 20], spender: &[u8; 20], amount: u64) -> ActionV1 {
        CallBuilder::new(*token)
            .selector(APPROVE_SELECTOR)
            .param_address(spender)
            .param_u256_from_u64(amount)
            .build()
    }

    /// Build an ERC20 `transfer(to, amount)` action.
    ///
    /// Targets the `token` contract.
    #[inline]
    #[must_use]
    pub fn transfer(token: &[u8; 20], to: &[u8; 20], amount: u64) -> ActionV1 {
        CallBuilder::new(*token)
            .selector(TRANSFER_SELECTOR)
            .param_address(to)
            .param_u256_from_u64(amount)
            .build()
    }

    /// Build an ERC20 `transferFrom(from, to, amount)` action.
    ///
    /// Targets the `token` contract.
    #[inline]
    #[must_use]
    pub fn transfer_from(
        token: &[u8; 20],
        from: &[u8; 20],
        to: &[u8; 20],
        amount: u64,
    ) -> ActionV1 {
        CallBuilder::new(*token)
            .selector(TRANSFER_FROM_SELECTOR)
            .param_address(from)
            .param_address(to)
            .param_u256_from_u64(amount)
            .build()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ACTION_TYPE_CALL;

    #[test]
    fn test_call_builder_basic() {
        let target = [0x11u8; 20];
        let action = CallBuilder::new(target)
            .selector(0xaabbccdd)
            .param_address(&[0x22u8; 20])
            .build();

        assert_eq!(action.action_type, ACTION_TYPE_CALL);
        assert_eq!(action.target, address_to_bytes32(&target));

        // Payload: 32 (value=0) + 32 (offset=64) + 32 (length) + padded calldata
        // calldata = 4 (selector) + 32 (address) = 36 bytes -> padded to 64
        assert_eq!(action.payload.len(), 96 + 64);

        // Check selector inside calldata (starts at byte 96)
        assert_eq!(&action.payload[96..100], &[0xaa, 0xbb, 0xcc, 0xdd]);
    }

    #[test]
    fn test_call_builder_with_value() {
        let action = CallBuilder::new([0x11u8; 20])
            .value(1_000_000)
            .build();

        assert_eq!(action.action_type, ACTION_TYPE_CALL);
        // Value should be in first 32 bytes of payload
        let mut expected_value = [0u8; 32];
        expected_value[16..32].copy_from_slice(&1_000_000u128.to_be_bytes());
        assert_eq!(&action.payload[0..32], &expected_value);
    }

    #[test]
    fn test_call_builder_param_u256_from_u64() {
        let action = CallBuilder::new([0x11u8; 20])
            .selector(0x12345678)
            .param_u256_from_u64(42)
            .build();

        // calldata starts at offset 96 in payload
        // selector is 4 bytes, param is 32 bytes = 36 bytes padded to 64
        let calldata_start = 96;
        // Skip selector (4 bytes), check u256 param
        let param_start = calldata_start + 4;
        let mut expected = [0u8; 32];
        expected[24..32].copy_from_slice(&42u64.to_be_bytes());
        assert_eq!(&action.payload[param_start..param_start + 32], &expected);
    }

    #[test]
    fn test_call_builder_param_u256() {
        let action = CallBuilder::new([0x11u8; 20])
            .selector(0x12345678)
            .param_u256(1000u128)
            .build();

        let calldata_start = 96;
        let param_start = calldata_start + 4;
        let mut expected = [0u8; 32];
        expected[16..32].copy_from_slice(&1000u128.to_be_bytes());
        assert_eq!(&action.payload[param_start..param_start + 32], &expected);
    }

    #[test]
    fn test_call_builder_param_bool() {
        let action = CallBuilder::new([0x11u8; 20])
            .selector(0x12345678)
            .param_bool(true)
            .build();

        let calldata_start = 96;
        let param_start = calldata_start + 4;
        let mut expected = [0u8; 32];
        expected[31] = 1;
        assert_eq!(&action.payload[param_start..param_start + 32], &expected);
    }

    #[test]
    fn test_call_builder_param_u16() {
        let action = CallBuilder::new([0x11u8; 20])
            .selector(0x12345678)
            .param_u16(0x1234)
            .build();

        let calldata_start = 96;
        let param_start = calldata_start + 4;
        let mut expected = [0u8; 32];
        expected[30..32].copy_from_slice(&0x1234u16.to_be_bytes());
        assert_eq!(&action.payload[param_start..param_start + 32], &expected);
    }

    #[test]
    fn test_call_builder_param_bytes32() {
        let val = [0xabu8; 32];
        let action = CallBuilder::new([0x11u8; 20])
            .selector(0x12345678)
            .param_bytes32(&val)
            .build();

        let calldata_start = 96;
        let param_start = calldata_start + 4;
        assert_eq!(&action.payload[param_start..param_start + 32], &val);
    }

    // ========================================================================
    // ERC20 Helper Tests
    // ========================================================================

    #[test]
    fn test_erc20_approve() {
        let token = [0x22u8; 20];
        let spender = [0x11u8; 20];
        let amount: u64 = 500_000;

        let action = erc20::approve(&token, &spender, amount);

        assert_eq!(action.action_type, ACTION_TYPE_CALL);
        assert_eq!(action.target, address_to_bytes32(&token));

        // Check approve selector: 0x095ea7b3
        assert_eq!(&action.payload[96..100], &[0x09, 0x5e, 0xa7, 0xb3]);

        // Check spender address (left-padded to 32 bytes)
        assert_eq!(&action.payload[100..112], &[0u8; 12]);
        assert_eq!(&action.payload[112..132], &spender);

        // Check amount (u64 as u256)
        let mut expected_amount = [0u8; 32];
        expected_amount[24..32].copy_from_slice(&amount.to_be_bytes());
        assert_eq!(&action.payload[132..164], &expected_amount);
    }

    #[test]
    fn test_erc20_transfer() {
        let token = [0x22u8; 20];
        let to = [0x33u8; 20];
        let amount: u64 = 1_000_000;

        let action = erc20::transfer(&token, &to, amount);

        assert_eq!(action.action_type, ACTION_TYPE_CALL);
        assert_eq!(action.target, address_to_bytes32(&token));

        // Check transfer selector: 0xa9059cbb
        assert_eq!(&action.payload[96..100], &[0xa9, 0x05, 0x9c, 0xbb]);

        // Check to address
        assert_eq!(&action.payload[100..112], &[0u8; 12]);
        assert_eq!(&action.payload[112..132], &to);
    }

    #[test]
    fn test_erc20_transfer_from() {
        let token = [0x22u8; 20];
        let from = [0x33u8; 20];
        let to = [0x44u8; 20];
        let amount: u64 = 1_000_000;

        let action = erc20::transfer_from(&token, &from, &to, amount);

        assert_eq!(action.action_type, ACTION_TYPE_CALL);
        assert_eq!(action.target, address_to_bytes32(&token));

        // Check transferFrom selector: 0x23b872dd
        assert_eq!(&action.payload[96..100], &[0x23, 0xb8, 0x72, 0xdd]);

        // Check from address
        assert_eq!(&action.payload[100..112], &[0u8; 12]);
        assert_eq!(&action.payload[112..132], &from);

        // Check to address
        assert_eq!(&action.payload[132..144], &[0u8; 12]);
        assert_eq!(&action.payload[144..164], &to);
    }

    // ========================================================================
    // Byte-Identity Tests
    // ========================================================================

    /// Verify that CallBuilder produces byte-identical output to the manual
    /// encoding used by defi-yield-farmer's encode_approve_call.
    #[test]
    fn test_approve_matches_manual_encoding() {
        let token = [0x22u8; 20];
        let spender = [0x11u8; 20];
        let amount: u64 = 500_000;

        // Manual encoding (as done by defi-yield-farmer)
        let manual_target = address_to_bytes32(&token);
        let mut manual_calldata = Vec::with_capacity(68);
        manual_calldata.extend_from_slice(&[0x09, 0x5e, 0xa7, 0xb3]); // approve selector
        manual_calldata.extend_from_slice(&address_to_bytes32(&spender));
        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..32].copy_from_slice(&amount.to_be_bytes());
        manual_calldata.extend_from_slice(&amount_bytes);
        let manual_action = call_action(manual_target, 0, &manual_calldata);

        // CallBuilder encoding
        let builder_action = erc20::approve(&token, &spender, amount);

        assert_eq!(manual_action.action_type, builder_action.action_type);
        assert_eq!(manual_action.target, builder_action.target);
        assert_eq!(manual_action.payload, builder_action.payload);
    }

    /// Verify CallBuilder supply encoding matches defi-yield-farmer's manual encode_supply_call.
    #[test]
    fn test_supply_matches_manual_encoding() {
        let pool = [0x11u8; 20];
        let asset = [0x22u8; 20];
        let vault = [0x33u8; 20];
        let amount: u64 = 1_000_000;

        // Manual encoding
        let supply_selector: [u8; 4] = [0x61, 0x7b, 0xa0, 0x37];
        let manual_target = address_to_bytes32(&pool);
        let mut manual_calldata = Vec::with_capacity(132);
        manual_calldata.extend_from_slice(&supply_selector);
        manual_calldata.extend_from_slice(&address_to_bytes32(&asset));
        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..32].copy_from_slice(&amount.to_be_bytes());
        manual_calldata.extend_from_slice(&amount_bytes);
        manual_calldata.extend_from_slice(&address_to_bytes32(&vault));
        manual_calldata.extend_from_slice(&[0u8; 32]); // referralCode = 0
        let manual_action = call_action(manual_target, 0, &manual_calldata);

        // CallBuilder encoding
        let builder_action = CallBuilder::new(pool)
            .selector(0x617ba037)
            .param_address(&asset)
            .param_u256_from_u64(amount)
            .param_address(&vault)
            .param_u16(0) // referralCode
            .build();

        assert_eq!(manual_action.action_type, builder_action.action_type);
        assert_eq!(manual_action.target, builder_action.target);
        assert_eq!(manual_action.payload, builder_action.payload);
    }

    /// Verify CallBuilder withdraw encoding matches defi-yield-farmer's manual encode_withdraw_call.
    #[test]
    fn test_withdraw_matches_manual_encoding() {
        let pool = [0x11u8; 20];
        let asset = [0x22u8; 20];
        let vault = [0x33u8; 20];
        let amount: u64 = 800_000;

        // Manual encoding
        let withdraw_selector: [u8; 4] = [0x69, 0x32, 0x8d, 0xec];
        let manual_target = address_to_bytes32(&pool);
        let mut manual_calldata = Vec::with_capacity(100);
        manual_calldata.extend_from_slice(&withdraw_selector);
        manual_calldata.extend_from_slice(&address_to_bytes32(&asset));
        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..32].copy_from_slice(&amount.to_be_bytes());
        manual_calldata.extend_from_slice(&amount_bytes);
        manual_calldata.extend_from_slice(&address_to_bytes32(&vault));
        let manual_action = call_action(manual_target, 0, &manual_calldata);

        // CallBuilder encoding
        let builder_action = CallBuilder::new(pool)
            .selector(0x69328dec)
            .param_address(&asset)
            .param_u256_from_u64(amount)
            .param_address(&vault)
            .build();

        assert_eq!(manual_action.action_type, builder_action.action_type);
        assert_eq!(manual_action.target, builder_action.target);
        assert_eq!(manual_action.payload, builder_action.payload);
    }
}
