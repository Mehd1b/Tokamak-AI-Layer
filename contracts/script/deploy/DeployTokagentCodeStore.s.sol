// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { TokagentVaultCreationCodeStore } from "../../src/TokagentVaultCreationCodeStore.sol";

/// @notice Deploys the TokagentVaultCreationCodeStore on the target chain.
/// @dev Usage: forge script script/deploy/DeployTokagentCodeStore.s.sol --rpc-url $RPC --private-key $PK --broadcast --legacy
contract DeployTokagentCodeStore is Script {
    function run() external returns (address store) {
        vm.startBroadcast();
        store = address(new TokagentVaultCreationCodeStore());
        vm.stopBroadcast();
        console.log("TokagentVaultCreationCodeStore deployed to:", store);
    }
}
