---
title: Cryptographic Chain
sidebar_position: 3
---

# Cryptographic Chain

The security of the Execution Kernel rests on a chain of cryptographic commitments that link source code to on-chain verification. This document traces each link in that chain.

## Overview

```mermaid
flowchart TD
    subgraph "Build Time"
        A[Agent Source Code] -->|SHA-256| B[agent_code_hash]
        C[Kernel + Wrapper + Agent] -->|RISC Zero compile| D[ELF Binary]
        D -->|RISC Zero hash| E[imageId]
    end

    subgraph "Runtime"
        F[KernelInputV1] -->|SHA-256| G[input_commitment]
        H[AgentOutput] -->|SHA-256| I[action_commitment]
        G --> J[KernelJournalV1]
        I --> J
        B --> J
    end

    subgraph "Verification"
        J --> K[zkVM Proof]
        K --> L[On-Chain Verifier]
        E -->|registered| L
        L --> M[Vault Execution]
    end
```

## Build-Time Commitments

### Agent Code Hash

The `agent_code_hash` is a SHA-256 hash of the agent's source files, computed at build time by `build.rs`:

```rust
// build.rs
fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let src_dir = Path::new(&manifest_dir).join("src");

    // Collect all .rs files in src/
    let mut source_files: Vec<_> = fs::read_dir(&src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "rs"))
        .map(|e| e.path())
        .collect();
    source_files.sort();  // Deterministic ordering

    // Hash the contents
    let mut hasher = Sha256::new();
    for path in &source_files {
        let contents = fs::read_to_string(path).unwrap();
        hasher.update(path.file_name().unwrap().to_string_lossy().as_bytes());
        hasher.update(contents.as_bytes());
    }
    let hash = hasher.finalize();

    // Generate constant
    // AGENT_CODE_HASH: [u8; 32] = [0x5a, 0xac, ...]
}
```

This hash is embedded in the compiled agent binary and returned by `AgentEntrypoint::code_hash()`.

**Properties**:
- Changes when source code changes
- Deterministic given same source files
- Independent of build environment

### ImageId

The `imageId` is computed by RISC Zero from the compiled ELF binary:

```rust
// risc0-methods/build.rs
risc0_build::embed_methods();

// Generates:
// pub const ZKVM_GUEST_ELF: &[u8] = ...;
// pub const ZKVM_GUEST_ID: [u32; 8] = ...;  // The imageId
```

**Properties**:
- Unique hash of the entire guest binary
- Changes if kernel, wrapper, agent, or dependencies change
- Deterministic with reproducible builds (Docker)

## Runtime Commitments

### Input Commitment

The `input_commitment` is the SHA-256 hash of the raw encoded input bytes:

```rust
let input_bytes = input.encode()?;
let input_commitment = sha256(&input_bytes);
```

This commits to:
- Protocol and kernel versions
- Agent identity (agent_id, agent_code_hash)
- Constraint set hash
- Input root
- Execution nonce
- Opaque agent inputs

### Action Commitment

The `action_commitment` is the SHA-256 hash of the canonicalized, encoded `AgentOutput`:

```rust
// Canonicalize (sort actions) before encoding
let encoded_output = agent_output.encode()?;
let action_commitment = sha256(&encoded_output);
```

For successful executions, this commits to exactly what actions the agent produced.

For failed executions (constraint violations), a well-known constant is used:

```
EMPTY_OUTPUT_COMMITMENT = SHA-256([0x00, 0x00, 0x00, 0x00])
                        = df3f619804a92fdb4057192dc43dd748ea778adc52bc498ce80524c014b81119
```

## Journal Structure

The `KernelJournalV1` binds all commitments together:

```
Offset │ Field                 │ Type            │ Size
───────┼───────────────────────┼─────────────────┼──────
0      │ protocol_version      │ u32             │ 4
4      │ kernel_version        │ u32             │ 4
8      │ agent_id              │ [u8; 32]        │ 32
40     │ agent_code_hash       │ [u8; 32]        │ 32
72     │ constraint_set_hash   │ [u8; 32]        │ 32
104    │ input_root            │ [u8; 32]        │ 32
136    │ execution_nonce       │ u64             │ 8
144    │ input_commitment      │ [u8; 32]        │ 32
176    │ action_commitment     │ [u8; 32]        │ 32
208    │ execution_status      │ ExecutionStatus │ 1
```

**Total size**: 209 bytes (fixed)

## Verification Flow

### Off-Chain (Prover)

```mermaid
sequenceDiagram
    participant P as Prover
    participant G as zkVM Guest
    participant K as Kernel
    participant A as Agent

    P->>G: Load ELF + input bytes
    G->>K: Call kernel_main
    K->>K: Decode & validate input
    K->>K: Compute input_commitment
    K->>A: Call agent.run()
    A->>K: Return AgentOutput
    K->>K: Enforce constraints
    K->>K: Compute action_commitment
    K->>G: Return journal bytes
    G->>P: Generate proof (seal)
```

### On-Chain (Verifier)

```mermaid
sequenceDiagram
    participant S as Submitter
    participant V as KernelVault
    participant E as ExecutionVerifier
    participant R as RISC Zero Router

    S->>V: execute(journal, seal, agentOutput)
    V->>E: verify(agentId, journal, seal)
    E->>E: Lookup registered imageId
    E->>R: verify(seal, imageId, sha256(journal))
    R->>R: Groth16 verification
    R->>E: Valid proof
    E->>V: Verified
    V->>V: Parse journal
    V->>V: Verify action_commitment
    V->>V: Execute actions
```

## Cryptographic Guarantees

### What the Proof Guarantees

Given a valid proof (seal) and journal:

1. **Execution happened**: The zkVM guest with the registered imageId executed
2. **Input was committed**: The `input_commitment` matches `SHA-256(input_bytes)`
3. **Output was committed**: The `action_commitment` matches `SHA-256(agent_output_bytes)`
4. **Agent was bound**: The `agent_code_hash` in the journal matches the embedded constant
5. **Constraints were enforced**: The constraint engine ran on the agent's output

### What the Proof Does NOT Guarantee

1. **Correct inputs**: The proof doesn't verify that inputs reflect reality
2. **Economic outcomes**: The proof doesn't guarantee profitable trades
3. **Timeliness**: The proof doesn't guarantee when execution happened
4. **Target safety**: The `action.target` field is not validated by constraints

## Hash Functions

All hashing uses **SHA-256** for consistency:

| Use Case | Algorithm |
|----------|-----------|
| agent_code_hash | SHA-256 |
| input_commitment | SHA-256 |
| action_commitment | SHA-256 |
| constraint_set_hash | SHA-256 |
| imageId | RISC Zero (based on Poseidon) |

The imageId uses RISC Zero's internal hashing (Poseidon-based) for zkVM compatibility.

## Reproducible Builds

For deterministic imageId computation:

```bash
# Use Docker for reproducible builds
RISC0_USE_DOCKER=1 cargo build --release -p risc0-methods
```

This ensures:
- Same source code produces same ELF
- Same ELF produces same imageId
- Independent verification is possible

The Agent Pack format captures all these commitments for offline verification.
