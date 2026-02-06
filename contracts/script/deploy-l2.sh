#!/bin/bash
set -euo pipefail

# TAL L2 Deployment Script (Optimism Sepolia)
# Deploys all L2 contracts: core registries + Sprint 2 modules
#
# Usage:
#   chmod +x script/deploy-l2.sh
#   ./script/deploy-l2.sh                  # dry-run (simulation only)
#   ./script/deploy-l2.sh --broadcast      # actual deployment
#   ./script/deploy-l2.sh --broadcast --verify  # deploy + verify on Etherscan

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
    echo "Loaded .env"
else
    echo "ERROR: .env not found. Copy .env.example to .env and fill in values."
    exit 1
fi

# Validate required variables
if [ -z "${PRIVATE_KEY:-}" ]; then
    echo "ERROR: PRIVATE_KEY not set in .env"
    exit 1
fi

if [ -z "${OPTIMISM_SEPOLIA_RPC_URL:-}" ]; then
    echo "ERROR: OPTIMISM_SEPOLIA_RPC_URL not set in .env"
    exit 1
fi

echo ""
echo "=== TAL L2 Deployment (Optimism Sepolia) ==="
echo ""
echo "RPC URL: ${OPTIMISM_SEPOLIA_RPC_URL}"
echo "Deployer: $(cast wallet address "$PRIVATE_KEY" 2>/dev/null || echo 'unknown')"
echo ""

# Build forge command
FORGE_CMD="forge script script/DeploySepolia.s.sol --rpc-url $OPTIMISM_SEPOLIA_RPC_URL"

# Pass through CLI flags (--broadcast, --verify, etc.)
FORGE_CMD="$FORGE_CMD $*"

# Add etherscan key if verifying and key is set
if [[ "$*" == *"--verify"* ]] && [ -n "${ETHERSCAN_API_KEY:-}" ]; then
    # Use Optimism Sepolia Etherscan (Blockscout or OP Etherscan)
    FORGE_CMD="$FORGE_CMD --etherscan-api-key $ETHERSCAN_API_KEY"
    echo "Etherscan verification enabled"
fi

echo ""
echo "Running: $FORGE_CMD"
echo ""

# Create deployments directory
mkdir -p "$PROJECT_DIR/deployments"

# Execute
cd "$PROJECT_DIR"
eval "$FORGE_CMD"

echo ""
echo "=== L2 Deployment Script Complete ==="

# Show deployment file if it exists
if [ -f "$PROJECT_DIR/deployments/sepolia.json" ]; then
    echo ""
    echo "Deployment addresses saved to: deployments/sepolia.json"
    cat "$PROJECT_DIR/deployments/sepolia.json"
fi
