//! Wrapper crate binding defi-yield-farmer to kernel-guest.
//!
//! Implements [`kernel_guest::AgentEntrypoint`] for the DeFi yield farming agent.

use kernel_core::AgentOutput;
use kernel_guest::AgentEntrypoint;
use kernel_sdk::agent::AgentContext;

pub use defi_yield_farmer::AGENT_CODE_HASH;

/// Wrapper implementing [`AgentEntrypoint`] for the defi-yield-farmer.
pub struct DefiYieldFarmerWrapper;

impl AgentEntrypoint for DefiYieldFarmerWrapper {
    fn code_hash(&self) -> [u8; 32] {
        defi_yield_farmer::AGENT_CODE_HASH
    }

    fn run(&self, ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
        defi_yield_farmer::agent_main(ctx, opaque_inputs)
    }
}

/// Convenience function for kernel execution with the defi-yield-farmer.
pub fn kernel_main(input_bytes: &[u8]) -> Result<Vec<u8>, kernel_guest::KernelError> {
    kernel_guest::kernel_main_with_agent(input_bytes, &DefiYieldFarmerWrapper)
}

/// Convenience function for kernel execution with custom constraints.
pub fn kernel_main_with_constraints(
    input_bytes: &[u8],
    constraint_set: &constraints::ConstraintSetV1,
) -> Result<Vec<u8>, kernel_guest::KernelError> {
    kernel_guest::kernel_main_with_agent_and_constraints(
        input_bytes,
        &DefiYieldFarmerWrapper,
        constraint_set,
    )
}

pub use kernel_guest::KernelError;
