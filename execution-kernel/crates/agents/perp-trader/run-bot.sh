#!/usr/bin/env bash
# Perp-trader bot loop for HyperEVM Mainnet.
# Runs the single-shot host binary every INTERVAL seconds.
# No-op cycles (no signal) are cheap (~500ms, no proof).
# Only generates ZK proof + submits on-chain when the agent produces an action.
#
# Usage:
#   cd execution-kernel
#   ./crates/agents/perp-trader/run-bot.sh
#
# Override defaults with env vars:
#   INTERVAL=60 ASSET=ETH ./crates/agents/perp-trader/run-bot.sh

set -uo pipefail

set -e  # exit on error during setup

# ── Load .env ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EK_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${EK_ROOT}/contracts/.env"

if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
fi

# ── Configuration (override via env) ─────────────────────────────────────────
VAULT="${VAULT:-$HYPER_MAINNET_VAULT}"
RPC="${RPC:-$RPC_URL_HYPER_MAINNET}"
PK="${PK:-env:PRIVATE_KEY}"
ORACLE="${ORACLE:-env:ORACLE_KEY}"
BUNDLE="${BUNDLE:-${EK_ROOT}/crates/agents/perp-trader/bundle}"
HL_URL="${HL_URL:-https://api.hyperliquid.xyz}"
ADAPTER="${ADAPTER:-$HYPER_MAINNET_ADAPTER}"
USDC="${USDC:-0xb88339CB7199b77E23DB6E890353E22632Ba630f}"
ASSET="${ASSET:-BTC}"
STOP_LOSS_BPS="${STOP_LOSS_BPS:-100}"
TAKE_PROFIT_BPS="${TAKE_PROFIT_BPS:-200}"
MIN_BALANCE="${MIN_BALANCE:-5000000}"
INTERVAL="${INTERVAL:-30}"
STATE_FILE="${STATE_FILE:-/tmp/perp-trader-mainnet-state.json}"
POSITION_TIMEOUT="${POSITION_TIMEOUT:-1800}"
SZ_DECIMALS="${SZ_DECIMALS:-5}"  # BTC=5, ETH=4, SOL=2
API_WALLET="${API_WALLET:-env:API_WALLET_KEY}"  # REST API seed trade key
SEED_SCRIPT="${SEED_SCRIPT:-${EK_ROOT}/crates/agents/perp-trader/scripts/hl_seed_trade.py}"
SEED_LEVERAGE="${SEED_LEVERAGE:-5}"  # Leverage for seed trades

# HYPE auto-funding config
MIN_HYPE="${MIN_HYPE:-5000000000000000}"        # 0.005 HYPE in wei
HYPE_TOPUP="${HYPE_TOPUP:-10000000000000000}"   # 0.01 HYPE in wei

# Max hold timer: force-close position after MAX_HOLD seconds if TP/SL not hit
MAX_HOLD="${MAX_HOLD:-900}"  # 15 minutes (900 seconds)
HOLD_FILE="${HOLD_FILE:-/tmp/perp-trader-mainnet-hold-timer}"

# ── Resolve sub-account ──────────────────────────────────────────────────────
echo "Resolving sub-account for vault ${VAULT}..."
SUB_ACCOUNT=$(cast call "$ADAPTER" "getSubAccount(address)(address)" "$VAULT" --rpc-url "$RPC" | tr -d '[]' | xargs)

if [[ -z "$SUB_ACCOUNT" || "$SUB_ACCOUNT" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "ERROR: Could not resolve sub-account. Is the vault registered on the adapter?"
  exit 1
fi
echo "Sub-account: ${SUB_ACCOUNT}"

# ── Build binary (once) ──────────────────────────────────────────────────────
echo "Building perp-trader-host (release + full features)..."
cargo build -p perp-trader-host --release --features full --manifest-path "${EK_ROOT}/Cargo.toml" 2>&1

BINARY="${EK_ROOT}/target/release/perp-host"
if [[ ! -x "$BINARY" ]]; then
  echo "ERROR: Binary not found at ${BINARY}"
  exit 1
fi
echo "Binary ready: ${BINARY}"

set +e  # disable exit-on-error for the loop (grep may return 1 on no match)

# ── Bot loop ─────────────────────────────────────────────────────────────────
CYCLE=0
echo ""
echo "=== Perp-Trader Bot (HyperEVM Mainnet) ==="
echo "  Vault:        ${VAULT}"
echo "  Asset:        ${ASSET}"
echo "  Interval:     ${INTERVAL}s"
echo "  Adapter:      ${ADAPTER}"
echo "  Sub-acct:     ${SUB_ACCOUNT}"
echo "  szDecimals:   ${SZ_DECIMALS}"
echo "  Seed lev:     ${SEED_LEVERAGE}x"
echo "  API wallet:   ${API_WALLET:0:8}..."
echo "  State file:   ${STATE_FILE}"
echo "  Max hold:     ${MAX_HOLD}s"
echo "  Min HYPE:     ${MIN_HYPE} wei"
echo "  HYPE topup:   ${HYPE_TOPUP} wei"
echo "============================================="
echo ""

while true; do
  CYCLE=$((CYCLE + 1))
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${TIMESTAMP}] Cycle #${CYCLE} starting..."

  # ── Max hold timer: force-close if position held too long ──
  ACTION_FLAG=0
  if [[ -f "$HOLD_FILE" ]]; then
    OPENED_AT=$(cat "$HOLD_FILE")
    NOW=$(date +%s)
    HOLD_AGE=$((NOW - OPENED_AT))
    if [[ $HOLD_AGE -gt $MAX_HOLD ]]; then
      echo "[${TIMESTAMP}] Position held for ${HOLD_AGE}s > max ${MAX_HOLD}s. Force closing."
      ACTION_FLAG=1
    fi
  fi

  OUTPUT=$("$BINARY" \
    --vault "$VAULT" \
    --rpc "$RPC" \
    --pk "$PK" \
    --oracle-key "$ORACLE" \
    --bundle "$BUNDLE" \
    --hl-url "$HL_URL" \
    --sub-account "$SUB_ACCOUNT" \
    --exchange-contract "$ADAPTER" \
    --usdc-address "$USDC" \
    --asset "$ASSET" \
    --stop-loss-bps "$STOP_LOSS_BPS" \
    --take-profit-bps "$TAKE_PROFIT_BPS" \
    --min-balance "$MIN_BALANCE" \
    --state-file "$STATE_FILE" \
    --position-timeout "$POSITION_TIMEOUT" \
    --sz-decimals "$SZ_DECIMALS" \
    --api-wallet-key "$API_WALLET" \
    --seed-script "$SEED_SCRIPT" \
    --seed-leverage "$SEED_LEVERAGE" \
    --adapter-address "$ADAPTER" \
    --min-hype "$MIN_HYPE" \
    --hype-topup "$HYPE_TOPUP" \
    --action-flag "$ACTION_FLAG" \
    --json 2>&1) || true

  # Parse status from JSON output
  STATUS=$(echo "$OUTPUT" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  ACTIONS=$(echo "$OUTPUT" | grep -o '"actions"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | sed 's/.*: *//')

  case "$STATUS" in
    no_op)
      REASON=$(echo "$OUTPUT" | grep -o '"reason"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
      echo "[${TIMESTAMP}] No-op: ${REASON:-no signal}"
      # Clear hold timer if no position exists
      if [[ "$REASON" == "no_entry_signal" || "$REASON" == "vault_balance_below_minimum" ]]; then
        if [[ -f "$HOLD_FILE" ]]; then
          echo "[${TIMESTAMP}] Position closed. Clearing hold timer."
          rm -f "$HOLD_FILE"
        fi
      fi
      ;;
    seed_trade)
      FILL_STATUS=$(echo "$OUTPUT" | grep -o '"fill_status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
      AVG_PX=$(echo "$OUTPUT" | grep -o '"avg_price"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
      TOTAL_SZ=$(echo "$OUTPUT" | grep -o '"total_size"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
      echo "[${TIMESTAMP}] SEED TRADE: ${FILL_STATUS} ${TOTAL_SZ} ${ASSET} @ \$${AVG_PX}"
      # Record position open time for max hold timer
      if [[ "$FILL_STATUS" == "filled" ]]; then
        date +%s > "$HOLD_FILE"
        echo "[${TIMESTAMP}] Hold timer started (max ${MAX_HOLD}s)."
      fi
      ;;
    submitted)
      TX=$(echo "$OUTPUT" | grep -o '"tx_hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
      SUCCESS=$(echo "$OUTPUT" | grep -o '"success"[[:space:]]*:[[:space:]]*[a-z]*' | head -1 | sed 's/.*: *//')
      VERIFIED=$(echo "$OUTPUT" | grep -o '"verified"[[:space:]]*:[[:space:]]*[a-z]*' | head -1 | sed 's/.*: *//')
      if [[ "$SUCCESS" == "true" ]]; then
        echo "[${TIMESTAMP}] EXECUTED: ${ACTIONS} actions, tx=${TX}"
        echo "[${TIMESTAMP}] Verified on HyperCore: ${VERIFIED}"
        # Fetch and display position details from HyperCore
        POS_JSON=$(curl -s https://api.hyperliquid.xyz/info -X POST -H 'Content-Type: application/json' \
          -d "{\"type\":\"clearinghouseState\",\"user\":\"${SUB_ACCOUNT}\"}" 2>/dev/null)
        if [[ -n "$POS_JSON" ]]; then
          POS_SZI=$(echo "$POS_JSON" | python3 -c "
import sys,json
state=json.load(sys.stdin)
for p in state.get('assetPositions',[]):
    szi=float(p['position']['szi'])
    if szi!=0:
        pos=p['position']
        side='LONG' if szi>0 else 'SHORT'
        print(f'{side} {abs(szi)} {pos[\"coin\"]} @ \${pos.get(\"entryPx\",\"?\")}  |  UPnL: \${pos[\"unrealizedPnl\"]}  |  Margin: \${pos[\"marginUsed\"]}  |  Liq: \${pos.get(\"liquidationPx\",\"?\")}')
        break
else:
    print('NO POSITION')
" 2>/dev/null)
          echo "[${TIMESTAMP}] Position: ${POS_SZI}"
          EQUITY=$(echo "$POS_JSON" | python3 -c "import sys,json; s=json.load(sys.stdin); print(s['marginSummary']['accountValue'])" 2>/dev/null)
          echo "[${TIMESTAMP}] Account equity: \$${EQUITY}"
        fi
        # If this was a force close (action_flag=1), clear the hold timer
        if [[ "$ACTION_FLAG" == "1" ]]; then
          echo "[${TIMESTAMP}] Force close submitted. Clearing hold timer."
          rm -f "$HOLD_FILE"
        elif [[ ! -f "$HOLD_FILE" ]]; then
          # Position opened via ZKP (not seed trade) — start hold timer
          date +%s > "$HOLD_FILE"
          echo "[${TIMESTAMP}] Hold timer started (max ${MAX_HOLD}s)."
        fi
      else
        echo "[${TIMESTAMP}] TX REVERTED: tx=${TX}"
      fi
      ;;
    dry_run)
      echo "[${TIMESTAMP}] Dry-run: ${ACTIONS} actions detected (not submitted)"
      ;;
    *)
      echo "[${TIMESTAMP}] Output: ${OUTPUT}"
      ;;
  esac

  echo "[${TIMESTAMP}] Sleeping ${INTERVAL}s..."
  sleep "$INTERVAL"
done
