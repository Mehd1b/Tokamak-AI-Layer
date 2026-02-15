// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title UpgradeIdentityRegistry
 * @notice Upgrades TALIdentityRegistry proxy to latest consolidated implementation on Thanos Sepolia
 *
 * Network: Thanos Sepolia
 * Chain ID: 111551119090
 * RPC: https://rpc.thanos-sepolia.tokamak.network
 *
 * Usage:
 *   forge script script/UpgradeIdentityRegistry.s.sol \
 *     --broadcast --rpc-url https://rpc.thanos-sepolia.tokamak.network \
 *     --legacy
 *
 * Required env vars:
 *   - PRIVATE_KEY: Deployer private key (must have UPGRADER_ROLE on proxy)
 *   - IDENTITY_REGISTRY_PROXY: Proxy address (0x3f89CD27fD877827E7665A9883b3c0180E22A525)
 */
contract UpgradeIdentityRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address proxyAddress = vm.envOr(
            "IDENTITY_REGISTRY_PROXY",
            address(0x3f89CD27fD877827E7665A9883b3c0180E22A525)
        );

        console.log("=== TALIdentityRegistry Upgrade (Consolidated) ===");
        console.log("");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:", deployer);
        console.log("Proxy:", proxyAddress);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new consolidated implementation
        console.log("Deploying TALIdentityRegistry implementation...");
        TALIdentityRegistry newImpl = new TALIdentityRegistry();
        console.log("  Implementation:", address(newImpl));

        // 2. Upgrade proxy (no re-initialization needed -- V2+V3 already initialized)
        console.log("Upgrading proxy...");
        TALIdentityRegistry(proxyAddress).upgradeToAndCall(
            address(newImpl),
            bytes("")
        );
        console.log("  Upgrade complete");

        // 3. Verify functions are accessible
        TALIdentityRegistry registry = TALIdentityRegistry(proxyAddress);
        uint256 agentCount = registry.getAgentCount();
        console.log("  Agent count:", agentCount);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Upgrade Summary ===");
        console.log("  Proxy:          ", proxyAddress);
        console.log("  Implementation: ", address(newImpl));
    }
}
