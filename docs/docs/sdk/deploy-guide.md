---
title: Deployment Guide
sidebar_position: 8
---

# Deploying Agents On-Chain

`tal deploy` handles the full on-chain deployment pipeline: agent registration, vault deployment, and configuration — all via direct RPC calls using [alloy](https://github.com/alloy-rs/alloy) (no shelling to forge or cast).

## Prerequisites

Before deploying, ensure:

1. **Agent is built and packed** — `tal build --elf` has been run, and `dist/agent-pack.json` contains valid `image_id` and `agent_code_hash` (not placeholders)
2. **Contracts are compiled** — `forge build` has been run (artifacts exist in `contracts/out/`)
3. **Wallet is funded** — deployer wallet has HYPE (HyperEVM) or ETH (Sepolia) for gas

Validate with:

```bash
tal doctor
```

## Quick Deploy

```bash
# Standard vault
tal deploy --testnet

# Hyperliquid perp trading (full stack)
tal deploy --testnet --hyperliquid

# Optimistic vault (WSTON-bonded, deferred proofs)
tal deploy --testnet --optimistic --min-bond 1000000000000000000000000000

# Hyperliquid + optimistic (production perp trading)
tal deploy --testnet --hyperliquid --optimistic --min-bond 1000000000000000000000000000

# Deploy to mainnet
tal deploy
```

## What `tal deploy` Does

The deploy command executes 5 steps, each with skip-if-exists logic:

### Step 1: Preflight

- Reads `image_id` and `agent_code_hash` from `dist/agent-pack.json`
- Fails early if values contain `TODO` or `placeholder`
- Resolves chain config (testnet=998, mainnet=999)
- Resolves private key: `--private-key` flag → `PRIVATE_KEY` env var → `.env` file → interactive prompt
- Checks deployer balance (rejects if zero)

### Step 2: Register Agent

- Computes `agentId = keccak256(deployer, salt)` via `AgentRegistry.computeAgentId()`
- **If not registered**: calls `register(salt, imageId, agentCodeHash, metadataURI)`
- **If registered but imageId/codeHash changed**: calls `update()` to point to new binary
- **If registered and up-to-date**: skips

### Step 3: Deploy Vault

- Checks all existing vaults for this agent via `VaultFactory.getAgentVaults()`
- **If a vault with matching `trustedImageId` exists**: reuses it
- **If all vaults have stale `trustedImageId`**: auto-increments the salt and deploys a **new** vault

```
⚠ Existing vault 0xae55...904d has stale imageId (0xbb11... ≠ 0x31a3...)
  Deploying new vault with salt 0x03
✓ Vault deployed: 0x2CF7...932b6
```

This catches the immutable `trustedImageId` footgun programmatically — no more stuck vaults.

- Gas limit is set to `3,000,000` (HyperEVM block limit)
- Legacy transaction type (no EIP-1559)

### Step 4: Adapter Setup (perp-trader only)

Detected automatically from project structure (presence of `host/` directory). Prints manual deployment guidance for the HyperliquidAdapter:

```bash
FOUNDRY_PROFILE=small forge create \
  --private-key $PK --legacy --gas-limit 3000000 --broadcast \
  --libraries "src/libraries/OracleVerifier.sol:OracleVerifier:0x49D2..." \
  --libraries "src/KernelOutputParser.sol:KernelOutputParser:0x23d9..." \
  src/HyperliquidAdapter.sol:HyperliquidAdapter \
  --constructor-args $VAULT $USDC
```

:::note
Adapter deployment requires library linking and `FOUNDRY_PROFILE=small` (via_ir=true) to fit within the 3M gas limit. This step is not yet automated in `tal deploy`.
:::

### Step 5: Summary

Prints the full deployment summary:

```
═══════════════════════════════════════════
  Deployment Summary
═══════════════════════════════════════════
  Chain:     HyperEVM Testnet (998)
  Agent ID:  0x12c3edf...
  Vault:     0x2CF735...
  IMAGE_ID:  0x31a3ab9...
═══════════════════════════════════════════
```

## Selective Step Execution

Run individual steps with `--step`:

```bash
tal deploy --step register     # Only register agent
tal deploy --step vault        # Only deploy vault
tal deploy --step adapter      # Only show adapter guidance
tal deploy --step fund         # Only fund sub-account
```

## Private Key Handling

The key resolution order is:

```
--private-key flag  >  PRIVATE_KEY env var  >  .env file  >  interactive prompt
```

For CI/automation, set `PRIVATE_KEY` in your environment. For manual deploys, omit it and `tal deploy` will prompt securely (input is hidden).

## Testnet Configuration

`tal init` generates `.env.example` with testnet defaults pre-filled:

```bash
# HyperEVM Testnet (chain 998)
RPC_URL=https://api.hyperliquid-testnet.xyz/evm
CHAIN_ID=998
```

To get testnet tokens:

1. Get testnet HYPE from `https://app.hyperliquid-testnet.xyz/drip`
2. Bridge to HyperEVM: send HYPE to `0x2222222222222222222222222222222222222222`
3. Wait 10 seconds for bridge settlement

## Chain Configuration

`tal deploy` has hardcoded addresses for supported chains:

| Chain | ID | AgentRegistry | VaultFactory |
|-------|-----|---------------|--------------|
| HyperEVM Mainnet | 999 | `0xAf58D219...` | `0xc7Fc0dD5...` |
| HyperEVM Testnet | 998 | `0x09447147...` | `0x4c36bCA8...` |

Addresses are sourced from `crates/tal-cli/src/onchain.rs` and match the on-chain deployments in `sdk/src/addresses.ts`.

## Library Linking

For contract deployments requiring library linking (e.g., HyperliquidAdapter), `tal deploy` reads forge build artifacts from `contracts/out/` and patches `__$placeholder$__` values with real library addresses at runtime. The library addresses are stored per-chain in the `ChainConfig` registry.

## Vault ImageId Mismatch

When you rebuild your agent ELF (changing `IMAGE_ID`), existing vaults become incompatible because `trustedImageId` is immutable. `tal deploy` handles this automatically:

1. Updates the agent registry with the new `imageId`
2. Detects that existing vaults have stale `trustedImageId`
3. Auto-increments the vault salt and deploys a new vault
4. Warns about the stale vault so you can migrate funds

See [Permissionless System](/onchain/permissionless-system#imageid-pinning) for the security rationale behind imageId pinning.

## Related

- [`tal doctor`](/sdk/cli-reference#tal-doctor) — Validate configuration before deploying
- [`tal monitor`](/sdk/monitoring) — Watch your deployed agent in real-time
- [Permissionless System](/onchain/permissionless-system) — How agent registration and vault deployment work
- [Hyperliquid Integration](/onchain/hyperliquid-integration) — Adapter deployment for perpetual trading
