// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TaskFeeEscrow.sol";
import "../src/core/TALReputationRegistry.sol";

/**
 * @title RedeployEscrow
 * @notice Deploy new TaskFeeEscrow (sets hasUsedAgent on payment) and link to ReputationRegistry.
 * @dev TaskFeeEscrow is non-upgradeable, so we deploy a fresh instance.
 *      The old escrow remains on-chain but is no longer referenced.
 *
 * Usage:
 *   cd contracts && forge script script/RedeployEscrow.s.sol \
 *     --broadcast --rpc-url $THANOS_SEPOLIA_RPC_URL --legacy
 */
contract RedeployEscrow is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address identityRegistry = vm.envOr(
            "TAL_IDENTITY_REGISTRY_PROXY",
            address(0x3f89CD27fD877827E7665A9883b3c0180E22A525)
        );
        address reputationProxy = vm.envOr(
            "TAL_REPUTATION_REGISTRY_PROXY",
            address(0x0052258E517835081c94c0B685409f2EfC4D502b)
        );

        console.log("=== Redeploy TaskFeeEscrow ===");
        console.log("Deployer:", deployer);
        console.log("Identity Registry:", identityRegistry);
        console.log("Reputation Proxy:", reputationProxy);

        TALReputationRegistry repProxy = TALReputationRegistry(reputationProxy);
        address oldEscrow = repProxy.taskFeeEscrow();
        console.log("Old TaskFeeEscrow:", oldEscrow);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new TaskFeeEscrow
        TaskFeeEscrow newEscrow = new TaskFeeEscrow(identityRegistry);
        console.log("New TaskFeeEscrow:", address(newEscrow));

        // 2. Link to ReputationRegistry
        repProxy.setTaskFeeEscrow(address(newEscrow));
        console.log("Linked to ReputationRegistry");

        vm.stopBroadcast();

        // Verify
        require(repProxy.taskFeeEscrow() == address(newEscrow), "Escrow link failed");
        console.log("");
        console.log("Done. Update TASK_FEE_ESCROW everywhere:");
        console.log("  Old:", oldEscrow);
        console.log("  New:", address(newEscrow));
    }
}
