// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @notice Activates a previously scheduled VaultFactory UUPS upgrade.
///         Must be called >= 48h after scheduling.
/// @dev Required env vars:
///        - VAULT_FACTORY_PROXY: the factory proxy address
/// @dev Usage: forge script script/deploy/ActivateTokagentFactoryUpgrade.s.sol --rpc-url $RPC --private-key $OWNER_PK --broadcast --legacy
contract ActivateTokagentFactoryUpgrade is Script {
    function run() external {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        address scheduled = VaultFactory(proxy).pendingImplementation();
        require(scheduled != address(0), "no scheduled implementation");
        console.log("Activating scheduled impl:", scheduled);

        vm.startBroadcast();
        UUPSUpgradeable(proxy).upgradeToAndCall(scheduled, "");
        vm.stopBroadcast();

        console.log("Upgrade activated");
    }
}
