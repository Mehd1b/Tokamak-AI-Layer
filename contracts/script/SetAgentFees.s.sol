// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TaskFeeEscrow.sol";

/**
 * @title SetAgentFees
 * @notice Re-set agent fees on the new TaskFeeEscrow after redeployment.
 *
 * Usage:
 *   cd contracts && forge script script/SetAgentFees.s.sol \
 *     --broadcast --rpc-url $THANOS_SEPOLIA_RPC_URL --legacy
 */
contract SetAgentFees is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        address escrowAddr = vm.envOr(
            "TASK_FEE_ESCROW",
            address(0x6D68Cd8fD89BF1746A1948783C92A00E591d1227)
        );

        TaskFeeEscrow escrow = TaskFeeEscrow(escrowAddr);
        console.log("Setting fees on escrow:", escrowAddr);

        vm.startBroadcast(deployerPrivateKey);

        // Only agents 4 and 7 still exist on Thanos Sepolia
        escrow.setAgentFee(4, 0.5 ether);   // Agent 4: 0.5 TON
        escrow.setAgentFee(7, 1 ether);     // Agent 7: 1 TON

        vm.stopBroadcast();

        // Verify
        console.log("Agent 4 fee:", escrow.getAgentFee(4));
        console.log("Agent 7 fee:", escrow.getAgentFee(7));
        console.log("Done.");
    }
}
