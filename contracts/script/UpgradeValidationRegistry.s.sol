// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALValidationRegistryV2.sol";

/**
 * @title UpgradeValidationRegistry
 * @notice Upgrades TALValidationRegistry proxy to V2 on Thanos Sepolia
 *
 * Network: Thanos Sepolia
 * Chain ID: 111551119090
 * RPC: https://rpc.thanos-sepolia.tokamak.network
 *
 * Usage:
 *   forge script script/UpgradeValidationRegistry.s.sol \
 *     --broadcast --rpc-url https://rpc.thanos-sepolia.tokamak.network \
 *     --legacy
 *
 * Required env vars:
 *   - PRIVATE_KEY: Deployer private key (must have UPGRADER_ROLE on proxy)
 *   - VALIDATION_REGISTRY_PROXY: Proxy address (0x09447147C6E75a60A449f38532F06E19F5F632F3)
 */
contract UpgradeValidationRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Required
        address payable proxyAddress = payable(vm.envOr(
            "VALIDATION_REGISTRY_PROXY",
            address(0x09447147C6E75a60A449f38532F06E19F5F632F3)
        ));

        console.log("=== TALValidationRegistry V2 Upgrade ===");
        console.log("");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:", deployer);
        console.log("Proxy:", proxyAddress);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new V2 implementation
        console.log("Deploying TALValidationRegistryV2 implementation...");
        TALValidationRegistryV2 v2Implementation = new TALValidationRegistryV2();
        console.log("  V2 Implementation:", address(v2Implementation));

        // 2. Upgrade proxy to V2 + call initializeV2
        console.log("Upgrading proxy to V2...");
        bytes memory initData = abi.encodeWithSelector(
            TALValidationRegistryV2.initializeV2.selector
        );

        // UUPS upgrade: call upgradeToAndCall on the proxy
        TALValidationRegistryV2(proxyAddress).upgradeToAndCall(
            address(v2Implementation),
            initData
        );
        console.log("  Upgrade complete");

        // 3. Verify V2 functions are accessible
        TALValidationRegistryV2 registry = TALValidationRegistryV2(proxyAddress);
        uint256 epoch = registry.currentEpoch();
        uint256 epochDuration = registry.EPOCH_DURATION();
        uint8 failureThreshold = registry.FAILURE_SCORE_THRESHOLD();

        console.log("  Current epoch:", epoch);
        console.log("  Epoch duration:", epochDuration);
        console.log("  Failure score threshold:", uint256(failureThreshold));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Upgrade Summary ===");
        console.log("  Proxy:              ", proxyAddress);
        console.log("  V2 Implementation:  ", address(v2Implementation));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Upgrade IdentityRegistry to V2 (depends on ValidationRegistry being V2)");
        console.log("  2. Verify contract on explorer");
        console.log("  3. Test getAgentValidationStats() via cast call");
    }
}
