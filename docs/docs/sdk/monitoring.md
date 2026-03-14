---
title: Monitoring
sidebar_position: 9
---

# Monitoring Deployed Agents

`tal monitor` provides a live terminal dashboard for watching your deployed agent's vault state, positions, and execution history.

## Quick Start

```bash
tal monitor --vault 0xae55d30deac214e4687d336c24bfc6e2a437904d
```

Output (refreshes every 30 seconds):

```
Agent Monitor — 0xae55...904d (HyperEVM Mainnet)
─────────────────────────────────────────────────
Vault      $9.98 USDC  │  Shares: 9980000
Nonce      47          │  IMAGE_ID: 0x31a3...
Oracle     0x2394...   │  Agent: 0x12c3...
─────────────────────────────────────────────────
Position   BTC LONG 0.001 @ $94,250
PnL        +$12.30     │  Margin: $50.00
─────────────────────────────────────────────────
Last poll: 2026-03-13 23:45:00 UTC
Ctrl+C to exit │ Refreshing every 30s
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--vault <ADDRESS>` | Required | Vault address to monitor |
| `--interval <SECONDS>` | `30` | Poll frequency in seconds |
| `--chain <ID>` | `999` | Chain ID (999=mainnet, 998=testnet) |
| `--json` | off | Output machine-readable JSON per poll |

## What It Monitors

### Vault State

Reads from the on-chain vault contract:

- **Total assets** — USDC balance held by the vault
- **Total shares** — ERC4626 share supply
- **Execution nonce** — current monotonic nonce
- **Agent ID** — linked agent in the registry
- **Trusted IMAGE_ID** — pinned agent binary hash
- **Oracle signer** — configured oracle address

### Position State (Hyperliquid)

When the vault has a Hyperliquid adapter, queries the Hyperliquid API for:

- **Open position** — asset, size, side (LONG/SHORT), entry price
- **Unrealized PnL** — colored green (profit) or red (loss)
- **Margin used** — current margin allocation

Position data degrades gracefully — if the Hyperliquid API is unreachable (10s timeout), the monitor continues showing vault state without position data.

### Recent Executions

Scans `ExecutionApplied` events from the vault contract to show the last executions with nonce, action count, and timestamp.

## JSON Output

For automation, logging, or piping to other tools:

```bash
# Pipe to jq for specific fields
tal monitor --vault 0xae55... --json | jq '.vault.total_assets'

# Log to file
tal monitor --vault 0xae55... --json >> monitor.log

# One-shot check (Ctrl+C after first poll)
tal monitor --vault 0xae55... --json --interval 1
```

JSON schema per poll:

```json
{
  "vault": {
    "address": "0xae55...",
    "total_assets": 9.98,
    "total_shares": 9980000,
    "nonce": 47,
    "agent_id": "0x12c3...",
    "image_id": "0x31a3...",
    "oracle_signer": "0x2394..."
  },
  "position": {
    "asset": "BTC",
    "size": "0.001",
    "side": "LONG",
    "entry_price": "94250.0",
    "unrealized_pnl": "12.30",
    "margin_used": "50.00"
  },
  "timestamp": "2026-03-13T23:45:00Z"
}
```

If the position fetch fails, the `position` field is `null` instead of omitting the poll.

## Display

The monitor uses ANSI escape codes for the terminal display:

- Screen clears between polls (`\x1B[2J`)
- Colors via the `colored` crate (green for profit, red for loss)
- No TUI framework dependency — works in any terminal

## Use Cases

### Development

Watch your agent during dry-run testing:

```bash
# In terminal 1: run the agent host
cargo run -p perp-trader-host -- --dry-run

# In terminal 2: watch the vault
tal monitor --vault 0x... --interval 10
```

### Production

Monitor a live vault with JSON logging:

```bash
tal monitor --vault 0xae55... --json --interval 60 >> /var/log/agent-monitor.log
```

### Alerting

Pipe JSON output to a script that alerts on conditions:

```bash
tal monitor --vault 0x... --json | while read line; do
  pnl=$(echo "$line" | jq -r '.position.unrealized_pnl // 0')
  if (( $(echo "$pnl < -100" | bc -l) )); then
    echo "ALERT: PnL below -$100" | mail -s "Agent Alert" ops@example.com
  fi
done
```

## Related

- [`tal deploy`](/sdk/deploy-guide) — Deploy your agent before monitoring
- [`tal doctor`](/sdk/cli-reference#tal-doctor) — Validate configuration
- [Hyperliquid Integration](/onchain/hyperliquid-integration) — Understanding position data
