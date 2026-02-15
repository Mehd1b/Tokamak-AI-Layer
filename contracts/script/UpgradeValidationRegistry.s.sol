// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALValidationRegistry.sol";

/**
 * @title UpgradeValidationRegistry
 * @notice Upgrades TALValidationRegistry proxy to latest consolidated implementation on Thanos Sepolia
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

        address payable proxyAddress = payable(vm.envOr(
            "VALIDATION_REGISTRY_PROXY",
            address(0x09447147C6E75a60A449f38532F06E19F5F632F3)
        ));

        console.log("=== TALValidationRegistry Upgrade (Consolidated) ===");
        console.log("");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:", deployer);
        console.log("Proxy:", proxyAddress);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new consolidated implementation
        console.log("Deploying TALValidationRegistry implementation...");
        TALValidationRegistry newImpl = new TALValidationRegistry();
        console.log("  Implementation:", address(newImpl));

        // 2. Upgrade proxy (no re-initialization needed -- V2+V3 already initialized)
        console.log("Upgrading proxy...");
        TALValidationRegistry(proxyAddress).upgradeToAndCall(
            address(newImpl),
            bytes("")
        );
        console.log("  Upgrade complete");

        // 3. Verify functions are accessible
        TALValidationRegistry registry = TALValidationRegistry(proxyAddress);
        uint256 epoch = registry.currentEpoch();
        console.log("  Current epoch:", epoch);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Upgrade Summary ===");
        console.log("  Proxy:          ", proxyAddress);
        console.log("  Implementation: ", address(newImpl));
    }
}
