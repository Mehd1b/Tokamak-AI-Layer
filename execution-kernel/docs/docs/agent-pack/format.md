---
title: Agent Pack Format
sidebar_position: 1
---

# Agent Pack Format

Agent Pack is a portable bundle format for distributing verifiable agents. It provides a standardized way to package agents with all cryptographic commitments needed for offline verification.

## Overview

An Agent Pack manifest answers the question: *"Is this agent binary authentic, and does it match what was registered on-chain?"*

```mermaid
flowchart TD
    A[Agent Source] -->|build| B[ELF Binary]
    A -->|build.rs| C[agent_code_hash]
    B -->|RISC Zero| D[image_id]
    B -->|SHA-256| E[elf_sha256]

    C --> F[agent-pack.json]
    D --> F
    E --> F
    G[Metadata] --> F
```

## Manifest Structure

The manifest is a JSON file containing:

```json
{
  "format_version": "1",
  "agent_name": "yield-agent",
  "agent_version": "1.0.0",
  "agent_id": "0x0000...0001",

  "protocol_version": 1,
  "kernel_version": 1,
  "risc0_version": "1.0.0",
  "rust_toolchain": "1.75.0",

  "agent_code_hash": "0x5aac6b1f...",
  "image_id": "0x5f42241a...",

  "artifacts": {
    "elf_path": "./zkvm-guest",
    "elf_sha256": "0xabcd1234..."
  },

  "build": {
    "cargo_lock_sha256": "0x1234abcd...",
    "build_command": "RISC0_USE_DOCKER=1 cargo build --release -p risc0-methods",
    "reproducible": true
  },

  "inputs": "48 bytes: vault_address (20) + yield_source (20) + amount (8)",
  "actions_profile": "2 CALL actions: deposit to yield source, withdraw with yield",

  "networks": {
    "sepolia": {
      "verifier": "0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA",
      "registered_image_id": "0x5f42241a..."
    }
  },

  "git": {
    "repository": "https://github.com/tokamak-network/Tokamak-AI-Layer",
    "commit": "abc123..."
  },

  "notes": "Example yield farming agent for demonstration purposes."
}
```

## Field Reference

### Identity Fields

| Field | Type | Description |
|-------|------|-------------|
| `format_version` | string | Always "1" |
| `agent_name` | string | Human-readable name |
| `agent_version` | string | Semantic version |
| `agent_id` | hex string | 32-byte identifier |

### Protocol Compatibility

| Field | Type | Description |
|-------|------|-------------|
| `protocol_version` | number | Kernel protocol version |
| `kernel_version` | number | Kernel semantics version |
| `risc0_version` | string | RISC Zero version |
| `rust_toolchain` | string | Rust compiler version |

### Cryptographic Commitments

| Field | Type | Description |
|-------|------|-------------|
| `agent_code_hash` | hex string | SHA-256 of agent source |
| `image_id` | hex string | RISC Zero imageId |

### Artifacts

| Field | Type | Description |
|-------|------|-------------|
| `artifacts.elf_path` | string | Relative path to ELF |
| `artifacts.elf_sha256` | hex string | SHA-256 of ELF binary |

### Build Information

| Field | Type | Description |
|-------|------|-------------|
| `build.cargo_lock_sha256` | hex string | SHA-256 of Cargo.lock |
| `build.build_command` | string | Exact build command |
| `build.reproducible` | boolean | Docker build used |

### Documentation

| Field | Type | Description |
|-------|------|-------------|
| `inputs` | string | Expected input format |
| `actions_profile` | string | Actions the agent produces |

### Deployment (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `networks` | object | Network deployment info |
| `git` | object | Source repository info |
| `notes` | string | Additional information |

## The Cryptographic Chain

```mermaid
flowchart TD
    A[Agent Source Code] -->|SHA-256| B[agent_code_hash]
    C[Kernel + Agent] -->|RISC Zero compile| D[ELF Binary]
    D -->|SHA-256| E[elf_sha256]
    D -->|RISC Zero hash| F[image_id]

    F -->|registered on-chain| G[Verifier Contract]
    B --> H[Manifest]
    E --> H
    F --> H
```

Each step is deterministic. Given the same source and build environment:
- Same source → same `agent_code_hash`
- Same dependencies → same ELF
- Same ELF → same `elf_sha256` and `image_id`

## Creating an Agent Pack

### Using `cargo agent` (recommended)

The fastest way to create and package an agent:

```bash
# Scaffold a new agent
cargo agent new my-yield-agent --template yield

# Build and package
cd my-yield-agent
cargo agent build my-yield-agent
cargo agent pack my-yield-agent --version 1.0.0
```

### Using `agent-pack` directly

#### 1. Initialize Manifest

```bash
agent-pack init \
  --name my-yield-agent \
  --version 1.0.0 \
  --agent-id 0x0000000000000000000000000000000000000000000000000000000000000042
```

Creates `./dist/agent-pack.json` with placeholder values.

#### 2. Build with Reproducible Settings

```bash
RISC0_USE_DOCKER=1 cargo build --release -p risc0-methods
```

#### 3. Compute Hashes

```bash
agent-pack compute \
  --elf target/riscv-guest/riscv32im-risc0-zkvm-elf/release/zkvm-guest \
  --out dist/agent-pack.json \
  --cargo-lock Cargo.lock
```

This updates:
- `artifacts.elf_sha256`
- `image_id` (requires `--features risc0`)
- `build.cargo_lock_sha256`

#### 4. Add Documentation

Edit the manifest to include:
- Input format description
- Actions profile
- Network deployment info
- Git repository info

#### 5. Verify

```bash
agent-pack verify --manifest dist/agent-pack.json
```

## CLI Commands

### `agent-pack init`

```
USAGE:
    agent-pack init [OPTIONS] --name <NAME> --version <VERSION> --agent-id <AGENT_ID>

OPTIONS:
    -n, --name <NAME>          Agent name
    -v, --version <VERSION>    Agent version (semver)
    -a, --agent-id <AGENT_ID>  32-byte agent ID (0x hex)
    -o, --out <PATH>           Output path [default: ./dist/agent-pack.json]
```

### `agent-pack compute`

```
USAGE:
    agent-pack compute [OPTIONS] --elf <PATH>

OPTIONS:
    -e, --elf <PATH>           Path to ELF binary
    -o, --out <PATH>           Manifest path [default: ./dist/agent-pack.json]
        --cargo-lock <PATH>    Path to Cargo.lock for hash computation
```

### `agent-pack verify`

```
USAGE:
    agent-pack verify [OPTIONS]

OPTIONS:
    -m, --manifest <PATH>      Manifest path [default: ./dist/agent-pack.json]
    -b, --base-dir <PATH>      Base directory for resolving artifact paths
        --structure-only       Only verify manifest structure
```

### `agent-pack scaffold`

:::note
The `agent-pack scaffold` command is deprecated in favor of `cargo agent new`, which generates the same structure with a simpler interface.
:::

```
USAGE:
    agent-pack scaffold [OPTIONS] <NAME>

OPTIONS:
        --agent-id <AGENT_ID>  Pre-set agent ID [default: 0x00...00]
    -o, --out <PATH>           Output directory [default: ./<name>]
        --template <TYPE>      Template type: minimal | yield [default: minimal]
        --no-git               Skip git init
```

**Generated Structure:**

```
my-agent/
├── Cargo.toml           # Workspace manifest
├── README.md            # Quick start guide
├── .gitignore
├── agent/               # Core agent logic + kernel binding
│   ├── Cargo.toml
│   ├── build.rs         # AGENT_CODE_HASH computation
│   └── src/lib.rs       # agent_main() + agent_entrypoint!()
├── tests/               # Test harness
│   ├── Cargo.toml
│   └── src/lib.rs
└── dist/
    └── agent-pack.json  # Pre-populated manifest
```

After scaffolding:

```bash
cd my-agent
cargo build       # Build and compute AGENT_CODE_HASH
cargo test        # Run unit tests
```

### `agent-pack pack`

```
USAGE:
    agent-pack pack [OPTIONS] --manifest <PATH> --elf <PATH> --out <PATH>

OPTIONS:
    -m, --manifest <PATH>      Path to input manifest
    -e, --elf <PATH>           Path to the built zkVM guest ELF binary
    -o, --out <PATH>           Output directory for the bundle
        --cargo-lock <PATH>    Path to Cargo.lock for hash computation
        --copy-elf <BOOL>      Copy ELF into bundle artifacts folder [default: true]
        --force                Overwrite existing files in output directory
```

Creates a self-contained bundle directory with the manifest and ELF binary. See [Publishing Bundles](/agent-pack/publishing) for the complete workflow.

### `agent-pack verify-onchain`

```
USAGE:
    agent-pack verify-onchain --manifest <PATH> --rpc <URL> --verifier <ADDRESS>

OPTIONS:
    -m, --manifest <PATH>      Path to manifest file
        --rpc <URL>            RPC endpoint URL (e.g., https://sepolia.infura.io/v3/YOUR_KEY)
        --verifier <ADDRESS>   KernelExecutionVerifier contract address
        --timeout-ms <MS>      RPC timeout in milliseconds [default: 30000]
```

Verifies agent registration against the on-chain KernelExecutionVerifier contract. Requires building with `--features onchain`.

**Exit Codes:**
- `0`: Match (image_id matches on-chain)
- `1`: Error (RPC failure, parse error, etc.)
- `2`: Mismatch (image_id differs from on-chain)
- `3`: Not registered (agent_id returns zero)

See [Verification](/agent-pack/verification#on-chain-verification) for usage details.

## Related

- [Publishing Bundles](/agent-pack/publishing) - Bundle workflow for distribution
- [Verification](/agent-pack/verification) - Verifying Agent Packs
- [Manifest Schema](/agent-pack/manifest-schema) - JSON schema reference
- [RISC0 Build Pipeline](/guest-program/risc0-build-pipeline) - Building artifacts
