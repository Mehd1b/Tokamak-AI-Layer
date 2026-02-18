//! DeFi Yield Farming Agent
//!
//! Verifiable yield farming agent targeting AAVE-like lending pools.
//! Receives market state via opaque_inputs, computes optimal allocation,
//! and outputs CALL actions for supply/withdraw operations.

#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use kernel_sdk::prelude::*;

// Include the generated agent hash constant.
include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

/// Canonical agent entrypoint.
#[no_mangle]
#[allow(unsafe_code)]
pub extern "Rust" fn agent_main(_ctx: &AgentContext, _opaque_inputs: &[u8]) -> AgentOutput {
    AgentOutput {
        actions: Vec::new(),
    }
}

/// Compile-time check that agent_main matches the canonical AgentEntrypoint type.
const _: AgentEntrypoint = agent_main;
