#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Verify all TAL contracts on Thanos Sepolia Blockscout
# ============================================================
# Usage:  cd contracts && bash script/verify-thanos.sh
# ============================================================

VERIFIER_URL="https://explorer.thanos-sepolia.tokamak.network/api/"
CHAIN_ID=111551119090

echo "=== Verifying TAL contracts on Thanos Sepolia Blockscout ==="
echo ""

# ---------- 1. Implementation contracts (no constructor args) ----------

echo "[1/9] TALIdentityRegistry implementation"
forge verify-contract \
  0x9f8d4d1f7aaf06aab1640abd565a731399862bc8 \
  src/core/TALIdentityRegistry.sol:TALIdentityRegistry \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" || echo "  ⚠ Failed or already verified"

echo ""
echo "[2/9] TALReputationRegistry implementation (upgraded)"
forge verify-contract \
  0xe8fc5dca34085816b42300485d52d9336aaa1961 \
  src/core/TALReputationRegistry.sol:TALReputationRegistry \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" || echo "  ⚠ Failed or already verified"

echo ""
echo "[3/9] TALValidationRegistry implementation"
forge verify-contract \
  0xfa0aaee4482c7901653855f591b832e7e8a20727 \
  src/core/TALValidationRegistry.sol:TALValidationRegistry \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" || echo "  ⚠ Failed or already verified"

echo ""
echo "[4/9] StakingIntegrationModule implementation"
forge verify-contract \
  0x41ff86643f6d550725177af1abbf4db9715a74b8 \
  src/modules/StakingIntegrationModule.sol:StakingIntegrationModule \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" || echo "  ⚠ Failed or already verified"

# ---------- 2. TaskFeeEscrow (constructor arg: identityRegistry) ----------

echo ""
echo "[5/9] TaskFeeEscrow (current)"
forge verify-contract \
  0x43f9e59b6bfcacd70fcba4f3f6234a6a9f064b8c \
  src/core/TaskFeeEscrow.sol:TaskFeeEscrow \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" \
  --constructor-args "$(cast abi-encode 'constructor(address)' 0x3f89CD27fD877827E7665A9883b3c0180E22A525)" \
  || echo "  ⚠ Failed or already verified"

# ---------- 3. ERC1967Proxy contracts (constructor args: impl + initData) ----------

echo ""
echo "[6/9] ERC1967Proxy — TALIdentityRegistry"
forge verify-contract \
  0x3f89cd27fd877827e7665a9883b3c0180e22a525 \
  lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" \
  --constructor-args "$(cast abi-encode 'constructor(address,bytes)' \
    0x9f8d4D1f7AAf06aab1640abd565A731399862Bc8 \
    0xc0c53b8b0000000000000000000000003ec2c9fb15c222aa273f3f2f20a740fa86b4f61800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000)" \
  || echo "  ⚠ Failed or already verified"

echo ""
echo "[7/9] ERC1967Proxy — TALReputationRegistry"
forge verify-contract \
  0x0052258e517835081c94c0b685409f2efc4d502b \
  lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" \
  --constructor-args "$(cast abi-encode 'constructor(address,bytes)' \
    0xb05D73E931bf329bd995c64696E7D833C08650b1 \
    0xc0c53b8b0000000000000000000000003ec2c9fb15c222aa273f3f2f20a740fa86b4f6180000000000000000000000003f89cd27fd877827e7665a9883b3c0180e22a5250000000000000000000000000000000000000000000000000000000000000000)" \
  || echo "  ⚠ Failed or already verified"

echo ""
echo "[8/9] ERC1967Proxy — TALValidationRegistry"
forge verify-contract \
  0x09447147c6e75a60a449f38532f06e19f5f632f3 \
  lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" \
  --constructor-args "$(cast abi-encode 'constructor(address,bytes)' \
    0xFa0AAEe4482C7901653855F591B832E7E8a20727 \
    0xf8c8765e0000000000000000000000003ec2c9fb15c222aa273f3f2f20a740fa86b4f6180000000000000000000000003f89cd27fd877827e7665a9883b3c0180e22a5250000000000000000000000000052258e517835081c94c0b685409f2efc4d502b0000000000000000000000003ec2c9fb15c222aa273f3f2f20a740fa86b4f618)" \
  || echo "  ⚠ Failed or already verified"

echo ""
echo "[9/9] ERC1967Proxy — StakingIntegrationModule"
forge verify-contract \
  0xdc9d9a78676c600e7ca55a8d0c63da9462acfe30 \
  lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --chain "$CHAIN_ID" \
  --constructor-args "$(cast abi-encode 'constructor(address,bytes)' \
    0x41FF86643f6d550725177af1ABBF4db9715A74b8 \
    0xf8c8765e0000000000000000000000003ec2c9fb15c222aa273f3f2f20a740fa86b4f61800000000000000000000000000000000000000000000000000000000000000000000000000000000000000003f89cd27fd877827e7665a9883b3c0180e22a5250000000000000000000000000052258e517835081c94c0b685409f2efc4d502b)" \
  || echo "  ⚠ Failed or already verified"

echo ""
echo "=== Verification complete ==="
echo ""
echo "Check results at: https://explorer.thanos-sepolia.tokamak.network"
echo ""
echo "Proxy addresses (user-facing):"
echo "  TALIdentityRegistry:      https://explorer.thanos-sepolia.tokamak.network/address/0x3f89CD27fD877827E7665A9883b3c0180E22A525"
echo "  TALReputationRegistry:    https://explorer.thanos-sepolia.tokamak.network/address/0x0052258E517835081c94c0B685409f2EfC4D502b"
echo "  TALValidationRegistry:    https://explorer.thanos-sepolia.tokamak.network/address/0x09447147C6E75a60A449f38532F06E19F5F632F3"
echo "  StakingIntegrationModule: https://explorer.thanos-sepolia.tokamak.network/address/0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30"
echo "  TaskFeeEscrow:            https://explorer.thanos-sepolia.tokamak.network/address/0x43f9E59b6bFCacD70fcba4f3F6234a6a9F064b8C"
