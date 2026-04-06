// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PointsProgram.sol";
import "../src/BuilderProgram.sol";

contract DeployPrograms is Script {
    function run() external {
        address vaultFactory = vm.envAddress("VAULT_FACTORY");
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");
        address grantToken = vm.envAddress("GRANT_TOKEN");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        PointsProgram points = new PointsProgram(vaultFactory);
        console.log("PointsProgram deployed at:", address(points));

        BuilderProgram builder = new BuilderProgram(vaultFactory, agentRegistry, grantToken);
        console.log("BuilderProgram deployed at:", address(builder));

        vm.stopBroadcast();
    }
}
