#!/bin/bash
set -euo pipefail

# TAL L1 Deployment Script (Ethereum Sepolia)
# Deploys L1 bridge contracts: TALStakingBridgeL1 + TALSlashingConditionsL1
#
# Usage:
#   chmod +x script/deploy-l1.sh
#   ./script/deploy-l1.sh                  # dry-run (simulation only)
#   ./script/deploy-l1.sh --broadcast      # actual deployment
#   ./script/deploy-l1.sh --broadcast --verify  # deploy + verify on Etherscan

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

if [ -z "${ETHEREUM_SEPOLIA_RPC_URL:-}" ]; then
    echo "ERROR: ETHEREUM_SEPOLIA_RPC_URL not set in .env"
    exit 1
fi

echo ""
echo "=== TAL L1 Deployment (Ethereum Sepolia) ==="
echo ""
echo "RPC URL: ${ETHEREUM_SEPOLIA_RPC_URL}"
echo "Deployer: $(cast wallet address "$PRIVATE_KEY" 2>/dev/null || echo 'unknown')"
echo "SeigManager: ${SEIG_MANAGER:-not set}"
echo "L1 Messenger: ${L1_CROSS_DOMAIN_MESSENGER:-not set}"
echo "L2 Bridge: ${L2_BRIDGE_ADDRESS:-not set}"
echo "TAL Layer2: ${TAL_LAYER2_ADDRESS:-not set}"
echo ""

# Build forge command
FORGE_CMD="forge script script/DeployL1.s.sol --rpc-url $ETHEREUM_SEPOLIA_RPC_URL"

# Pass through CLI flags (--broadcast, --verify, etc.)
FORGE_CMD="$FORGE_CMD $*"

# Add etherscan key if verifying and key is set
if [[ "$*" == *"--verify"* ]] && [ -n "${ETHERSCAN_API_KEY:-}" ]; then
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
echo "=== L1 Deployment Script Complete ==="

# Show deployment file if it exists
if [ -f "$PROJECT_DIR/deployments/l1.json" ]; then
    echo ""
    echo "Deployment addresses saved to: deployments/l1.json"
    cat "$PROJECT_DIR/deployments/l1.json"
fi
