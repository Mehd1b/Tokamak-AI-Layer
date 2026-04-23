// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";

/// @notice Deploys a new VaultFactory implementation (v4, includes deployTokagentVault)
///         and schedules the UUPS upgrade via the 48h timelock.
/// @dev Required env vars:
///        - VAULT_FACTORY_PROXY: the existing factory proxy address on the target chain
/// @dev Usage: forge script script/deploy/DeployTokagentFactoryUpgrade.s.sol --rpc-url $RPC --private-key $OWNER_PK --broadcast --legacy
contract DeployTokagentFactoryUpgrade is Script {
    function run() external returns (address newImpl) {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        vm.startBroadcast();
        newImpl = address(new VaultFactory());
        VaultFactory(proxy).scheduleImplementation(newImpl);
        vm.stopBroadcast();
        console.log("New VaultFactory impl:", newImpl);
        console.log("Scheduled on proxy:", proxy);
        console.log("Activates at:", VaultFactory(proxy).pendingImplementationActivatesAt());
    }
}
