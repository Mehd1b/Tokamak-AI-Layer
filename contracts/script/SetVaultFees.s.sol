// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

interface IKernelVault {
    function owner() external view returns (address);
    function managementFeeBps() external view returns (uint256);
    function performanceFeeBps() external view returns (uint256);
    function feeRecipient() external view returns (address);
    function setFees(uint256 mgmtBps, uint256 perfBps) external;
    function setFeeRecipient(address recipient) external;
}

/// @title SetVaultFees
/// @notice Post-deployment script to configure vault fee structure.
///
/// Usage:
///   forge script script/SetVaultFees.s.sol \
///     --sig "run(address,uint256,uint256,address)" \
///     <VAULT_ADDRESS> <MGMT_BPS> <PERF_BPS> <FEE_RECIPIENT> \
///     --broadcast --rpc-url $RPC_URL --private-key $PRIVATE_KEY
///
///   On HyperEVM (chain 999), add: --legacy
///
/// Fee constraints (enforced by contract, validated here for fast feedback):
///   - mgmtBps  <= 500   (5% annual max)
///   - perfBps  <= 5000  (50% of profits max)
///   - mgmtBps + perfBps <= 5000 (50% combined cap)
///   - 7-day cooldown between setFees() calls
///   - Fee recipient cannot be address(0)
///
/// Examples:
///   # 2% management + 20% performance, fees to deployer
///   forge script script/SetVaultFees.s.sol \
///     --sig "run(address,uint256,uint256,address)" \
///     0xVAULT 200 2000 0xRECIPIENT \
///     --broadcast --rpc-url $RPC_URL --private-key $PK
///
///   # No fees (set both to 0, recipient must still be non-zero)
///   forge script script/SetVaultFees.s.sol \
///     --sig "run(address,uint256,uint256,address)" \
///     0xVAULT 0 0 0x0000000000000000000000000000000000000001 \
///     --broadcast --rpc-url $RPC_URL --private-key $PK
///
/// Quick cast alternatives (no script required):
///   cast send $VAULT "setFees(uint256,uint256)" 200 2000 \
///     --private-key $PK --rpc-url $RPC
///   cast send $VAULT "setFeeRecipient(address)" $RECIPIENT \
///     --private-key $PK --rpc-url $RPC
///   cast send $VAULT "setProtocolTreasury(address,uint256)" $TREASURY 1000 \
///     --private-key $PK --rpc-url $RPC
///   cast call $VAULT "getFeeInfo()" --rpc-url $RPC
///   # On HyperEVM (chain 999), add --legacy to every cast send.
contract SetVaultFees is Script {
    uint256 constant MAX_MANAGEMENT_FEE_BPS = 500;
    uint256 constant MAX_PERFORMANCE_FEE_BPS = 5000;
    uint256 constant MAX_COMBINED_FEE_BPS = 5000;

    function run(
        address vault,
        uint256 mgmtBps,
        uint256 perfBps,
        address feeRecipient
    ) external {
        // --- Pre-flight validation ---
        require(mgmtBps <= MAX_MANAGEMENT_FEE_BPS, "mgmtBps exceeds 500 (5%)");
        require(perfBps <= MAX_PERFORMANCE_FEE_BPS, "perfBps exceeds 5000 (50%)");
        require(mgmtBps + perfBps <= MAX_COMBINED_FEE_BPS, "combined exceeds 5000 (50%)");
        require(feeRecipient != address(0), "fee recipient cannot be zero address");

        IKernelVault v = IKernelVault(vault);

        // --- Print current state ---
        console2.log("=== Vault Fee Configuration ===");
        console2.log("Vault:", vault);
        console2.log("Owner:", v.owner());
        console2.log("");
        console2.log("Current management fee (bps):", v.managementFeeBps());
        console2.log("Current performance fee (bps):", v.performanceFeeBps());
        console2.log("Current fee recipient:", v.feeRecipient());
        console2.log("");
        console2.log("New management fee (bps):", mgmtBps);
        console2.log("New performance fee (bps):", perfBps);
        console2.log("New fee recipient:", feeRecipient);
        console2.log("Combined fee (bps):", mgmtBps + perfBps);

        // --- Execute ---
        vm.startBroadcast();

        v.setFees(mgmtBps, perfBps);
        console2.log("[OK] setFees");
        console2.log("  mgmtBps:", mgmtBps);
        console2.log("  perfBps:", perfBps);

        v.setFeeRecipient(feeRecipient);
        console2.log("[OK] setFeeRecipient");
        console2.log("  recipient:", feeRecipient);

        vm.stopBroadcast();

        // --- Verify ---
        require(v.managementFeeBps() == mgmtBps, "post-check: mgmt fee mismatch");
        require(v.performanceFeeBps() == perfBps, "post-check: perf fee mismatch");
        require(v.feeRecipient() == feeRecipient, "post-check: recipient mismatch");

        console2.log("");
        console2.log("=== Fee configuration complete ===");
    }
}
