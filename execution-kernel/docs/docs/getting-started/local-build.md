---
title: Local Build
sidebar_position: 2
---

# Local Build

This guide walks through building the Execution Kernel and its components locally.

## Quick Build

Build all crates without zkVM features:

```bash
cargo build --release
```

This compiles:
- `kernel-core` - Protocol types and codec
- `constraints` - Constraint engine
- `kernel-sdk` - Agent development SDK
- `kernel-guest` - Kernel execution logic
- `example-yield-agent` - Reference yield agent
- `defi-yield-farmer` - DeFi yield farming agent

## Build with zkVM Support

To build with RISC Zero zkVM support:

```bash
cargo build --release --features risc0
```

This additionally compiles each agent's `risc0-methods/` crate (zkVM guest binaries and IMAGE_IDs).

:::note
Building with `--features risc0` requires the RISC Zero toolchain. See [Prerequisites](/getting-started/prerequisites) for installation instructions.
:::

## Reproducible Builds

For deterministic imageId computation (required for production):

```bash
RISC0_USE_DOCKER=1 cargo build --release --features risc0
```

This uses RISC Zero's Docker image to ensure identical builds across different machines.

## Build Individual Crates

### Protocol Layer

```bash
# Build kernel-core
cargo build -p kernel-core --release

# Build constraints
cargo build -p constraints --release
```

### SDK

```bash
cargo build -p kernel-sdk --release
```

### Runtime

```bash
# Build kernel-guest (canonical agent-agnostic runtime)
cargo build -p kernel-guest --release
```

### Agents

Each agent has three sub-crates: `agent`, `binding`, and `risc0-methods`.

```bash
# Build example yield agent
cargo build -p example-yield-agent --release
cargo build -p kernel-guest-binding-yield --release
cargo build -p risc0-methods --release --features risc0

# Build DeFi yield farmer agent
cargo build -p defi-yield-farmer --release
cargo build -p kernel-guest-binding-defi-yield --release
cargo build -p risc0-methods-defi --release --features risc0
```

## Verify Build

### Run Unit Tests

```bash
cargo test
```

### Run Specific Test

```bash
cargo test test_determinism -- --nocapture
```

### Run Tests for a Single Crate

```bash
cargo test -p kernel-core
cargo test -p constraints
cargo test -p kernel-host-tests
```

## Build Artifacts

After building, key artifacts are located at:

| Artifact | Path |
|----------|------|
| Kernel libraries | `target/release/lib*.rlib` |
| zkVM guest ELF | `target/riscv-guest/riscv32im-risc0-zkvm-elf/release/zkvm-guest` |
| Agent code hash | Embedded in agent crate (printed during build) |

### Finding the IMAGE_ID

After building with RISC Zero features, each agent's IMAGE_ID is available as a constant from its `risc0-methods` crate:

```rust
// Example yield agent
use risc0_methods::ZKVM_GUEST_ID;

// DeFi yield farmer
use risc0_methods_defi::ZKVM_GUEST_ID;
```

## Build Troubleshooting

### Missing RISC Zero Toolchain

```
error: could not find risc0
```

**Solution**: Install the RISC Zero toolchain:

```bash
cargo risczero install
```

### Linker Errors

```
error: linking with `cc` failed
```

**Solution**: Ensure you have a C compiler installed:

```bash
# macOS
xcode-select --install

# Linux
sudo apt-get install build-essential
```

### Out of Memory

```
error: could not compile - memory allocation failed
```

**Solution**: Reduce parallelism or increase available memory:

```bash
CARGO_BUILD_JOBS=2 cargo build --release
```

### Docker Not Found (Reproducible Builds)

```
error: RISC0_USE_DOCKER is set but docker is not available
```

**Solution**: Install and start Docker:

```bash
# Verify Docker is running
docker info
```

## Workspace Structure

The workspace is organized as follows:

```
Cargo.toml                 # Workspace root
crates/
├── protocol/
│   ├── kernel-core/       # Core types, codec, hashing
│   └── constraints/       # Constraint engine
├── sdk/
│   └── kernel-sdk/        # Agent development SDK
├── runtime/
│   └── kernel-guest/      # Agent-agnostic kernel execution logic
├── agents/
│   ├── example-yield-agent/
│   │   ├── agent/             # Agent logic
│   │   ├── binding/           # Kernel-guest binding
│   │   └── risc0-methods/     # RISC Zero build + zkvm-guest/
│   └── defi-yield-farmer/
│       ├── agent/             # Agent logic
│       ├── binding/           # Kernel-guest binding
│       └── risc0-methods/     # RISC Zero build + zkvm-guest-defi/
├── agent-pack/            # Agent Pack CLI tool
└── testing/
    ├── kernel-host-tests/ # Unit tests
    └── e2e-tests/         # End-to-end tests
```

## Next Steps

After building successfully:

1. [Run the example yield agent](/getting-started/run-an-example)
2. [Understand the architecture](/architecture/overview)
3. [Start writing your own agent](/sdk/writing-an-agent)
