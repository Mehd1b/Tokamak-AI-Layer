---
title: Monitoring
sidebar_position: 9
---

# Monitoring Deployed Agents

`tal monitor` provides a live terminal dashboard for watching your deployed agent's vault state, positions, and execution history.

## What you'll see

- Vault balance, shares, and execution nonce
- Open positions and unrealized PnL (for Hyperliquid agents)
- Recent execution events

## Prerequisites

- A deployed vault (see [Deployment Guide](/sdk/deploy-guide))
- The vault address from your `tal deploy` output

## Steps

### Start the monitor

```bash
tal monitor --vault <VAULT_ADDRESS>
```

### Example output

```
Agent Monitor -- 0xae55...904d (HyperEVM Mainnet)
-------------------------------------------------
Vault      $9.98 USDC  |  Shares: 9980000
Nonce      47          |  IMAGE_ID: 0x31a3...
Oracle     0x2394...   |  Agent: 0x12c3...
-------------------------------------------------
Position   BTC LONG 0.001 @ $94,250
PnL        +$12.30     |  Margin: $50.00
-------------------------------------------------
Last poll: 2026-03-13 23:45:00 UTC
Ctrl+C to exit | Refreshing every 30s
```

### Monitor on testnet

```bash
tal monitor --vault <VAULT_ADDRESS> --chain 998 --interval 10
```

### JSON output for automation

```bash
# Pipe to jq for specific fields
tal monitor --vault 0xae55... --json | jq '.vault.total_assets'

# Log to file
tal monitor --vault 0xae55... --json >> monitor.log
```

## Verify it worked

You should see the vault state refreshing at the configured interval. If the vault has a Hyperliquid adapter, position data appears automatically. If the Hyperliquid API is unreachable, the monitor continues showing vault state without position data.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--vault <ADDRESS>` | required | Vault address to monitor |
| `--interval <SECONDS>` | `30` | Poll frequency |
| `--chain <ID>` | `999` | Chain ID (999 = mainnet, 998 = testnet) |
| `--json` | off | Machine-readable JSON output |

## Related

- [Deployment Guide](/sdk/deploy-guide) -- deploy your agent before monitoring
- [`tal` CLI Reference](/sdk/cli-reference) -- full command reference
