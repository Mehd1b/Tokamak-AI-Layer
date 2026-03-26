// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { KernelExecutionVerifier } from "../src/KernelExecutionVerifier.sol";
import { VaultFactory } from "../src/VaultFactory.sol";

/// @title DeployCore
/// @notice Deploys AgentRegistry, KernelExecutionVerifier, VaultFactory proxies.
///         Assumes VaultCreationCodeStore is already deployed.
contract DeployCore is Script {
    function run() external {
        address risc0Verifier = vm.envAddress("RISC0_VERIFIER_ROUTER");
        address codeStore = vm.envAddress("VAULT_CODE_STORE");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        // AgentRegistry
        AgentRegistry registryImpl = new AgentRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (deployer))
        );
        console.log("AgentRegistry:", address(registryProxy));

        // KernelExecutionVerifier
        KernelExecutionVerifier verifierImpl = new KernelExecutionVerifier();
        ERC1967Proxy verifierProxy = new ERC1967Proxy(
            address(verifierImpl),
            abi.encodeCall(KernelExecutionVerifier.initialize, (risc0Verifier, deployer))
        );
        console.log("KernelExecutionVerifier:", address(verifierProxy));

        // VaultFactory
        VaultFactory factoryImpl = new VaultFactory();
        ERC1967Proxy factoryProxy = new ERC1967Proxy(
            address(factoryImpl),
            abi.encodeCall(
                VaultFactory.initialize,
                (address(registryProxy), address(verifierProxy), deployer, codeStore)
            )
        );
        console.log("VaultFactory:", address(factoryProxy));

        // Link
        AgentRegistry(address(registryProxy)).setFactory(address(factoryProxy));
        console.log("Registry linked to Factory");

        vm.stopBroadcast();
    }
}
