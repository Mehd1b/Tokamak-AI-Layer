#!/bin/bash
set -e

cd "$(dirname "$0")/.."

source .env

# ============================================================================
# AAVE V3 Sepolia Addresses (from bgd-labs/aave-address-book)
# ============================================================================
export AAVE_POOL=${AAVE_POOL:-0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951}
export AAVE_ASSET_TOKEN=${AAVE_ASSET_TOKEN:-0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357}  # DAI

# Use placeholder hashes for testnet (real values require RISC Zero compilation)
export DEFI_AGENT_IMAGE_ID=${DEFI_AGENT_IMAGE_ID:-0x0000000000000000000000000000000000000000000000000000000000000001}
export DEFI_AGENT_CODE_HASH=${DEFI_AGENT_CODE_HASH:-0x0000000000000000000000000000000000000000000000000000000000000001}

echo ""
echo "=== Deploying DeFi Yield Farming Agent ==="
echo "Registry:    $AGENT_REGISTRY"
echo "Factory:     $VAULT_FACTORY"
echo "AAVE Pool:   $AAVE_POOL"
echo "Asset Token: $AAVE_ASSET_TOKEN"
echo ""

forge script script/DeployDefiYieldAgent.s.sol:DeployDefiYieldAgent \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
