// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ReferralManager.sol";

contract DeployReferralManager is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        ReferralManager rm = new ReferralManager();
        console.log("ReferralManager deployed at:", address(rm));

        vm.stopBroadcast();
    }
}
