#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

echo "Starting Polymarket Bot..."
echo "  Market:     $CONDITION_ID"
echo "  Strategy:   $([ "${STRATEGY_MODE:-0}" = "0" ] && echo "Probability Threshold" || echo "Spread Capture")"
echo "  Buy < $BUY_THRESHOLD  |  Sell > $SELL_THRESHOLD"
echo ""

cargo run --release --manifest-path "$SCRIPT_DIR/host/Cargo.toml" -- "$@"
