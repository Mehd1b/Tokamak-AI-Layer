// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALValidationRegistryV3.sol";

/**
 * @title UpgradeValidationRegistryV3
 * @notice Upgrades TALValidationRegistry proxy from V2 to V3 on Thanos Sepolia
 *
 * Network: Thanos Sepolia
 * Chain ID: 111551119090
 * RPC: https://rpc.thanos-sepolia.tokamak.network
 *
 * V3 Changes:
 * - ReputationOnly validation model disabled
 * - Dual-staking: agent owners must stake >= 1000 TON for StakeSecured/Hybrid
 * - Automated slashing for incorrect computation (score < 50 -> slash 50% agent owner stake)
 * - Permissionless slashing for missed deadlines (10% of validator operator stake)
 *
 * Usage:
 *   forge script script/UpgradeValidationRegistryV3.s.sol \
 *     --broadcast --rpc-url https://rpc.thanos-sepolia.tokamak.network \
 *     --legacy
 *
 * Required env vars:
 *   - PRIVATE_KEY: Deployer private key (must have UPGRADER_ROLE on proxy)
 *   - VALIDATION_REGISTRY_PROXY: Proxy address (default: 0x09447147C6E75a60A449f38532F06E19F5F632F3)
 */
contract UpgradeValidationRegistryV3 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address payable proxyAddress = payable(vm.envOr(
            "VALIDATION_REGISTRY_PROXY",
            address(0x09447147C6E75a60A449f38532F06E19F5F632F3)
        ));

        console.log("=== TALValidationRegistry V3 Upgrade ===");
        console.log("");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:", deployer);
        console.log("Proxy:", proxyAddress);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new V3 implementation
        console.log("Deploying TALValidationRegistryV3 implementation...");
        TALValidationRegistryV3 v3Implementation = new TALValidationRegistryV3();
        console.log("  V3 Implementation:", address(v3Implementation));

        // 2. Upgrade proxy to V3 + call initializeV3 atomically
        console.log("Upgrading proxy to V3...");
        bytes memory initData = abi.encodeWithSelector(
            TALValidationRegistryV3.initializeV3.selector
        );

        TALValidationRegistryV3(proxyAddress).upgradeToAndCall(
            address(v3Implementation),
            initData
        );
        console.log("  Upgrade complete");

        // 3. Verify V3 functions are accessible
        TALValidationRegistryV3 registry = TALValidationRegistryV3(proxyAddress);
        uint256 minAgentOwnerStake = registry.MIN_AGENT_OWNER_STAKE();
        uint256 slashMissedPct = registry.SLASH_MISSED_DEADLINE_PCT();
        uint256 slashIncorrectPct = registry.SLASH_INCORRECT_COMPUTATION_PCT();
        uint8 incorrectThreshold = registry.INCORRECT_COMPUTATION_THRESHOLD();

        console.log("  MIN_AGENT_OWNER_STAKE:", minAgentOwnerStake);
        console.log("  SLASH_MISSED_DEADLINE_PCT:", slashMissedPct);
        console.log("  SLASH_INCORRECT_COMPUTATION_PCT:", slashIncorrectPct);
        console.log("  INCORRECT_COMPUTATION_THRESHOLD:", uint256(incorrectThreshold));

        // Verify V2 functions still work
        uint256 epoch = registry.currentEpoch();
        console.log("  Current epoch (V2):", epoch);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Upgrade Summary ===");
        console.log("  Proxy:              ", proxyAddress);
        console.log("  V3 Implementation:  ", address(v3Implementation));
        console.log("");
        console.log("V3 Features:");
        console.log("  - ReputationOnly model disabled");
        console.log("  - Dual-staking enforcement (agent owner >= 1000 TON)");
        console.log("  - Automated slashing for incorrect computation (50% agent owner stake)");
        console.log("  - Permissionless slashing for missed deadlines (10% validator stake)");
        console.log("");
        console.log("No address changes - proxy remains at:", proxyAddress);
    }
}
