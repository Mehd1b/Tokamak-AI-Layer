// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TaskFeeEscrow.sol";
import "../src/core/TALReputationRegistry.sol";

/**
 * @title UpgradeReputationAndEscrow
 * @notice Deploy new TaskFeeEscrow (with hasUsedAgent) and upgrade TALReputationRegistry
 * @dev
 *   - TaskFeeEscrow is non-upgradeable, so we deploy a fresh instance
 *   - TALReputationRegistry uses UUPS proxy, so we deploy new impl + upgradeToAndCall
 *   - Links the new escrow to the reputation registry via setTaskFeeEscrow()
 *
 * Usage:
 *   cd contracts && forge script script/UpgradeReputationAndEscrow.s.sol \
 *     --broadcast --rpc-url $THANOS_SEPOLIA_RPC_URL --legacy
 */
contract UpgradeReputationAndEscrow is Script {
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

        console.log("=== TAL Upgrade: Reputation + Escrow ===");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:", deployer);
        console.log("Identity Registry:", identityRegistry);
        console.log("Reputation Proxy:", reputationProxy);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new TaskFeeEscrow (with hasUsedAgent)
        console.log("1. Deploying new TaskFeeEscrow...");
        TaskFeeEscrow newEscrow = new TaskFeeEscrow(identityRegistry);
        console.log("   TaskFeeEscrow deployed at:", address(newEscrow));

        // 2. Deploy new TALReputationRegistry implementation
        console.log("2. Deploying new TALReputationRegistry implementation...");
        TALReputationRegistry newImpl = new TALReputationRegistry();
        console.log("   New implementation:", address(newImpl));

        // 3. Upgrade the proxy to new implementation
        console.log("3. Upgrading TALReputationRegistry proxy...");
        TALReputationRegistry proxy = TALReputationRegistry(reputationProxy);
        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("   Proxy upgraded successfully");

        // 4. Link TaskFeeEscrow to ReputationRegistry
        console.log("4. Linking TaskFeeEscrow to ReputationRegistry...");
        proxy.setTaskFeeEscrow(address(newEscrow));
        console.log("   taskFeeEscrow set to:", address(newEscrow));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Upgrade Complete ===");
        console.log("");
        console.log("New TaskFeeEscrow:               ", address(newEscrow));
        console.log("New ReputationRegistry Impl:     ", address(newImpl));
        console.log("ReputationRegistry Proxy (same): ", reputationProxy);
        console.log("");
        console.log("Next steps:");
        console.log("  1. Update TASK_FEE_ESCROW in contracts/.env");
        console.log("  2. Update frontend/src/lib/contracts.ts (taskFeeEscrow)");
        console.log("  3. Update agent-runtime .env (TASK_FEE_ESCROW_ADDRESS)");
        console.log("  4. Re-set agent fees on the new escrow (setAgentFee)");
    }
}
