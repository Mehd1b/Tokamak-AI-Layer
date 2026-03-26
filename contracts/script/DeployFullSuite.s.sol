// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { KernelExecutionVerifier } from "../src/KernelExecutionVerifier.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { VaultCreationCodeStore } from "../src/VaultCreationCodeStore.sol";
import { OptimisticVaultCreationCodeStore } from "../src/VaultCreationCodeStore.sol";

/// @title DeployFullSuite
/// @notice Deploys the complete Tokamak AI Layer contract suite on HyperEVM Mainnet.
contract DeployFullSuite is Script {
    function run() external {
        address risc0Verifier = vm.envAddress("RISC0_VERIFIER_ROUTER");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== Tokamak AI Layer - Full Contract Deployment ===");
        console.log("Deployer:", deployer);
        console.log("RISC0 Verifier:", risc0Verifier);

        vm.startBroadcast(deployerKey);

        // 1. Deploy VaultCreationCodeStore
        VaultCreationCodeStore codeStore = new VaultCreationCodeStore();
        console.log("[1/7] VaultCreationCodeStore:", address(codeStore));

        // 2. Deploy OptimisticVaultCreationCodeStore
        OptimisticVaultCreationCodeStore optimisticCodeStore = new OptimisticVaultCreationCodeStore();
        console.log("[2/7] OptimisticVaultCreationCodeStore:", address(optimisticCodeStore));

        // 3. Deploy AgentRegistry (UUPS proxy)
        AgentRegistry registryImpl = new AgentRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (deployer))
        );
        AgentRegistry registry = AgentRegistry(address(registryProxy));
        console.log("[3/7] AgentRegistry:", address(registry));

        // 4. Deploy KernelExecutionVerifier (UUPS proxy)
        KernelExecutionVerifier verifierImpl = new KernelExecutionVerifier();
        ERC1967Proxy verifierProxy = new ERC1967Proxy(
            address(verifierImpl),
            abi.encodeCall(KernelExecutionVerifier.initialize, (risc0Verifier, deployer))
        );
        KernelExecutionVerifier verifier = KernelExecutionVerifier(address(verifierProxy));
        console.log("[4/7] KernelExecutionVerifier:", address(verifier));

        // 5. Deploy VaultFactory (UUPS proxy)
        VaultFactory factoryImpl = new VaultFactory();
        ERC1967Proxy factoryProxy = new ERC1967Proxy(
            address(factoryImpl),
            abi.encodeCall(
                VaultFactory.initialize,
                (address(registry), address(verifier), deployer, address(codeStore))
            )
        );
        VaultFactory factory = VaultFactory(address(factoryProxy));
        console.log("[5/7] VaultFactory:", address(factory));

        // 6. Link AgentRegistry to VaultFactory
        registry.setFactory(address(factory));
        console.log("[6/7] AgentRegistry linked to VaultFactory");

        // 7. Set OptimisticVaultCreationCodeStore in VaultFactory
        factory.setOptimisticVaultCreationCodeStore(address(optimisticCodeStore));
        console.log("[7/7] Optimistic code store registered");

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("AgentRegistry:            ", address(registry));
        console.log("KernelExecutionVerifier:  ", address(verifier));
        console.log("VaultFactory:             ", address(factory));
        console.log("VaultCreationCodeStore:   ", address(codeStore));
        console.log("OptCodeStore:             ", address(optimisticCodeStore));
    }
}
