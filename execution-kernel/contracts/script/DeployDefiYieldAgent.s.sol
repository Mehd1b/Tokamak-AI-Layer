// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { VaultFactory } from "../src/VaultFactory.sol";

/// @title DeployDefiYieldAgent
/// @notice Registers the DeFi yield farming agent and deploys a vault.
/// @dev Uses real AAVE V3 Pool on Ethereum Sepolia for lending operations.
///
/// AAVE V3 Sepolia Addresses (from bgd-labs/aave-address-book):
///   Pool:  0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951
///   DAI:   0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357
///   USDC:  0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
///   WETH:  0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c
contract DeployDefiYieldAgent is Script {
    function run() external {
        // Load addresses from environment
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address factoryAddr = vm.envAddress("VAULT_FACTORY");

        AgentRegistry registry = AgentRegistry(registryAddr);
        VaultFactory factory = VaultFactory(factoryAddr);

        // DeFi yield farmer agent parameters
        // imageId: placeholder for testnet (real imageId requires RISC Zero compilation)
        // agentCodeHash: from `cargo build -p defi-yield-farmer` output
        bytes32 imageId = vm.envBytes32("DEFI_AGENT_IMAGE_ID");
        bytes32 agentCodeHash = vm.envBytes32("DEFI_AGENT_CODE_HASH");
        bytes32 salt = keccak256("defi-yield-farmer-v1");

        // Vault uses DAI as the asset token (ERC20, not ETH)
        address asset = vm.envAddress("AAVE_ASSET_TOKEN");
        bytes32 userSalt = keccak256("defi-yield-vault-v1");

        console.log("=== Deploy DeFi Yield Farming Agent ===");
        console.log("AgentRegistry:", registryAddr);
        console.log("VaultFactory:", factoryAddr);
        console.log("AAVE Pool:", vm.envAddress("AAVE_POOL"));
        console.log("Asset Token:", asset);

        vm.startBroadcast();

        // Step 1: Register the agent
        bytes32 agentId = registry.register(salt, imageId, agentCodeHash);
        console.log("Agent registered with ID:");
        console.logBytes32(agentId);

        // Step 2: Deploy vault via factory
        address vault = factory.deployVault(agentId, asset, userSalt, imageId);
        console.log("Vault deployed at:", vault);

        vm.stopBroadcast();

        // Verification
        console.log("\n=== Verification ===");
        console.log("Agent count:", registry.agentCount());
        console.log("Vault count:", factory.vaultCount());
        console.log("Agent exists:", registry.agentExists(agentId));
        console.log("Vault is deployed:", factory.isDeployedVault(vault));
        console.log("\n=== AAVE V3 Integration Notes ===");
        console.log("The vault must approve the AAVE Pool to spend the asset token");
        console.log("before the agent can execute supply() actions.");
        console.log("Vault needs to call: asset.approve(AAVE_POOL, type(uint256).max)");
    }
}
