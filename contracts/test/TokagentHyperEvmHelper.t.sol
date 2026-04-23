// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { TokagentHyperEvmHelper } from "../src/TokagentHyperEvmHelper.sol";

// ============================================================================
// Mock contracts
// ============================================================================

/// @notice Accepts native ETH/HYPE and records the amount received.
contract MockBridge {
    uint256 public received;

    receive() external payable {
        received += msg.value;
    }
}

/// @notice Records raw calldata from the first call it receives.
contract MockCoreWriterReceiver {
    bytes public lastCalldata;
    bool public called;

    fallback(bytes calldata data) external returns (bytes memory) {
        lastCalldata = data;
        called = true;
        return "";
    }

    receive() external payable {}
}

/// @notice Reverts unconditionally — used to test error paths.
contract RevertingTarget {
    fallback() external {
        revert("forced revert");
    }

    receive() external payable {
        revert("forced revert");
    }
}

// ============================================================================
// Test suite
// ============================================================================

contract TokagentHyperEvmHelperTest is Test {
    TokagentHyperEvmHelper public helper;

    // Well-known HyperCore addresses
    address constant HYPE_BRIDGE    = 0x2222222222222222222222222222222222222222;
    address constant CORE_WRITER    = 0x3333333333333333333333333333333333333333;

    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");

    function setUp() public {
        helper = new TokagentHyperEvmHelper();
        // Fund test callers with HYPE
        vm.deal(alice, 100 ether);
        vm.deal(bob,   100 ether);
    }

    // ─── bridgeHype ─────────────────────────────────────────────────────────

    function test_bridgeHype_forwardsValueToBridge() public {
        // Deploy a mock bridge at the well-known address
        MockBridge mockBridge = new MockBridge();
        vm.etch(HYPE_BRIDGE, address(mockBridge).code);

        uint256 amount = 1 ether;

        vm.expectEmit(true, false, false, true);
        emit TokagentHyperEvmHelper.HypeBridged(alice, amount);

        vm.prank(alice);
        helper.bridgeHype{value: amount}(amount);

        // Bridge received the value
        assertEq(HYPE_BRIDGE.balance, amount);
    }

    function test_bridgeHype_emitsHypeBridgedEvent() public {
        MockBridge mockBridge = new MockBridge();
        vm.etch(HYPE_BRIDGE, address(mockBridge).code);

        uint256 amount = 0.5 ether;

        vm.expectEmit(true, false, false, true);
        emit TokagentHyperEvmHelper.HypeBridged(bob, amount);

        vm.prank(bob);
        helper.bridgeHype{value: amount}(amount);
    }

    function test_bridgeHype_revertsOnAmountMismatch_moreThanAmount() public {
        MockBridge mockBridge = new MockBridge();
        vm.etch(HYPE_BRIDGE, address(mockBridge).code);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentHyperEvmHelper.AmountMismatch.selector, 2 ether, 1 ether)
        );
        helper.bridgeHype{value: 2 ether}(1 ether);
    }

    function test_bridgeHype_revertsOnAmountMismatch_lessThanAmount() public {
        MockBridge mockBridge = new MockBridge();
        vm.etch(HYPE_BRIDGE, address(mockBridge).code);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentHyperEvmHelper.AmountMismatch.selector, 0.5 ether, 1 ether)
        );
        helper.bridgeHype{value: 0.5 ether}(1 ether);
    }

    function test_bridgeHype_revertsWhenBridgeFails() public {
        // Etch a reverting contract at the bridge address
        RevertingTarget reverter = new RevertingTarget();
        vm.etch(HYPE_BRIDGE, address(reverter).code);

        vm.prank(alice);
        vm.expectRevert(TokagentHyperEvmHelper.BridgeFailed.selector);
        helper.bridgeHype{value: 1 ether}(1 ether);
    }

    function test_bridgeHype_anyoneCanCall_noAccessControl() public {
        MockBridge mockBridge = new MockBridge();
        vm.etch(HYPE_BRIDGE, address(mockBridge).code);

        // Both alice and bob can call without restriction
        vm.prank(alice);
        helper.bridgeHype{value: 0.1 ether}(0.1 ether);

        vm.prank(bob);
        helper.bridgeHype{value: 0.2 ether}(0.2 ether);

        assertEq(HYPE_BRIDGE.balance, 0.3 ether);
    }

    function testFuzz_bridgeHype_forwardsCorrectAmount(uint96 amount) public {
        vm.assume(amount > 0);
        MockBridge mockBridge = new MockBridge();
        vm.etch(HYPE_BRIDGE, address(mockBridge).code);

        address caller = makeAddr("fuzzcaller");
        vm.deal(caller, uint256(amount));

        vm.prank(caller);
        helper.bridgeHype{value: amount}(amount);

        assertEq(HYPE_BRIDGE.balance, uint256(amount));
    }

    // ─── dispatchCoreWriter ──────────────────────────────────────────────────

    function test_dispatchCoreWriter_forwardsActionBytesToCoreWriter() public {
        MockCoreWriterReceiver mockCW = new MockCoreWriterReceiver();
        vm.etch(CORE_WRITER, address(mockCW).code);

        // Canonical limit-order action bytes: version=1, actionId=1 (little-endian 3 bytes)
        bytes memory actionBytes = abi.encodePacked(
            uint8(1),        // version
            uint24(1),       // actionId = limit order
            abi.encode(
                uint32(0),   // asset
                true,        // isBuy
                uint64(100_000_000_000), // limitPx in 1e8 = $1000
                uint64(10_000_000),      // sz in szDecimals units
                false,       // reduceOnly
                uint8(2),    // tif = IOC
                uint128(0)   // cloid
            )
        );

        bytes4 expectedHeader = bytes4(actionBytes);

        vm.expectEmit(true, false, false, true);
        emit TokagentHyperEvmHelper.CoreWriterDispatched(alice, expectedHeader, actionBytes.length);

        vm.prank(alice);
        helper.dispatchCoreWriter(actionBytes);
    }

    function test_dispatchCoreWriter_calldataReceivedByCoreWriter() public {
        MockCoreWriterReceiver mockCW = new MockCoreWriterReceiver();
        vm.etch(CORE_WRITER, address(mockCW).code);

        bytes memory actionBytes = hex"01000001aabbccdd";

        vm.prank(alice);
        helper.dispatchCoreWriter(actionBytes);

        // Verify the CoreWriter mock received the exact bytes
        MockCoreWriterReceiver cw = MockCoreWriterReceiver(payable(CORE_WRITER));
        assertEq(cw.lastCalldata(), actionBytes);
        assertTrue(cw.called());
    }

    function test_dispatchCoreWriter_revertsWhenCoreWriterFails() public {
        RevertingTarget reverter = new RevertingTarget();
        vm.etch(CORE_WRITER, address(reverter).code);

        bytes memory actionBytes = hex"01000001aabbccdd";

        vm.prank(alice);
        vm.expectRevert(TokagentHyperEvmHelper.CoreWriterCallFailed.selector);
        helper.dispatchCoreWriter(actionBytes);
    }

    function test_dispatchCoreWriter_revertsOnTooShortData() public {
        MockCoreWriterReceiver mockCW = new MockCoreWriterReceiver();
        vm.etch(CORE_WRITER, address(mockCW).code);

        // 3 bytes — shorter than the 4-byte minimum
        bytes memory shortData = hex"010000";

        vm.prank(alice);
        vm.expectRevert(TokagentHyperEvmHelper.CoreWriterCallFailed.selector);
        helper.dispatchCoreWriter(shortData);
    }

    function test_dispatchCoreWriter_anyoneCanCall_noAccessControl() public {
        MockCoreWriterReceiver mockCW = new MockCoreWriterReceiver();
        vm.etch(CORE_WRITER, address(mockCW).code);

        bytes memory actionBytes = hex"01000001aabbccdd";

        vm.prank(alice);
        helper.dispatchCoreWriter(actionBytes);

        vm.prank(bob);
        helper.dispatchCoreWriter(actionBytes);
    }

    // ─── Constants ───────────────────────────────────────────────────────────

    function test_constants_hypeBridgeAddress() public view {
        assertEq(address(helper.HYPE_BRIDGE()), HYPE_BRIDGE);
    }

    function test_constants_coreWriterAddress() public view {
        assertEq(helper.CORE_WRITER(), CORE_WRITER);
    }

    // ─── Selector verification ────────────────────────────────────────────────

    function test_selector_bridgeHype() public pure {
        // keccak256("bridgeHype(uint256)")[0:4]
        bytes4 expected = bytes4(keccak256("bridgeHype(uint256)"));
        assertEq(expected, TokagentHyperEvmHelper.bridgeHype.selector);
        assertEq(expected, bytes4(0xf4e0b185));
    }

    function test_selector_dispatchCoreWriter() public pure {
        // keccak256("dispatchCoreWriter(bytes)")[0:4]
        bytes4 expected = bytes4(keccak256("dispatchCoreWriter(bytes)"));
        assertEq(expected, TokagentHyperEvmHelper.dispatchCoreWriter.selector);
        assertEq(expected, bytes4(0xa62c829a));
    }
}
