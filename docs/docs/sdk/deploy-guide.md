---
title: Deployment Guide
sidebar_position: 8
---

# Deploying Agents On-Chain

This guide covers deploying your agent using `tal deploy`, including standard vaults, Hyperliquid perp trading, and optimistic execution.

## What you'll do

- Deploy your agent and vault to testnet or mainnet
- Configure Hyperliquid adapter and sub-accounts (if trading perps)
- Set on-chain metadata so others can discover your agent

## Prerequisites

1. **Agent is built** -- run `tal build --elf` (the `dist/agent-pack.json` must contain valid `image_id` and `agent_code_hash`)
2. **Wallet is funded** -- your deployer wallet needs HYPE (HyperEVM) or ETH for gas
3. **Configuration is valid** -- run `tal doctor` to check

## Standard deployment

The simplest deployment: register your agent and deploy a vault.

```bash
tal deploy --testnet
```

**What happens:**

1. Reads `image_id` and `agent_code_hash` from `dist/agent-pack.json`
2. Registers your agent on the `AgentRegistry` (or updates it if already registered)
3. Deploys a `KernelVault` via `VaultFactory` (or reuses an existing one with matching `trustedImageId`)
4. Prints a deployment summary with your vault address

### Verify it worked

```bash
tal monitor --vault <VAULT_ADDRESS> --chain 998
```

## Hyperliquid deployment

For agents that trade perpetuals on Hyperliquid, use the `--hyperliquid` flag to deploy the full adapter stack.

```bash
tal deploy --testnet --hyperliquid
```

**What happens (in addition to standard steps):**

1. Deploys or reuses a `HyperliquidAdapter`
2. Registers your vault on the adapter, which creates a `TradingSubAccount`
3. Funds the sub-account with HYPE for gas
4. Registers an API wallet if `API_WALLET_ADDRESS` is set

### Environment variables

Set these in your `.env` file before deploying:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADAPTER_ADDRESS` | -- | Reuse an existing adapter (skip adapter deploy) |
| `PERP_ASSET` | `0` | Asset index (0=BTC, 1=ETH, 3=SOL) |
| `SZ_DECIMALS` | `5` | Size decimals (BTC=5, ETH=4, SOL=2) |
| `HYPE_FUND_AMOUNT` | `0.01` | HYPE to fund the sub-account |
| `API_WALLET_ADDRESS` | -- | API wallet to register (optional) |

## Optimistic deployment

Optimistic vaults use WSTON bonds and deferred proofs for faster execution.

```bash
tal deploy --testnet --optimistic --min-bond 1000000000000000000000000000
```

**What happens (in addition to standard steps):**

1. Deploys an `OptimisticKernelVault` instead of a regular vault
2. Sets the oracle signer
3. Configures the minimum bond and challenge window
4. Enables optimistic execution

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORACLE_SIGNER` | -- | Oracle signer address (required) |
| `ORACLE_MAX_AGE` | `900` | Max oracle data age in seconds |
| `MIN_BOND` | -- | Min bond in wei (alternative to `--min-bond` flag) |
| `CHALLENGE_WINDOW` | `3600` | Challenge period in seconds |

## Combined: Hyperliquid + optimistic

For production perp trading with deferred proofs:

```bash
tal deploy --testnet --hyperliquid --optimistic --min-bond 1000000000000000000000000000
```

## Step-by-step execution

Run individual deployment steps with `--step`:

```bash
tal deploy --step register              # Only register agent
tal deploy --step vault                 # Only deploy vault
tal deploy --hyperliquid --step adapter # Only set up adapter
tal deploy --hyperliquid --step fund    # Only fund sub-account
```

Each step has skip-if-exists logic, so re-running is safe.

## Post-deploy: set metadata

After deploying, set on-chain metadata so others can discover and fork your agent:

```bash
tal metadata set <AGENT_ID> \
  --name "My Yield Agent" \
  --description "Supplies idle vault tokens to AAVE V3" \
  --tags yield,aave,defi \
  --source-repo https://github.com/you/my-agent \
  --version 1.0.0
```

Verify it:

```bash
tal metadata show <AGENT_ID>
```

## Private key handling

`tal deploy` resolves the private key in this order:

```
--private-key flag  >  PRIVATE_KEY env var  >  .env file  >  interactive prompt
```

For CI/automation, set `PRIVATE_KEY` in your environment. For manual deploys, omit it and `tal deploy` will prompt securely.

## Testnet tokens

To get testnet tokens for HyperEVM (chain 998):

1. Get testnet HYPE from `https://app.hyperliquid-testnet.xyz/drip`
2. Bridge to HyperEVM: send HYPE to `0x2222222222222222222222222222222222222222`
3. Wait 10 seconds for bridge settlement

## Handling image ID changes

When you rebuild your agent ELF (changing `IMAGE_ID`), existing vaults become incompatible because `trustedImageId` is immutable. `tal deploy` handles this automatically:

1. Updates the agent registry with the new `imageId`
2. Detects that existing vaults have a stale `trustedImageId`
3. Auto-increments the vault salt and deploys a new vault
4. Warns about the stale vault so you can migrate funds

## Related

- [`tal doctor`](/sdk/cli-reference#tal-doctor) -- validate configuration before deploying
- [`tal monitor`](/sdk/monitoring) -- watch your deployed agent in real-time
- [`tal` CLI Reference](/sdk/cli-reference) -- full command reference
