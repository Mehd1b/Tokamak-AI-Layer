// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistry.sol";
import "../src/core/TALReputationRegistry.sol";
import "../src/core/TALValidationRegistry.sol";

/**
 * @title UpgradeAll
 * @notice Upgrades all three TAL core registry proxies to consolidated V1+V2+V3
 *         implementations and sets the WSTONVault address on each.
 *
 * @dev This script performs three steps per contract:
 *      1. Deploy new consolidated implementation
 *      2. Call upgradeToAndCall on the proxy (empty calldata -- V2/V3 already initialized)
 *      3. Call setWSTONVault(wstonVaultAddress) to wire up the vault
 *
 * Network: Thanos Sepolia
 * Chain ID: 111551119090
 * RPC: https://rpc.thanos-sepolia.tokamak.network
 *
 * Usage:
 *   forge script script/UpgradeAll.s.sol \
 *     --broadcast --rpc-url https://rpc.thanos-sepolia.tokamak.network \
 *     --legacy
 *
 * Required env vars:
 *   - PRIVATE_KEY: Deployer private key (must have UPGRADER_ROLE + DEFAULT_ADMIN_ROLE on all proxies)
 *
 * Optional env vars (defaults to deployed Thanos Sepolia addresses):
 *   - TAL_IDENTITY_REGISTRY_PROXY  (default: 0x3f89CD27fD877827E7665A9883b3c0180E22A525)
 *   - TAL_REPUTATION_REGISTRY_PROXY (default: 0x0052258E517835081c94c0B685409f2EfC4D502b)
 *   - TAL_VALIDATION_REGISTRY_PROXY (default: 0x09447147C6E75a60A449f38532F06E19F5F632F3)
 *   - WSTON_VAULT                   (default: 0x6aa6a7B9e51B636417025403053855B788107C27)
 */
contract UpgradeAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // --- Read proxy addresses (with Thanos Sepolia defaults) ---
        address identityProxy = vm.envOr(
            "TAL_IDENTITY_REGISTRY_PROXY",
            address(0x3f89CD27fD877827E7665A9883b3c0180E22A525)
        );
        address reputationProxy = vm.envOr(
            "TAL_REPUTATION_REGISTRY_PROXY",
            address(0x0052258E517835081c94c0B685409f2EfC4D502b)
        );
        address payable validationProxy = payable(vm.envOr(
            "TAL_VALIDATION_REGISTRY_PROXY",
            address(0x09447147C6E75a60A449f38532F06E19F5F632F3)
        ));
        address wstonVault = vm.envOr(
            "WSTON_VAULT",
            address(0x6aa6a7B9e51B636417025403053855B788107C27)
        );

        // --- Header ---
        console.log("=== TAL UpgradeAll (Consolidated V1+V2+V3) ===");
        console.log("");
        console.log("Network:    Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Deployer:  ", deployer);
        console.log("WSTONVault:", wstonVault);
        console.log("");
        console.log("Proxies:");
        console.log("  Identity:   ", identityProxy);
        console.log("  Reputation: ", reputationProxy);
        console.log("  Validation: ", validationProxy);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ============================================================
        // 1. TALIdentityRegistry
        // ============================================================
        console.log("--- TALIdentityRegistry ---");

        // 1a. Deploy new implementation
        TALIdentityRegistry newIdentityImpl = new TALIdentityRegistry();
        console.log("  New implementation:", address(newIdentityImpl));

        // 1b. Upgrade proxy (no re-initialization)
        TALIdentityRegistry(identityProxy).upgradeToAndCall(
            address(newIdentityImpl),
            bytes("")
        );
        console.log("  Proxy upgraded");

        // 1c. Set WSTONVault
        TALIdentityRegistry(identityProxy).setWSTONVault(wstonVault);
        console.log("  WSTONVault set");

        // 1d. Verify
        uint256 agentCount = TALIdentityRegistry(identityProxy).getAgentCount();
        address readBackVault = TALIdentityRegistry(identityProxy).wstonVault();
        console.log("  Agent count:", agentCount);
        console.log("  wstonVault: ", readBackVault);
        console.log("");

        // ============================================================
        // 2. TALReputationRegistry
        // ============================================================
        console.log("--- TALReputationRegistry ---");

        // 2a. Deploy new implementation
        TALReputationRegistry newReputationImpl = new TALReputationRegistry();
        console.log("  New implementation:", address(newReputationImpl));

        // 2b. Upgrade proxy (no re-initialization)
        TALReputationRegistry(reputationProxy).upgradeToAndCall(
            address(newReputationImpl),
            bytes("")
        );
        console.log("  Proxy upgraded");

        // 2c. Set WSTONVault
        TALReputationRegistry(reputationProxy).setWSTONVault(wstonVault);
        console.log("  WSTONVault set");

        // 2d. Verify
        address repIdentityAddr = address(TALReputationRegistry(reputationProxy).identityRegistry());
        address repVault = TALReputationRegistry(reputationProxy).wstonVault();
        console.log("  identityRegistry:", repIdentityAddr);
        console.log("  wstonVault:      ", repVault);
        console.log("");

        // ============================================================
        // 3. TALValidationRegistry
        // ============================================================
        console.log("--- TALValidationRegistry ---");

        // 3a. Deploy new implementation
        TALValidationRegistry newValidationImpl = new TALValidationRegistry();
        console.log("  New implementation:", address(newValidationImpl));

        // 3b. Upgrade proxy (no re-initialization)
        TALValidationRegistry(validationProxy).upgradeToAndCall(
            address(newValidationImpl),
            bytes("")
        );
        console.log("  Proxy upgraded");

        // 3c. Set WSTONVault
        TALValidationRegistry(validationProxy).setWSTONVault(wstonVault);
        console.log("  WSTONVault set");

        // 3d. Verify
        uint256 epoch = TALValidationRegistry(validationProxy).currentEpoch();
        uint256 minStake = TALValidationRegistry(validationProxy).MIN_AGENT_OWNER_STAKE();
        address valVault = TALValidationRegistry(validationProxy).wstonVault();
        console.log("  currentEpoch:       ", epoch);
        console.log("  MIN_AGENT_OWNER_STAKE:", minStake);
        console.log("  wstonVault:          ", valVault);
        console.log("");

        vm.stopBroadcast();

        // ============================================================
        // Summary
        // ============================================================
        console.log("=== Upgrade Summary ===");
        console.log("");
        console.log("TALIdentityRegistry:");
        console.log("  Proxy:          ", identityProxy);
        console.log("  Implementation: ", address(newIdentityImpl));
        console.log("  WSTONVault:     ", wstonVault);
        console.log("");
        console.log("TALReputationRegistry:");
        console.log("  Proxy:          ", reputationProxy);
        console.log("  Implementation: ", address(newReputationImpl));
        console.log("  WSTONVault:     ", wstonVault);
        console.log("");
        console.log("TALValidationRegistry:");
        console.log("  Proxy:          ", validationProxy);
        console.log("  Implementation: ", address(newValidationImpl));
        console.log("  WSTONVault:     ", wstonVault);
        console.log("");
        console.log("=== All Upgrades Complete ===");
        console.log("");
        console.log("Next steps:");
        console.log("  1. Update .env with new implementation addresses");
        console.log("  2. Verify contracts on explorer");
        console.log("  3. Test agent registration + feedback + validation on-chain");
    }
}
