#!/bin/bash
# seed-vaults.sh — Register demo agents + deploy and seed KernelVaults
# Usage: ./scripts/seed-vaults.sh <chain>
#   chain: hyperEvm | arbitrum | optimism
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ============================================================================
# Chain configuration
# ============================================================================
CHAIN="${1:-}"

if [ -z "$CHAIN" ]; then
    echo "Usage: $0 <chain>"
    echo "  chain: hyperEvm | arbitrum | optimism"
    exit 1
fi

case "$CHAIN" in
    hyperEvm)
        RPC_VAR="RPC_URL_HYPER_MAINNET"
        CHAIN_LABEL="HyperEVM Mainnet"
        ;;
    arbitrum)
        RPC_VAR="RPC_URL_ARBITRUM"
        CHAIN_LABEL="Arbitrum One"
        ;;
    optimism)
        RPC_VAR="RPC_URL_OPTIMISM"
        CHAIN_LABEL="Optimism"
        ;;
    *)
        echo "Error: unknown chain '$CHAIN'"
        echo "  Supported: hyperEvm, arbitrum, optimism"
        exit 1
        ;;
esac

# ============================================================================
# Load environment
# ============================================================================
ENV_FILE="$PROJECT_ROOT/contracts/.env"
if [ -f "$ENV_FILE" ]; then
    echo "[*] Loading env from $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# Resolve RPC URL from the chain-specific env var
RPC_URL="${!RPC_VAR:-}"
if [ -z "$RPC_URL" ]; then
    echo "Error: $RPC_VAR is not set. Export it or add it to contracts/.env"
    exit 1
fi

# ============================================================================
# Validate required env vars
# ============================================================================
: "${AGENT_REGISTRY:?AGENT_REGISTRY env var is required}"
: "${VAULT_FACTORY:?VAULT_FACTORY env var is required}"
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY env var is required}"

# Optional defaults
export DEPOSIT_ASSET="${DEPOSIT_ASSET:-0x0000000000000000000000000000000000000000}"
export SEED_AMOUNT="${SEED_AMOUNT:-1000000000000000000}"  # 1 ether
export IMAGE_ID="${IMAGE_ID:-0x0000000000000000000000000000000000000000000000000000000000000001}"
export AGENT_CODE_HASH="${AGENT_CODE_HASH:-0x0000000000000000000000000000000000000000000000000000000000000001}"

# ============================================================================
# Banner
# ============================================================================
echo ""
echo "========================================"
echo "  Tokamak AI Layer — Seed Vaults"
echo "========================================"
echo "  Chain:           $CHAIN_LABEL"
echo "  RPC:             ${RPC_URL:0:40}..."
echo "  AgentRegistry:   $AGENT_REGISTRY"
echo "  VaultFactory:    $VAULT_FACTORY"
echo "  Deposit Asset:   $DEPOSIT_ASSET"
echo "  Seed Amount:     $SEED_AMOUNT wei"
echo "========================================"
echo ""

# ============================================================================
# Run forge script
# ============================================================================
cd "$PROJECT_ROOT/contracts"

FORGE_ARGS=(
    script/SeedVaults.s.sol:SeedVaults
    --rpc-url "$RPC_URL"
    --broadcast
    -vvvv
)

# For ETH vaults, pass value to the script runner
if [ "$DEPOSIT_ASSET" = "0x0000000000000000000000000000000000000000" ]; then
    # Total value = SEED_AMOUNT * 3 vaults (sent as contract balance)
    TOTAL_VALUE=$(( SEED_AMOUNT * 3 ))
    FORGE_ARGS+=( --value "$TOTAL_VALUE" )
fi

echo "[*] Running: forge script ${FORGE_ARGS[*]}"
echo ""

forge script "${FORGE_ARGS[@]}"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "[OK] Seed vaults completed successfully on $CHAIN_LABEL"
else
    echo "[FAIL] Seed vaults failed (exit code $EXIT_CODE)"
fi

exit $EXIT_CODE
