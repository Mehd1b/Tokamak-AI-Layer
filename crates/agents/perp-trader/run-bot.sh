#!/usr/bin/env bash
# Perp-trader bot for HyperEVM Mainnet (optimistic execution mode).
#
# The binary handles its own retry loop (every --monitor-interval seconds),
# position monitoring (TP/SL), auto-close, and fund recovery.
#
# Usage:
#   ./crates/agents/perp-trader/run-bot.sh
#
# Override defaults with env vars:
#   ASSET=ETH MAX_HOLD=600 ./crates/agents/perp-trader/run-bot.sh

set -euo pipefail

# ── Load .env ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EK_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${EK_ROOT}/contracts/.env"

if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
fi

# ── Configuration (override via env) ─────────────────────────────────────────
# Optimistic KernelVault (OKV) on HyperEVM mainnet
VAULT="${VAULT:-0x90bdcc34907e7a387e394f10179cf3328e5b0d82}"
RPC="${RPC:-${RPC_URL_HYPER_MAINNET:-https://rpc.hyperliquid.xyz/evm}}"
PK="${PK:-env:PRIVATE_KEY}"
ORACLE="${ORACLE:-env:ORACLE_KEY}"
BUNDLE="${BUNDLE:-${EK_ROOT}/crates/agents/perp-trader/bundle}"
HL_URL="${HL_URL:-https://api.hyperliquid.xyz}"

# Adapter v17 (two-proof, for OKV)
ADAPTER="${ADAPTER:-0x79607Dd1B4C312C270da427113920016Be24119A}"
USDC="${USDC:-0xb88339CB7199b77E23DB6E890353E22632Ba630f}"
ASSET="${ASSET:-BTC}"

# Strategy
STOP_LOSS_BPS="${STOP_LOSS_BPS:-200}"
TAKE_PROFIT_BPS="${TAKE_PROFIT_BPS:-400}"
MIN_BALANCE="${MIN_BALANCE:-1000000}"

# Timing
MAX_HOLD="${MAX_HOLD:-900}"           # 15 min position hold
MONITOR_INTERVAL="${MONITOR_INTERVAL:-15}"  # 15s between retries/polls

# Sub-account and seed trades
SZ_DECIMALS="${SZ_DECIMALS:-5}"
API_WALLET="${API_WALLET:-env:API_WALLET_KEY}"
SEED_SCRIPT="${SEED_SCRIPT:-${EK_ROOT}/crates/agents/perp-trader/scripts/hl_seed_trade.py}"
SEED_LEVERAGE="${SEED_LEVERAGE:-5}"

# HYPE auto-funding
MIN_HYPE="${MIN_HYPE:-5000000000000000}"
HYPE_TOPUP="${HYPE_TOPUP:-10000000000000000}"

# Optimistic execution
ORACLE_URL="${ORACLE_URL:-https://oracle-service-production-bf63.up.railway.app}"
CHALLENGE_WINDOW="${CHALLENGE_WINDOW:-3600}"

# L1 bond management (auto-lock WSTON before each optimistic execution)
L1_RPC="${L1_RPC:-${RPC_URL_MAINNET:-https://eth.llamarpc.com}}"
BOND_MANAGER="${BOND_MANAGER:-0xF2045A808F96Ca8E7BB6E78A04d635690dfB07e4}"
WSTON="${WSTON:-0x26C8F112769fb3A3A8de267CfFf60E9f317445e5}"

STATE_FILE="${STATE_FILE:-/tmp/perp-trader-mainnet-state.json}"
POSITION_TIMEOUT="${POSITION_TIMEOUT:-1800}"

# ── Resolve sub-account ──────────────────────────────────────────────────────
echo "Resolving sub-account for vault ${VAULT}..."
SUB_ACCOUNT=$(cast call "$ADAPTER" "getSubAccount(address)(address)" "$VAULT" --rpc-url "$RPC" 2>/dev/null | tr -d '[]' | xargs) || true

if [[ -z "$SUB_ACCOUNT" || "$SUB_ACCOUNT" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "ERROR: Could not resolve sub-account. Is the vault registered on the adapter?"
  exit 1
fi

# ── Build binary ─────────────────────────────────────────────────────────────
echo "Building perp-trader-host (release + onchain + prove)..."
cargo build -p perp-trader-host --release --features onchain,prove --manifest-path "${EK_ROOT}/Cargo.toml" 2>&1

BINARY="${EK_ROOT}/target/release/perp-host"
if [[ ! -x "$BINARY" ]]; then
  echo "ERROR: Binary not found at ${BINARY}"
  exit 1
fi

# ── Startup banner ────────────────────────────────────────────────────────────
echo ""
echo "================================================"
echo "  PERP-TRADER BOT  |  Optimistic Execution"
echo "================================================"
echo "  Asset:       ${ASSET}  (${SEED_LEVERAGE}x leverage)"
echo "  Vault:       ${VAULT:0:10}...${VAULT: -4}"
echo "  Sub-acct:    ${SUB_ACCOUNT:0:10}...${SUB_ACCOUNT: -4}"
echo "  Adapter:     ${ADAPTER:0:10}...${ADAPTER: -4}"
echo "  Oracle:      ${ORACLE_URL}"
echo "  BondMgr:     ${BOND_MANAGER:0:10}...${BOND_MANAGER: -4}"
echo "  Retry:       ${MONITOR_INTERVAL}s  |  Max hold: ${MAX_HOLD}s"
echo "  SL: ${STOP_LOSS_BPS}bps  |  TP: ${TAKE_PROFIT_BPS}bps"
echo "================================================"
echo ""

# ── Run ───────────────────────────────────────────────────────────────────────
# The binary handles its own loop: retries every monitor-interval until entry
# signal found, monitors position for TP/SL, auto-closes, and recovers funds.
exec "$BINARY" \
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
  --optimistic \
  --oracle-url "$ORACLE_URL" \
  --challenge-window "$CHALLENGE_WINDOW" \
  --l1-rpc "$L1_RPC" \
  --bond-manager "$BOND_MANAGER" \
  --wston-address "$WSTON" \
  --max-hold-secs "$MAX_HOLD" \
  --monitor-interval "$MONITOR_INTERVAL"
