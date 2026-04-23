// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";
import { IVaultFactory } from "../../src/interfaces/IVaultFactory.sol";
import { TokagentVault } from "../../src/TokagentVault.sol";

/// @notice End-to-end smoke test: deploys an empty-allowlist Tokagent vault via the factory,
///         verifies deployment state, and prints the address for manual inspection.
/// @dev Env vars:
///        - VAULT_FACTORY_PROXY
///        - TOKAGENT_OPERATOR: operator address for the test vault
///        - TOKAGENT_USER_SALT (optional, defaults to 0xdeadbeef): CREATE2 salt
contract DeployTokagentVaultTest is Script {
    function run() external returns (address vault) {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        address operator = vm.envAddress("TOKAGENT_OPERATOR");
        bytes32 userSalt;
        try vm.envBytes32("TOKAGENT_USER_SALT") returns (bytes32 s) {
            userSalt = s;
        } catch {
            userSalt = bytes32(uint256(0xdeadbeef));
        }

        IVaultFactory.TokagentEntry[] memory entries = new IVaultFactory.TokagentEntry[](0);
        IVaultFactory.TokagentApprovalSpec[] memory approvals = new IVaultFactory.TokagentApprovalSpec[](0);

        vm.startBroadcast();
        vault = VaultFactory(proxy).deployTokagentVault(operator, entries, approvals, userSalt);
        vm.stopBroadcast();

        TokagentVault v = TokagentVault(payable(vault));
        console.log("Tokagent vault deployed:", vault);
        console.log("  owner:", v.owner());
        console.log("  operator:", v.operator());
        console.log("  vaultKind:", vm.toString(v.vaultKind()));
        require(v.vaultKind() == keccak256("TokagentVault:v1"), "wrong vaultKind");
        require(VaultFactory(proxy).isDeployedVault(vault), "not tracked");
    }
}
