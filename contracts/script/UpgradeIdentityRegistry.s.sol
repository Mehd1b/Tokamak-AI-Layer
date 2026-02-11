// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistryV2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title UpgradeIdentityRegistry
 * @notice Upgrades TALIdentityRegistry proxy to V2 on Thanos Sepolia
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
 *
 * Optional env vars:
 *   - PROTOCOL_TREASURY: Treasury for slashed funds (defaults to deployer)
 *   - STAKING_BRIDGE: L2 staking bridge address (keeps existing if not set)
 *   - VALIDATION_REGISTRY: 0x09447147C6E75a60A449f38532F06E19F5F632F3
 *   - REPUTATION_REGISTRY: 0x0052258E517835081c94c0B685409f2EfC4D502b
 *   - MIN_OPERATOR_STAKE: In wei (default: 1000e18 = 1000 TON)
 *   - REACTIVATION_COOLDOWN: In seconds (default: 604800 = 7 days)
 */
contract UpgradeIdentityRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Required
        address proxyAddress = vm.envAddress("IDENTITY_REGISTRY_PROXY");

        // Optional with defaults
        address protocolTreasury = vm.envOr("PROTOCOL_TREASURY", deployer);
        address stakingBridge = vm.envOr("STAKING_BRIDGE", address(0));
        address validationRegistryAddr = vm.envOr(
            "VALIDATION_REGISTRY",
            address(0x09447147C6E75a60A449f38532F06E19F5F632F3)
        );
        address reputationRegistryAddr = vm.envOr(
            "REPUTATION_REGISTRY",
            address(0x0052258E517835081c94c0B685409f2EfC4D502b)
        );
        uint256 minOperatorStake = vm.envOr("MIN_OPERATOR_STAKE", uint256(1000 ether));
        uint256 reactivationCooldown = vm.envOr("REACTIVATION_COOLDOWN", uint256(7 days));

        console.log("=== TALIdentityRegistry V2 Upgrade ===");
        console.log("");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:", deployer);
        console.log("Proxy:", proxyAddress);
        console.log("Treasury:", protocolTreasury);
        console.log("Staking Bridge:", stakingBridge);
        console.log("Validation Registry:", validationRegistryAddr);
        console.log("Reputation Registry:", reputationRegistryAddr);
        console.log("Min Operator Stake:", minOperatorStake);
        console.log("Reactivation Cooldown:", reactivationCooldown);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new V2 implementation
        console.log("Deploying TALIdentityRegistryV2 implementation...");
        TALIdentityRegistryV2 v2Implementation = new TALIdentityRegistryV2();
        console.log("  V2 Implementation:", address(v2Implementation));

        // 2. Upgrade proxy to V2 + call initializeV2
        console.log("Upgrading proxy to V2...");
        bytes memory initData = abi.encodeWithSelector(
            TALIdentityRegistryV2.initializeV2.selector,
            protocolTreasury,
            stakingBridge,
            validationRegistryAddr,
            reputationRegistryAddr,
            minOperatorStake,
            reactivationCooldown
        );

        // UUPS upgrade: call upgradeToAndCall on the proxy
        TALIdentityRegistryV2(proxyAddress).upgradeToAndCall(
            address(v2Implementation),
            initData
        );
        console.log("  Upgrade complete");

        // 3. Verify: check existing agents still work
        TALIdentityRegistryV2 registry = TALIdentityRegistryV2(proxyAddress);
        uint256 agentCount = registry.getAgentCount();
        console.log("  Agent count:", agentCount);
        console.log("  Protocol treasury:", registry.protocolTreasury());
        console.log("  Min operator stake:", registry.minOperatorStake());
        console.log("  Reactivation cooldown:", registry.reactivationCooldown());

        // 4. Verify an existing agent (if any) defaults to ACTIVE + ReputationOnly
        if (agentCount > 0) {
            uint256 firstAgentId = 1;
            uint8 status = registry.getAgentStatus(firstAgentId);
            uint8 model = registry.getAgentValidationModel(firstAgentId);
            console.log("  Agent #1 status:", status, "(expected 0=ACTIVE)");
            console.log("  Agent #1 model:", model, "(expected 0=ReputationOnly)");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Upgrade Summary ===");
        console.log("  Proxy:              ", proxyAddress);
        console.log("  V2 Implementation:  ", address(v2Implementation));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Verify contract on explorer");
        console.log("  2. Test registerV2() with operator consent");
        console.log("  3. Update SDK ABI and clients");
        console.log("  4. Update agent-server to check agent status");
    }
}
