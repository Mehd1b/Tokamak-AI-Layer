// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ReferralManager.sol";

contract DeployReferralManager is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 pointsPerDeposit = vm.envOr("POINTS_PER_DEPOSIT", uint256(100));

        vm.startBroadcast(deployerPrivateKey);

        ReferralManager rm = new ReferralManager(pointsPerDeposit);
        console.log("ReferralManager deployed at:", address(rm));
        console.log("Points per deposit:", pointsPerDeposit);

        vm.stopBroadcast();
    }
}
