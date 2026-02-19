---
title: Repository Map
sidebar_position: 1
---

# Repository Map

This document provides a complete map of the execution-kernel repository structure.

## Directory Structure

```
execution-kernel/
├── Cargo.toml                    # Workspace root
├── Cargo.lock                    # Dependency lockfile
├── README.md                     # Project overview
├── CLAUDE.md                     # AI assistant guidance
├── LICENSE                       # Apache 2.0
│
├── crates/
│   ├── protocol/                 # Core protocol types
│   │   ├── kernel-core/          # Types, codec, hashing
│   │   └── constraints/          # Constraint engine
│   │
│   ├── sdk/
│   │   └── kernel-sdk/           # Agent development SDK (macros, builders, testing)
│   │
│   ├── runtime/                  # zkVM execution
│   │   └── kernel-guest/         # Agent-agnostic kernel logic
│   │
│   ├── agents/
│   │   ├── example-yield-agent/      # Reference yield agent
│   │   │   ├── agent/                # Agent logic + kernel binding
│   │   │   └── risc0-methods/        # RISC Zero build + zkvm-guest/
│   │   └── defi-yield-farmer/        # DeFi yield farming agent
│   │       ├── agent/                # Agent logic + kernel binding
│   │       └── risc0-methods/        # RISC Zero build + zkvm-guest-defi/
│   │
│   ├── tools/
│   │   └── cargo-agent/          # cargo agent CLI subcommand
│   │
│   ├── agent-pack/               # Agent Pack CLI tool
│   │
│   └── testing/
│       ├── kernel-host-tests/    # Unit test suite
│       └── e2e-tests/            # End-to-end tests
│
├── contracts/                    # Solidity contracts
│   ├── src/
│   │   ├── KernelExecutionVerifier.sol
│   │   ├── KernelVault.sol
│   │   ├── KernelOutputParser.sol
│   │   └── MockYieldSource.sol
│   └── foundry.toml
│
├── docs/                         # Docusaurus documentation site
│
├── spec/                         # Technical specifications
│   ├── codec.md
│   ├── constraints.md
│   ├── sdk.md
│   └── e2e-tests.md
│
├── dist/                         # Build artifacts
│   └── agent-pack.json           # Example manifest
│
└── tests/                        # Test fixtures
    └── vectors/                  # Golden test vectors
```

## Crate Details

### Protocol Layer

#### kernel-core

**Path**: `crates/protocol/kernel-core/`

Core types and encoding for the kernel protocol.

```rust
// Key exports
pub struct KernelInputV1 { ... }
pub struct KernelJournalV1 { ... }
pub struct ActionV1 { ... }
pub struct AgentOutput { ... }
pub enum ExecutionStatus { Success, Failure }

// Codec traits
pub trait CanonicalEncode { ... }
pub trait CanonicalDecode { ... }

// Constants
pub const PROTOCOL_VERSION: u32 = 1;
pub const KERNEL_VERSION: u32 = 1;
pub const MAX_AGENT_INPUT_BYTES: usize = 64_000;
pub const MAX_ACTIONS_PER_OUTPUT: usize = 64;
```

#### constraints

**Path**: `crates/protocol/constraints/`

Constraint engine for validating agent outputs.

```rust
pub struct ConstraintSetV1 { ... }
pub enum ViolationReason { ... }
pub fn enforce_constraints(...) -> Result<AgentOutput, ViolationReason>;
```

### SDK Layer

#### kernel-sdk

**Path**: `crates/sdk/kernel-sdk/`

Agent development SDK providing macros, builders, and testing utilities.

```rust
// Macros
agent_input! { struct MyInput { ... } }  // Declarative input parsing
agent_entrypoint!(agent_main);           // Kernel binding generation

// Action builders
CallBuilder::new(target).selector(0x...).param_address(&addr).build();
erc20::approve(&token, &spender, amount);
erc20::transfer(&token, &to, amount);
erc20::transfer_from(&token, &from, &to, amount);

// Testing (behind "testing" feature)
TestHarness::new().input(bytes).execute(agent_main);
ContextBuilder::new().agent_id([0x42; 32]).build();
addr("0x1111..."); bytes32("0x42"); hex_bytes("0xDEADBEEF");

// Math helpers
checked_add_u64(a, b);
checked_mul_div_u64(value, numerator, denominator);
apply_bps(value, bps);

// Byte helpers
read_u32_le(buf, offset);
read_u64_le(buf, offset);
read_bytes32(buf, offset);
```

### Runtime Layer

#### kernel-guest

**Path**: `crates/runtime/kernel-guest/`

Agent-agnostic kernel execution logic. This is the canonical runtime; agent-specific RISC Zero build crates now live alongside each agent (see Agent Layer below).

```rust
pub trait AgentEntrypoint {
    fn code_hash(&self) -> [u8; 32];
    fn run(&self, ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput;
}

pub fn kernel_main_with_agent<A: AgentEntrypoint>(
    input_bytes: &[u8],
    agent: &A,
) -> Result<Vec<u8>, KernelError>;
```

### Agent Layer

Each agent is a self-contained directory under `crates/agents/` with two sub-crates:

| Sub-crate | Purpose |
|-----------|---------|
| `agent/` | Agent logic, kernel binding via `agent_entrypoint!`, code hash |
| `risc0-methods/` | RISC Zero build crate + `zkvm-guest/` binary |

#### example-yield-agent

**Path**: `crates/agents/example-yield-agent/`

Reference yield farming agent.

```rust
// agent/
pub const AGENT_CODE_HASH: [u8; 32];
pub fn agent_main(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput;
pub fn kernel_main(input_bytes: &[u8]) -> Result<Vec<u8>, KernelError>;  // generated

// risc0-methods/
pub const ZKVM_GUEST_ELF: &[u8];
pub const ZKVM_GUEST_ID: [u32; 8];
```

#### defi-yield-farmer

**Path**: `crates/agents/defi-yield-farmer/`

DeFi yield farming agent with multi-protocol strategy support.

```rust
// agent/
pub const AGENT_CODE_HASH: [u8; 32];
pub fn agent_main(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput;
pub fn kernel_main(input_bytes: &[u8]) -> Result<Vec<u8>, KernelError>;  // generated

// risc0-methods/
pub const ZKVM_GUEST_ELF: &[u8];
pub const ZKVM_GUEST_ID: [u32; 8];
```

### Tools

#### cargo-agent

**Path**: `crates/tools/cargo-agent/`

CLI subcommand for agent development workflow:

```bash
cargo agent new my-agent --template yield    # Scaffold a new agent
cargo agent build my-agent --release         # Build an agent
cargo agent test my-agent                    # Run agent tests
cargo agent pack my-agent --version 1.0.0    # Package for distribution
cargo agent list                             # List all agents
```

#### agent-pack

**Path**: `crates/agent-pack/`

CLI tool for creating and verifying Agent Pack manifests.

```bash
agent-pack init --name my-agent --version 1.0.0 --agent-id 0x...
agent-pack compute --elf <path> --out agent-pack.json
agent-pack verify --manifest agent-pack.json
```

### Testing

#### kernel-host-tests

**Path**: `crates/testing/kernel-host-tests/`

Unit tests for kernel logic without zkVM.

#### e2e-tests

**Path**: `crates/testing/e2e-tests/`

End-to-end tests with zkVM proof generation.

## Smart Contracts

### KernelExecutionVerifier

Verifies zkVM proofs and manages agent registrations.

### KernelVault

Holds capital and executes verified agent actions.

### KernelOutputParser

Library for parsing the 209-byte journal.

### MockYieldSource

Test contract simulating a yield source.

## Key Files

| File | Description |
|------|-------------|
| `crates/protocol/kernel-core/src/lib.rs` | Core type exports |
| `crates/protocol/kernel-core/src/types.rs` | Protocol data structures |
| `crates/protocol/kernel-core/src/codec.rs` | Deterministic encoding |
| `crates/protocol/kernel-core/src/hash.rs` | SHA-256 commitments |
| `crates/runtime/kernel-guest/src/lib.rs` | kernel_main implementation |
| `crates/sdk/kernel-sdk/src/lib.rs` | SDK macros (`agent_input!`, `agent_entrypoint!`) |
| `crates/sdk/kernel-sdk/src/actions.rs` | `CallBuilder`, `erc20` helpers |
| `crates/sdk/kernel-sdk/src/testing.rs` | `TestHarness`, `ContextBuilder`, hex helpers |
| `crates/agents/example-yield-agent/agent/src/lib.rs` | Reference agent logic |
| `crates/agents/defi-yield-farmer/agent/src/lib.rs` | DeFi agent logic |
| `crates/tools/cargo-agent/src/main.rs` | `cargo agent` CLI |

## Related

- [Architecture Overview](/architecture/overview) - System design
- [SDK Overview](/sdk/overview) - SDK documentation
- [Glossary](/reference/glossary) - Terms and definitions
