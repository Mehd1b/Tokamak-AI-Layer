---
title: Golden Path Demo
sidebar_position: 2
---

# Golden Path: End-to-End Agent Execution

This walkthrough demonstrates the complete flow from receiving an Agent Pack bundle to executing it on-chain. By the end, you will have verified an agent, generated a proof, and submitted a transaction to a deployed vault.

## Prerequisites

You need:
1. A bundle directory containing a verified agent (e.g., `example-yield-agent`)
2. An Ethereum RPC endpoint (Sepolia testnet recommended)
3. A funded account for transaction submission
4. The `refint` CLI built with full features

Build the CLI:
```bash
cargo build -p reference-integrator --release --features full
```

## Environment Setup

The demo requires several environment variables. Create a `.env` file or export them directly:

```bash
# RPC endpoint (Sepolia testnet)
export RPC_URL="https://sepolia.infura.io/v3/YOUR_KEY"

# Contract addresses (Sepolia deployment)
export VERIFIER_ADDRESS="0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA"
export VAULT_ADDRESS="0xAdeDA97D2D07C7f2e332fD58F40Eb4f7F0192be7"

# Private key for signing transactions (never commit this)
export PRIVATE_KEY="0x..."

# Execution nonce (must increment for each execution)
export NONCE=1
```

### Yield Agent Specific Variables

For the `example-yield-agent`, you also need:

```bash
# MockYieldSource contract address (for yield agent)
export MOCK_YIELD_SOURCE="0x7B35E3F2e810170f146d31b00262b9D7138F9b39"

# Optional: amount in little-endian hex (default: 1000000 = 1 USDC)
export YIELD_AMOUNT="40420F0000000000"
```

## Step 1: Verify the Bundle Offline

Start by loading and verifying the bundle structure and file hashes. This catches any corruption or tampering before touching the network.

```bash
refint verify --bundle ./my-agent-bundle
```

The command checks three things: the manifest has valid structure, the ELF binary matches its declared SHA-256 hash, and (if the risc0 feature is enabled) the imageId matches the ELF. A successful run exits with code 0.

For machine-readable output suitable for CI pipelines:

```bash
refint verify --bundle ./my-agent-bundle --json
```

The JSON output includes agent metadata, pass/fail status, and any errors or warnings.

## Step 2: Verify On-Chain Registration

After offline verification passes, confirm the agent is registered on-chain. This queries the KernelExecutionVerifier contract to check that the manifest's imageId matches what the operator registered.

```bash
refint verify --bundle ./my-agent-bundle \
  --rpc "$RPC_URL" \
  --verifier "$VERIFIER_ADDRESS"
```

The command first runs offline verification, then calls `agentImageIds(agent_id)` on the verifier contract. Exit code 0 means the imageId matches. Exit code 3 means the agent is not registered. Exit code 2 means the agent is registered but with a different imageId.

## Step 3: Generate a Proof

With verification complete, build the kernel input and generate a proof. This step requires the `prove` feature and the RISC Zero toolchain.

### Opaque Inputs Format

Each agent defines its own opaque inputs format. For the **yield agent**, the format is 48 bytes:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 20 | `vault` | KernelVault contract address |
| 20 | 20 | `yield_source` | MockYieldSource contract address |
| 40 | 8 | `amount` | Amount in little-endian u64 |

Example construction:
```bash
# vault (20 bytes) + yield_source (20 bytes) + amount (8 bytes LE)
VAULT_ADDR=$(echo "$VAULT_ADDRESS" | sed 's/0x//')
YIELD_ADDR=$(echo "$MOCK_YIELD_SOURCE" | sed 's/0x//')
AMOUNT_HEX="40420F0000000000"  # 1000000 (1 USDC) as u64 LE
OPAQUE_INPUTS="0x${VAULT_ADDR}${YIELD_ADDR}${AMOUNT_HEX}"
```

### Running Proof Generation

```bash
refint prove --bundle ./my-agent-bundle \
  --opaque-inputs "$OPAQUE_INPUTS" \
  --nonce $NONCE \
  --out ./proof-output
```

**Flags:**
- `--opaque-inputs` - Hex string or `@file_path` for binary file
- `--nonce` - Execution nonce (must increment for each execution)
- `--out` - Output directory for proof artifacts
- `--dev` - Use development mode (faster, not on-chain verifiable)

**Proving modes:**
- **Groth16** (default): Produces a proof verifiable by the RISC Zero Verifier Router on-chain. Takes 10-30 minutes depending on hardware.
- **Development** (`--dev`): Fast local proving for testing. Proof cannot be verified on-chain.

The command writes three files:
- `journal.bin` - 209 bytes containing commitments and execution status
- `seal.bin` - The cryptographic proof (Groth16 or dev mode)
- `agent_output.bin` - The reconstructed agent output (for yield agent)

## Step 4: Inspect the Proof

Before execution, you can inspect the proof artifacts to verify they contain expected values:

```bash
refint status --artifacts-dir ./proof-output
```

This decodes the journal and displays the protocol version, kernel version, agent ID, input commitment, action commitment, and execution status.

## Step 5: Execute On-Chain

Finally, submit the proof to the vault contract. This calls the vault's execute function with the journal, seal, and agent output bytes.

```bash
refint execute --bundle ./my-agent-bundle \
  --rpc "$RPC_URL" \
  --vault "$VAULT_ADDRESS" \
  --pk "env:PRIVATE_KEY" \
  --journal ./proof-output/journal.bin \
  --seal ./proof-output/seal.bin \
  --agent-output ./agent-output.bin
```

The `--pk` flag supports two formats: a raw hex private key, or `env:VAR_NAME` to read from an environment variable. Always prefer the environment variable approach to avoid leaking keys in shell history.

On success, the command prints the transaction hash and block number. Exit code 0 means the transaction succeeded. Exit code 5 means the transaction reverted.

## Complete Script

For automation, use the provided script that runs all steps in sequence:

```bash
./scripts/golden_path_sepolia.sh ./bundles/example-yield-agent
```

The script validates environment variables, runs each step, and writes outputs to `./run/golden-path/<timestamp>/`. It exits immediately if any step fails.

### Yield Agent Execution

For the yield agent, set `MOCK_YIELD_SOURCE` to enable automatic opaque inputs construction:

```bash
export MOCK_YIELD_SOURCE="0x7B35E3F2e810170f146d31b00262b9D7138F9b39"
export NONCE=5  # Increment for each execution

./scripts/golden_path_sepolia.sh ./bundles/example-yield-agent
```

The script will:
1. Construct opaque inputs: `VAULT_ADDRESS + MOCK_YIELD_SOURCE + YIELD_AMOUNT`
2. Generate a Groth16 proof (takes 10-30 minutes)
3. Submit the proof and agent output to the vault

## Real-World Example

Here is a successful execution on Sepolia testnet:

```
[INFO] Golden Path Demo
[INFO] ================
[INFO] Bundle: ./bundles/example-yield-agent
[INFO] Output: ./run/golden-path/20250130_143522
[INFO] RPC: https://sepolia.infura.io/v3/...
[INFO] Verifier: 0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA
[INFO] Vault: 0xAdeDA97D2D07C7f2e332fD58F40Eb4f7F0192be7
[INFO] Nonce: 5

[INFO] Step 1: Offline verification...
[INFO] Offline verification passed

[INFO] Step 2: On-chain verification...
[INFO] On-chain verification passed

[INFO] Step 3: Generating proof...
[INFO] Using yield agent opaque inputs: vault + yield_source + amount
[INFO] Proof generated: journal=209B, seal=4096B

[INFO] Step 5: Executing on-chain...

[INFO] ========================================
[INFO] Golden Path Complete!
[INFO] ========================================
[INFO] Transaction: 0x07d9e6689870d4c14cc30f04ccdfd3fa23cf52ede6665685f0378300a32ca98c
[INFO] Block: 10163343
[INFO] Output directory: ./run/golden-path/20250130_143522
```

You can view this transaction on [Sepolia Etherscan](https://sepolia.etherscan.io/tx/0x07d9e6689870d4c14cc30f04ccdfd3fa23cf52ede6665685f0378300a32ca98c).

## Exit Codes

All refint commands use consistent exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Invalid usage or parsing error |
| 2 | Verification mismatch (hash or imageId) |
| 3 | Agent not registered on-chain |
| 4 | Proof generation failed |
| 5 | On-chain transaction failed |

## JSON Output

Every command supports `--json` for machine-readable output. The JSON structure varies by command but always includes a `success` boolean and an `error` field when applicable.

Example verify output:

```json
{
  "success": true,
  "agent_name": "yield-agent",
  "agent_version": "1.0.0",
  "agent_id": "0x...",
  "offline_passed": true,
  "onchain_passed": true,
  "onchain_status": "match",
  "errors": [],
  "warnings": []
}
```

Example status output:

```json
{
  "version": "0.1.0",
  "features": {
    "cli": true,
    "onchain": true,
    "prove": false
  },
  "artifacts": {
    "journal_size": 209,
    "seal_size": 4096,
    "protocol_version": 1,
    "kernel_version": 1,
    "agent_id": "0x...",
    "input_commitment": "0x...",
    "action_commitment": "0x...",
    "execution_status": "Success"
  }
}
```

## Troubleshooting

### Offline Verification Failed

**Symptom:** `refint verify` exits with code 2

**Causes:**
- Bundle directory missing `agent-pack.json` - ensure manifest exists
- ELF binary path incorrect - check `artifacts.elf_path` in manifest
- ELF SHA-256 mismatch - binary was modified or manifest is stale

**Solution:** Regenerate the manifest using `agent-pack compute --elf ./guest.elf`

### Agent Not Registered (Exit Code 3)

**Symptom:** On-chain verification returns "not registered"

**Cause:** The agent's `image_id` has not been registered on the KernelExecutionVerifier contract.

**Solution:** Register the agent using the verifier's `registerAgent(agent_id, image_id)` function. Only the contract owner can do this.

### Image ID Mismatch (Exit Code 2)

**Symptom:** On-chain verification returns "mismatch"

**Causes:**
- Agent was rebuilt and `image_id` changed
- Wrong `image_id` was registered on-chain

**Solution:** Either re-register the correct `image_id` on-chain, or rebuild the agent to match the registered `image_id`.

### Proof Generation Failed (Exit Code 4)

**Symptom:** `refint prove` fails

**Causes:**
- Feature not enabled - rebuild with `--features prove`
- RISC Zero toolchain not installed - run `cargo risczero install`
- Invalid opaque inputs format - check byte length and encoding
- Out of memory - Groth16 proving requires significant RAM

**Solution:** Check the error message. For memory issues, use `--dev` mode for testing.

### Transaction Reverted (Exit Code 5)

**Symptom:** On-chain execution fails with revert

**Common causes:**

1. **ActionCommitmentMismatch**: The vault computed `sha256(agent_output_bytes)` and it doesn't match the journal's `action_commitment`.
   - Ensure `agent_output.bin` was generated correctly
   - For yield agent, verify opaque inputs match what was used for proving

2. **Invalid proof**: The RISC Zero verifier rejected the proof.
   - Don't use `--dev` mode for on-chain execution
   - Ensure `journal.bin` and `seal.bin` are from the same proving run

3. **Nonce already used**: The execution nonce was previously used.
   - Increment `NONCE` environment variable

4. **Insufficient gas**: Transaction ran out of gas.
   - The vault uses `gasleft()` for action execution; ensure adequate gas limit

### refint Command Not Found

**Symptom:** `refint: command not found`

**Solution:** Either add to PATH or use the full path:
```bash
./target/release/refint verify --bundle ./my-bundle
```

## Next Steps

After completing the golden path, explore these resources:

- [Reference Integrator API](/integration/reference-integrator) for programmatic access
- [Agent Pack Format](/agent-pack/format) for bundle structure details
- [On-Chain Contracts](/onchain/verifier-overview) for contract interfaces
