// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { ExecutionGovernor } from "../src/ExecutionGovernor.sol";
import { IExecutionGovernor } from "../src/interfaces/IExecutionGovernor.sol";

/// @notice Mock vault with configurable owner
contract MockVaultForGov {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }
}

contract ExecutionGovernorTest is Test {
    ExecutionGovernor public governor;
    MockVaultForGov public vault;

    address public vaultOwner;
    address public nonOwner;

    uint32 public constant MIN_INTERVAL = 14400; // 4 hours
    uint32 public constant MAX_TRADES = 5;       // 5 per epoch
    uint32 public constant EPOCH_DURATION = 604800; // 1 week

    function setUp() public {
        vaultOwner = address(0xA001);
        nonOwner = address(0xDEAD);

        governor = new ExecutionGovernor();
        vault = new MockVaultForGov(vaultOwner);
    }

    // ============ Configuration ============

    function test_setFrequencyConfig() public {
        vm.prank(vaultOwner);
        vm.expectEmit(true, false, false, true);
        emit IExecutionGovernor.FrequencyConfigSet(
            address(vault), MIN_INTERVAL, MAX_TRADES, EPOCH_DURATION
        );
        governor.setFrequencyConfig(address(vault), MIN_INTERVAL, MAX_TRADES, EPOCH_DURATION);

        assertTrue(governor.isConfigured(address(vault)));

        IExecutionGovernor.FrequencyConfig memory config =
            governor.getFrequencyConfig(address(vault));
        assertEq(config.minIntervalSeconds, MIN_INTERVAL);
        assertEq(config.maxTradesPerEpoch, MAX_TRADES);
        assertEq(config.epochDurationSeconds, EPOCH_DURATION);
    }

    function test_setFrequencyConfig_revertsIfNotOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(IExecutionGovernor.NotVaultOwner.selector);
        governor.setFrequencyConfig(address(vault), MIN_INTERVAL, MAX_TRADES, EPOCH_DURATION);
    }

    function test_setFrequencyConfig_revertsOnZeroEpoch() public {
        vm.prank(vaultOwner);
        vm.expectRevert(IExecutionGovernor.InvalidConfig.selector);
        governor.setFrequencyConfig(address(vault), MIN_INTERVAL, MAX_TRADES, 0);
    }

    function test_setFrequencyConfig_revertsOnZeroMaxTrades() public {
        vm.prank(vaultOwner);
        vm.expectRevert(IExecutionGovernor.InvalidConfig.selector);
        governor.setFrequencyConfig(address(vault), MIN_INTERVAL, 0, EPOCH_DURATION);
    }

    // ============ Record Execution ============

    function test_recordExecution_firstExecution() public {
        _configureVault();

        vm.warp(1000);
        vm.expectEmit(true, false, false, true);
        emit IExecutionGovernor.ExecutionRecorded(address(vault), 1000, 1);
        governor.recordExecution(address(vault));

        IExecutionGovernor.ExecutionState memory state =
            governor.getExecutionState(address(vault));
        assertEq(state.lastExecutionTimestamp, 1000);
        assertEq(state.epochTradeCount, 1);
    }

    function test_recordExecution_respectsMinInterval() public {
        _configureVault();

        vm.warp(1000);
        governor.recordExecution(address(vault));

        // Try again before interval elapsed
        vm.warp(1000 + MIN_INTERVAL - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IExecutionGovernor.IntervalNotElapsed.selector,
                uint64(1000),
                uint64(1000 + MIN_INTERVAL - 1),
                MIN_INTERVAL
            )
        );
        governor.recordExecution(address(vault));

        // Should succeed after interval
        vm.warp(1000 + MIN_INTERVAL);
        governor.recordExecution(address(vault));
    }

    function test_recordExecution_maxTradesPerEpoch() public {
        _configureVault();

        // Execute MAX_TRADES times
        for (uint32 i = 0; i < MAX_TRADES; i++) {
            vm.warp(1000 + uint256(i) * MIN_INTERVAL);
            governor.recordExecution(address(vault));
        }

        // Next execution should fail (still in same epoch)
        vm.warp(1000 + uint256(MAX_TRADES) * MIN_INTERVAL);
        vm.expectRevert(
            abi.encodeWithSelector(
                IExecutionGovernor.MaxTradesPerEpochExceeded.selector,
                MAX_TRADES,
                MAX_TRADES
            )
        );
        governor.recordExecution(address(vault));
    }

    function test_recordExecution_epochReset() public {
        _configureVault();

        // Execute MAX_TRADES times in first epoch
        for (uint32 i = 0; i < MAX_TRADES; i++) {
            vm.warp(1000 + uint256(i) * MIN_INTERVAL);
            governor.recordExecution(address(vault));
        }

        // Move to next epoch -> should succeed
        vm.warp(1000 + EPOCH_DURATION);
        governor.recordExecution(address(vault));

        IExecutionGovernor.ExecutionState memory state =
            governor.getExecutionState(address(vault));
        assertEq(state.epochTradeCount, 1, "Trade count should reset in new epoch");
    }

    function test_recordExecution_revertsIfNotConfigured() public {
        vm.expectRevert(IExecutionGovernor.VaultNotConfigured.selector);
        governor.recordExecution(address(vault));
    }

    // ============ canExecute ============

    function test_canExecute_allowedInitially() public {
        _configureVault();

        vm.warp(1000);
        (bool allowed, string memory reason) = governor.canExecute(address(vault));
        assertTrue(allowed);
        assertEq(bytes(reason).length, 0);
    }

    function test_canExecute_intervalNotElapsed() public {
        _configureVault();

        vm.warp(1000);
        governor.recordExecution(address(vault));

        vm.warp(1000 + MIN_INTERVAL - 1);
        (bool allowed, string memory reason) = governor.canExecute(address(vault));
        assertFalse(allowed);
        assertEq(reason, "Interval not elapsed");
    }

    function test_canExecute_maxTradesExceeded() public {
        _configureVault();

        for (uint32 i = 0; i < MAX_TRADES; i++) {
            vm.warp(1000 + uint256(i) * MIN_INTERVAL);
            governor.recordExecution(address(vault));
        }

        vm.warp(1000 + uint256(MAX_TRADES) * MIN_INTERVAL);
        (bool allowed, string memory reason) = governor.canExecute(address(vault));
        assertFalse(allowed);
        assertEq(reason, "Max trades per epoch exceeded");
    }

    function test_canExecute_unconfiguredVault() public view {
        (bool allowed, string memory reason) = governor.canExecute(address(vault));
        assertFalse(allowed);
        assertEq(reason, "Vault not configured");
    }

    // ============ Zero Interval Config ============

    function test_zeroInterval_allowsConsecutive() public {
        vm.prank(vaultOwner);
        governor.setFrequencyConfig(address(vault), 0, 100, EPOCH_DURATION);

        vm.warp(1000);
        governor.recordExecution(address(vault));
        governor.recordExecution(address(vault));
        governor.recordExecution(address(vault));

        IExecutionGovernor.ExecutionState memory state =
            governor.getExecutionState(address(vault));
        assertEq(state.epochTradeCount, 3);
    }

    // ============ Config Update ============

    function test_configUpdate_resetsLimits() public {
        _configureVault();

        // Execute all trades in epoch
        for (uint32 i = 0; i < MAX_TRADES; i++) {
            vm.warp(1000 + uint256(i) * MIN_INTERVAL);
            governor.recordExecution(address(vault));
        }

        // Update config to allow more trades
        vm.prank(vaultOwner);
        governor.setFrequencyConfig(address(vault), MIN_INTERVAL, 10, EPOCH_DURATION);

        // Should now be allowed (epoch trade count still there but new max is 10)
        vm.warp(1000 + uint256(MAX_TRADES) * MIN_INTERVAL);
        governor.recordExecution(address(vault));
    }

    // ============ Multiple Vaults ============

    function test_multipleVaults_independent() public {
        MockVaultForGov vault2 = new MockVaultForGov(vaultOwner);

        vm.startPrank(vaultOwner);
        governor.setFrequencyConfig(address(vault), MIN_INTERVAL, 2, EPOCH_DURATION);
        governor.setFrequencyConfig(address(vault2), MIN_INTERVAL, 2, EPOCH_DURATION);
        vm.stopPrank();

        // Execute on vault1
        vm.warp(1000);
        governor.recordExecution(address(vault));

        vm.warp(1000 + MIN_INTERVAL);
        governor.recordExecution(address(vault));

        // vault1 exhausted, but vault2 should still work
        vm.warp(1000 + 2 * MIN_INTERVAL);
        vm.expectRevert();
        governor.recordExecution(address(vault));

        governor.recordExecution(address(vault2));
    }

    // ============ Helpers ============

    function _configureVault() internal {
        vm.prank(vaultOwner);
        governor.setFrequencyConfig(address(vault), MIN_INTERVAL, MAX_TRADES, EPOCH_DURATION);
    }
}
