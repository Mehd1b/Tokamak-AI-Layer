// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";

/// @notice Wires the deployed TokagentVaultCreationCodeStore into the upgraded VaultFactory.
/// @dev Required env vars:
///        - VAULT_FACTORY_PROXY: upgraded factory (v4)
///        - TOKAGENT_CODE_STORE: address returned by DeployTokagentCodeStore
/// @dev Usage: forge script script/deploy/SetTokagentCodeStore.s.sol --rpc-url $RPC --private-key $OWNER_PK --broadcast --legacy
contract SetTokagentCodeStore is Script {
    function run() external {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        address store = vm.envAddress("TOKAGENT_CODE_STORE");
        vm.startBroadcast();
        VaultFactory(proxy).setTokagentVaultCreationCodeStoreOnce(store);
        vm.stopBroadcast();
        console.log("Tokagent code store set:", store);
    }
}
