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

# Pre-deposit margin config (USDC raw 1e6 units deposited to HyperCore before open)
PRE_DEPOSIT_USDC="${PRE_DEPOSIT_USDC:-5000000}"  # 5 USDC

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

# ── Build binary (once) ──────────────────────────────────────────────────────
echo "Building perp-trader-host (release + full features)..."
cargo build -p perp-trader-host --release --features full --manifest-path "${EK_ROOT}/Cargo.toml" 2>&1

BINARY="${EK_ROOT}/target/release/perp-host"
if [[ ! -x "$BINARY" ]]; then
  echo "ERROR: Binary not found at ${BINARY}"
  exit 1
fi

set +e  # disable exit-on-error for the loop (grep may return 1 on no match)

# ── Helper: parse JSON field ─────────────────────────────────────────────────
json_str() { echo "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*"\([^"]*\)"$/\1/'; }
json_val() { echo "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*[a-z0-9.]*" | head -1 | sed 's/.*: *//'; }

# ── Startup banner ────────────────────────────────────────────────────────────
echo ""
echo "================================================"
echo "  PERP-TRADER BOT  |  HyperEVM Mainnet"
echo "================================================"
echo "  Asset:       ${ASSET}  (${SEED_LEVERAGE}x leverage)"
echo "  Vault:       ${VAULT:0:10}...${VAULT: -4}"
echo "  Sub-acct:    ${SUB_ACCOUNT:0:10}...${SUB_ACCOUNT: -4}"
echo "  Adapter:     ${ADAPTER:0:10}...${ADAPTER: -4}"
echo "  Interval:    ${INTERVAL}s  |  Max hold: ${MAX_HOLD}s"
echo "  SL: ${STOP_LOSS_BPS}bps  |  TP: ${TAKE_PROFIT_BPS}bps"
echo "================================================"
echo ""

# ── Bot loop ─────────────────────────────────────────────────────────────────
CYCLE=0

while true; do
  CYCLE=$((CYCLE + 1))
  TS=$(date '+%H:%M:%S')

  # ── Hold timer status ──
  HOLD_INFO=""
  ACTION_FLAG=0
  if [[ -f "$HOLD_FILE" ]]; then
    OPENED_AT=$(cat "$HOLD_FILE")
    NOW=$(date +%s)
    HOLD_AGE=$((NOW - OPENED_AT))
    HOLD_REMAINING=$((MAX_HOLD - HOLD_AGE))
    if [[ $HOLD_AGE -gt $MAX_HOLD ]]; then
      ACTION_FLAG=1
      HOLD_INFO="  FORCE CLOSE (held ${HOLD_AGE}s > ${MAX_HOLD}s)"
    else
      HOLD_MINS=$((HOLD_REMAINING / 60))
      HOLD_SECS=$((HOLD_REMAINING % 60))
      HOLD_INFO="  [hold: ${HOLD_MINS}m${HOLD_SECS}s left]"
    fi
  fi

  echo "--- #${CYCLE} ${TS}${HOLD_INFO} ---"

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
    --pre-deposit-usdc "$PRE_DEPOSIT_USDC" \
    --json 2>&1) || true

  # Parse JSON fields
  STATUS=$(json_str "$OUTPUT" "status")
  ACTIONS=$(json_val "$OUTPUT" "actions")

  case "$STATUS" in
    no_op)
      REASON=$(json_str "$OUTPUT" "reason")
      MARK=$(json_val "$OUTPUT" "mark_price")
      POS_SIZE=$(json_val "$OUTPUT" "position_size")
      EQUITY=$(json_val "$OUTPUT" "account_equity")

      # Human-readable reason
      case "$REASON" in
        no_entry_signal)       REASON_TEXT="no signal" ;;
        vault_balance_below_minimum) REASON_TEXT="vault balance too low" ;;
        position_pending_settlement) REASON_TEXT="waiting for position to appear" ;;
        *)                     REASON_TEXT="${REASON:-idle}" ;;
      esac

      # Compact one-liner with price context
      if [[ -n "$POS_SIZE" && "$POS_SIZE" != "0" && "$POS_SIZE" != "0.0" ]]; then
        SIDE="LONG"
        SIZE_DISPLAY="$POS_SIZE"
        # Detect negative (short)
        if [[ "$POS_SIZE" == -* ]]; then
          SIDE="SHORT"
          SIZE_DISPLAY="${POS_SIZE#-}"
        fi
        echo "  ${SIDE} ${SIZE_DISPLAY} ${ASSET} | equity \$${EQUITY} | ${REASON_TEXT}"
      else
        echo "  No position | ${REASON_TEXT}"
      fi

      # Clear hold timer if no position
      if [[ "$REASON" == "no_entry_signal" || "$REASON" == "vault_balance_below_minimum" ]]; then
        if [[ -f "$HOLD_FILE" ]]; then
          echo "  Hold timer cleared (position closed)"
          rm -f "$HOLD_FILE"
        fi
      fi
      ;;

    recovered)
      RECOVERED=$(json_val "$OUTPUT" "recovered_usdc")
      REASON=$(json_str "$OUTPUT" "reason")
      if [[ -n "$RECOVERED" && "$RECOVERED" != "0" ]]; then
        RECOVERED_USD=$(python3 -c "print(f'{int(${RECOVERED}) / 1e6:.2f}')" 2>/dev/null || echo "$RECOVERED")
        echo "  RECOVERED \$${RECOVERED_USD} to vault (${REASON})"
      else
        echo "  Recovery attempted (${REASON}) — no funds moved"
      fi
      ;;

    seed_trade)
      FILL_STATUS=$(json_str "$OUTPUT" "fill_status")
      AVG_PX=$(json_str "$OUTPUT" "avg_price")
      TOTAL_SZ=$(json_str "$OUTPUT" "total_size")
      IS_BUY=$(json_val "$OUTPUT" "is_buy")
      if [[ "$IS_BUY" == "true" ]]; then SIDE="LONG"; else SIDE="SHORT"; fi

      if [[ "$FILL_STATUS" == "filled" ]]; then
        echo "  OPENED ${SIDE} ${TOTAL_SZ} ${ASSET} @ \$${AVG_PX} (via REST API)"
        date +%s > "$HOLD_FILE"
        echo "  Hold timer started (${MAX_HOLD}s)"
      else
        DETAIL=$(json_str "$OUTPUT" "detail")
        echo "  Seed trade failed: ${FILL_STATUS} — ${DETAIL:-no detail}"
      fi
      ;;

    submitted)
      TX=$(json_str "$OUTPUT" "tx_hash")
      SUCCESS=$(json_val "$OUTPUT" "success")
      VERIFIED=$(json_val "$OUTPUT" "verified")
      WAS_CLOSE=$(json_val "$OUTPUT" "was_close")
      TX_SHORT="${TX:0:10}...${TX: -4}"

      if [[ "$SUCCESS" == "true" ]]; then
        # Determine action type for display
        if [[ "$WAS_CLOSE" == "true" ]]; then
          ACTION_LABEL="CLOSE"
        else
          ACTION_LABEL="OPEN"
        fi

        echo "  ZK proof submitted: ${ACTION_LABEL} (tx ${TX_SHORT})"

        # Fetch position details from HyperCore
        POS_JSON=$(curl -s https://api.hyperliquid.xyz/info -X POST -H 'Content-Type: application/json' \
          -d "{\"type\":\"clearinghouseState\",\"user\":\"${SUB_ACCOUNT}\"}" 2>/dev/null)

        if [[ -n "$POS_JSON" ]]; then
          POS_INFO=$(echo "$POS_JSON" | python3 -c "
import sys,json
state=json.load(sys.stdin)
equity=state['marginSummary']['accountValue']
for p in state.get('assetPositions',[]):
    szi=float(p['position']['szi'])
    if szi!=0:
        pos=p['position']
        side='LONG' if szi>0 else 'SHORT'
        print(f'  Position: {side} {abs(szi)} {pos[\"coin\"]} @ \${pos.get(\"entryPx\",\"?\")}')
        print(f'  UPnL: \${pos[\"unrealizedPnl\"]}  |  Margin: \${pos[\"marginUsed\"]}  |  Liq: \${pos.get(\"liquidationPx\",\"?\")}')
        break
else:
    print('  No position on HyperCore')
print(f'  Equity: \${equity}')
" 2>/dev/null)
          echo "$POS_INFO"
        fi

        # Verification status
        if [[ "$VERIFIED" == "true" ]]; then
          echo "  Verified: YES"
        else
          echo "  Verified: NO (CoreWriter action silently rejected)"
          # Show all stderr diagnostic lines from the binary (REST API fallback, recovery, etc.)
          FALLBACK_MSG=$(echo "$OUTPUT" | grep -oE '\[VERIFY\].*|\[RECOVER\].*' | head -10)
          if [[ -n "$FALLBACK_MSG" ]]; then
            echo "$FALLBACK_MSG" | while read -r line; do echo "  $line"; done
          fi
        fi

        # Hold timer management
        if [[ "$WAS_CLOSE" == "true" && "$VERIFIED" == "true" ]]; then
          echo "  Close verified — hold timer cleared"
          rm -f "$HOLD_FILE"
        elif [[ "$ACTION_FLAG" == "1" ]]; then
          echo "  Force close submitted — hold timer cleared"
          rm -f "$HOLD_FILE"
        elif [[ "$WAS_CLOSE" != "true" && "$VERIFIED" == "true" && ! -f "$HOLD_FILE" ]]; then
          date +%s > "$HOLD_FILE"
          echo "  Hold timer started (${MAX_HOLD}s)"
        fi
      else
        echo "  TX REVERTED: ${TX_SHORT}"
      fi
      ;;

    dry_run)
      echo "  Dry-run: ${ACTIONS} actions (not submitted)"
      ;;

    *)
      # Unknown status — show stderr lines (recovery, HYPE funding, etc.)
      # Filter out JSON and show only human-readable lines
      STDERR_LINES=$(echo "$OUTPUT" | grep -E '^\s*\[' | head -10)
      if [[ -n "$STDERR_LINES" ]]; then
        echo "$STDERR_LINES" | while read -r line; do echo "  $line"; done
      else
        # Truly unexpected output — show first few lines
        echo "  Unexpected output:"
        echo "$OUTPUT" | head -5 | while read -r line; do echo "    $line"; done
      fi
      ;;
  esac

  sleep "$INTERVAL"
done
