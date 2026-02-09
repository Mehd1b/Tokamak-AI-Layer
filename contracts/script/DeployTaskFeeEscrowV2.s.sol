// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TaskFeeEscrow.sol";

/**
 * @title DeployTaskFeeEscrowV2
 * @notice Deploy the updated TaskFeeEscrow with escrow-based refund mechanism
 * @dev Points to the existing TALIdentityRegistry proxy on Thanos Sepolia
 *
 * Usage:
 *   forge script script/DeployTaskFeeEscrowV2.s.sol \
 *     --broadcast --rpc-url https://rpc.thanos-sepolia.tokamak.network \
 *     --legacy
 */
contract DeployTaskFeeEscrowV2 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Existing TALIdentityRegistry proxy on Thanos Sepolia
        address identityRegistry = vm.envOr(
            "TAL_IDENTITY_REGISTRY_PROXY",
            address(0x3f89CD27fD877827E7665A9883b3c0180E22A525)
        );

        console.log("=== TaskFeeEscrow V2 Deployment ===");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:", deployer);
        console.log("Identity Registry:", identityRegistry);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        TaskFeeEscrow escrow = new TaskFeeEscrow(identityRegistry);

        vm.stopBroadcast();

        console.log("TaskFeeEscrow V2 deployed at:", address(escrow));
        console.log("");
        console.log("New features:");
        console.log("  - Escrow-based payments (funds held until confirmed)");
        console.log("  - confirmTask(taskRef) for successful tasks");
        console.log("  - refundTask(taskRef) for failed tasks");
        console.log("  - 1-hour self-refund deadline for users");
        console.log("");
        console.log("Next steps:");
        console.log("  1. Update TASK_FEE_ESCROW in contracts/.env");
        console.log("  2. Update frontend/src/lib/contracts.ts");
        console.log("  3. Update agent-runtime config");
    }
}
