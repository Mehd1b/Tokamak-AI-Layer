---
title: Input Format
sidebar_position: 1
---

# KernelInputV1 Format

The `KernelInputV1` structure contains all information needed for a kernel execution. This document specifies the binary encoding format.

## Structure Definition

```rust
pub struct KernelInputV1 {
    pub protocol_version: u32,
    pub kernel_version: u32,
    pub agent_id: [u8; 32],
    pub agent_code_hash: [u8; 32],
    pub constraint_set_hash: [u8; 32],
    pub input_root: [u8; 32],
    pub execution_nonce: u64,
    pub opaque_agent_inputs: Vec<u8>,
}
```

:::tip Where in the code?
- **Type definition**: [`kernel-core/src/types.rs:12`](https://github.com/tokamak-network/Tokamak-AI-Layer/blob/master/execution-kernel/crates/protocol/kernel-core/src/types.rs#L12) — `KernelInputV1` struct
- **Encoding/decoding**: [`kernel-core/src/codec.rs`](https://github.com/tokamak-network/Tokamak-AI-Layer/blob/master/execution-kernel/crates/protocol/kernel-core/src/codec.rs) — `CanonicalEncode` and `CanonicalDecode` implementations
- **Input commitment**: [`kernel-core/src/hash.rs`](https://github.com/tokamak-network/Tokamak-AI-Layer/blob/master/execution-kernel/crates/protocol/kernel-core/src/hash.rs) — `compute_input_commitment()` function
:::

## Binary Layout

Total size: 148 + `opaque_agent_inputs.len()` bytes

```
Offset │ Field                 │ Type      │ Size
───────┼───────────────────────┼───────────┼──────
0      │ protocol_version      │ u32       │ 4
4      │ kernel_version        │ u32       │ 4
8      │ agent_id              │ [u8; 32]  │ 32
40     │ agent_code_hash       │ [u8; 32]  │ 32
72     │ constraint_set_hash   │ [u8; 32]  │ 32
104    │ input_root            │ [u8; 32]  │ 32
136    │ execution_nonce       │ u64       │ 8
144    │ opaque_agent_inputs   │ Vec<u8>   │ 4 + len
```

## Field Descriptions

### protocol_version (u32)

Wire format version for the kernel protocol. Must equal `PROTOCOL_VERSION` (1).

Encoded as 4 bytes, little-endian.

### kernel_version (u32)

Kernel semantics version. Must equal `KERNEL_VERSION` (1).

Encoded as 4 bytes, little-endian.

### agent_id ([u8; 32])

Unique identifier for the agent. This identifies which vault/account this execution is for.

Encoded as 32 raw bytes (no length prefix).

### agent_code_hash ([u8; 32])

SHA-256 hash of the agent's source code, computed at build time. The kernel verifies this matches the embedded constant in the agent binary.

Encoded as 32 raw bytes (no length prefix).

### constraint_set_hash ([u8; 32])

SHA-256 hash of the constraint set being applied. Allows verification of which constraints were in effect.

Encoded as 32 raw bytes (no length prefix).

### input_root ([u8; 32])

External state root (e.g., market snapshot hash). Provides a commitment to external state at execution time.

Encoded as 32 raw bytes (no length prefix).

### execution_nonce (u64)

Monotonic counter for replay protection. Must increment with each execution.

Encoded as 8 bytes, little-endian.

### opaque_agent_inputs (`Vec<u8>`)

Agent-specific input data. The kernel passes this directly to the agent without interpretation.

Encoded as:
- 4 bytes: length (u32, little-endian)
- N bytes: raw data

Maximum size: `MAX_AGENT_INPUT_BYTES` (64,000 bytes)

## Encoding Example

```rust
use kernel_core::*;

let input = KernelInputV1 {
    protocol_version: PROTOCOL_VERSION,
    kernel_version: KERNEL_VERSION,
    agent_id: [0x01; 32],
    agent_code_hash: [0x5a, 0xac, /* ... */],
    constraint_set_hash: [0x00; 32],
    input_root: [0x00; 32],
    execution_nonce: 1,
    opaque_agent_inputs: vec![/* 48 bytes for yield agent */],
};

let encoded = input.encode()?;
// encoded is now ready to pass to the zkVM
```

## Decoding Example

```rust
use kernel_core::*;

let bytes: &[u8] = /* received input */;
let input = KernelInputV1::decode(bytes)?;

// Access fields
println!("Protocol version: {}", input.protocol_version);
println!("Agent ID: {:?}", input.agent_id);
```

## Validation Rules

The decoder enforces the following rules:

| Rule | Error |
|------|-------|
| `protocol_version == 1` | `InvalidVersion` |
| `kernel_version == 1` | `InvalidVersion` |
| `opaque_agent_inputs.len() <= 64,000` | `InputTooLarge` |
| No trailing bytes | `InvalidLength` |

## Snapshot Prefix Convention

If cooldown or drawdown constraints are enabled, the first 36 bytes of `opaque_agent_inputs` must contain a `StateSnapshotV1`:

```
Offset │ Field                │ Type   │ Size
───────┼──────────────────────┼────────┼──────
0      │ snapshot_version     │ u32    │ 4
4      │ last_execution_ts    │ u64    │ 8
12     │ current_ts           │ u64    │ 8
20     │ current_equity       │ u64    │ 8
28     │ peak_equity          │ u64    │ 8
```

All integers are little-endian. Bytes after offset 36 are agent-specific.

## Input Commitment

The input commitment is computed as:

```rust
input_commitment = SHA-256(encoded_kernel_input_v1)
```

This commitment appears in the journal and binds the proof to specific inputs.

## Related

- [Journal Format](/kernel/journal-format) - Output structure
- [Versioning](/kernel/versioning) - Protocol and kernel versions
- [Constraints](/sdk/constraints-and-commitments) - Constraint set details
