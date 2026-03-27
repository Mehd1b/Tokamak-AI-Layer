---
title: Trust Model
sidebar_position: 2
---

# Trust Model

The Execution Kernel operates under a **malicious host assumption** -- the kernel assumes the environment running it may be adversarial. This page explains what is trusted, what is not, and how each attack vector is handled.

## Security Properties at a Glance

| Property | What it means |
|----------|---------------|
| **No custody transfer** | Agents never hold funds. They produce instructions; the vault executes them. |
| **Verifiable execution** | Every claim is backed by a Groth16 proof covering input parsing, agent logic, constraint checking, and output encoding. |
| **Deterministic replay** | Given the same input bytes and imageId, anyone can re-execute and verify the result. |
| **Atomic commitment** | The journal commits to both inputs and outputs atomically -- you cannot forge one without the other. |

## What the Proof Guarantees

- The registered agent (by `agent_code_hash` and `imageId`) executed
- The declared inputs were actually used (`input_commitment`)
- The declared outputs were actually produced (`action_commitment`)
- All constraints were enforced (unskippable)

## What the Proof Does NOT Guarantee

- **Input correctness** -- Inputs may not reflect real-world state
- **Economic outcomes** -- The proof cannot guarantee profitable trades
- **Target safety** -- `action.target` is NOT validated by constraints (vault-level responsibility)
- **Timeliness** -- The proof does not guarantee when execution happened

## Attack Vectors and Defenses

### Input Forgery

- **Attack**: Crafted inputs to trigger unexpected behavior
- **Defense**: All inputs committed via `SHA-256(encoded_kernel_input_v1)` and bound to the journal

### Agent Substitution

- **Attack**: Run a different agent than registered
- **Defense**: `agent_code_hash` is verified at kernel entry; mismatch aborts proof generation

### Constraint Bypass

- **Attack**: Skip constraint validation
- **Defense**: Constraint enforcement is hardcoded in the kernel flow -- there is no code path that skips it

### Replay

- **Attack**: Resubmit a valid proof to execute actions twice
- **Defense**: Monotonic `execution_nonce` on-chain; each nonce can only be used once

### Non-Determinism

- **Attack**: Exploit non-deterministic behavior to produce inconsistent proofs
- **Defense**: No floats, no randomness, no `HashMap`/`HashSet`, bounded memory and computation

### Encoding Malleability

- **Attack**: Multiple valid encodings for the same logical value
- **Defense**: Exact payload lengths enforced; trailing bytes rejected

### Protocol Version Confusion

- **Attack**: Submit a proof from an incompatible protocol version
- **Defense**: Explicit version validation at decode time; mismatched versions cause a hard error

## ImageId and Agent Binding

One imageId corresponds to exactly one agent binary:

```
Agent source --> agent_code_hash (SHA-256, build time)
Kernel + Agent --> ELF binary --> imageId (RISC Zero hash)
imageId --> registered on-chain
```

If any component (kernel, wrapper, agent, dependency) changes, the imageId changes.

## Constraint System Boundaries

**Can enforce**: max position size, max leverage, max drawdown, cooldown periods, asset whitelists, action count limits.

**Cannot enforce**: target address validation, economic outcomes, external chain state.

:::warning
Vault contracts must implement their own target validation. Constraints do not prevent calls to arbitrary addresses.
:::

## On-Chain Trust Assumptions

| Component | Trust level |
|-----------|-------------|
| RISC Zero Verifier | Trusted -- Groth16 verification is mathematically sound |
| KernelExecutionVerifier | Trusted -- correct imageId lookup |
| KernelVault | Trusted with deposited funds -- executes only verified proofs |
| Agent Author | Untrusted -- can only update registry, not existing vaults |

## Related

- [Security Considerations](/onchain/security-considerations) -- On-chain attack vectors and validation checklist
- [Cryptographic Chain](/architecture/cryptographic-chain) -- Full hash chain from source to on-chain verification
