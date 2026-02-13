// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistryV2.sol";

/**
 * @title UpgradeIdentityV2Impl
 * @notice Deploys a new TALIdentityRegistryV2 implementation and upgrades the proxy.
 *         Use this when V2 is already initialized and you only need to update the bytecode.
 *
 * Usage:
 *   IDENTITY_REGISTRY_PROXY=0x3f89CD27fD877827E7665A9883b3c0180E22A525 \
 *   forge script script/UpgradeIdentityV2Impl.s.sol \
 *     --broadcast --rpc-url $THANOS_SEPOLIA_RPC_URL --legacy
 */
contract UpgradeIdentityV2Impl is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address proxyAddress = vm.envOr(
            "IDENTITY_REGISTRY_PROXY",
            address(0x3f89CD27fD877827E7665A9883b3c0180E22A525)
        );

        TALIdentityRegistryV2 proxy = TALIdentityRegistryV2(proxyAddress);

        console.log("=== TALIdentityRegistryV2 Implementation Upgrade ===");
        console.log("Deployer:", deployer);
        console.log("Proxy:", proxyAddress);
        console.log("Agent count (before):", proxy.getAgentCount());

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new implementation
        TALIdentityRegistryV2 newImpl = new TALIdentityRegistryV2();
        console.log("New implementation:", address(newImpl));

        // 2. Upgrade proxy (no re-initialization needed)
        proxy.upgradeToAndCall(address(newImpl), bytes(""));
        console.log("Proxy upgraded");

        vm.stopBroadcast();

        // 3. Verify
        console.log("Agent count (after):", proxy.getAgentCount());
        console.log("Protocol treasury:", proxy.protocolTreasury());
        console.log("");
        console.log("Done. New implementation:", address(newImpl));
    }
}
