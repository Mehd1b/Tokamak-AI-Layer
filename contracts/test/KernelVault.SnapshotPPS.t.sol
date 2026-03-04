// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { KernelVault } from "../src/KernelVault.sol";
import { KernelOutputParser } from "../src/KernelOutputParser.sol";
import { MockKernelExecutionVerifier } from "./mocks/MockKernelExecutionVerifier.sol";
import { MockCallTarget } from "./mocks/MockCallTarget.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

/// @title KernelVault Snapshot PPS Tests
/// @notice Tests for yield dilution protection via snapshot PPS accounting
/// @dev Validates that TRANSFER_ERC20 and CALL actions reducing tracked asset balance trigger
///      PPS snapshots, preventing new depositors from minting shares at artificially low prices.
///      Share amounts reflect the 1000x virtual offset (first deposit of X → X*1000 shares).
contract KernelVaultSnapshotPPSTest is Test {
    KernelVault public vault;
    KernelVault public ethVault;
    MockKernelExecutionVerifier public mockVerifier;
    MockERC20 public token;
    MockCallTarget public callTarget;

    address public userA = address(0x1111111111111111111111111111111111111111);
    address public userB = address(0x2222222222222222222222222222222222222222);
    address public externalProtocol = address(0x3333333333333333333333333333333333333333);

    bytes32 public constant AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant IMAGE_ID = bytes32(uint256(0x1234));

    bytes public constant DUMMY_JOURNAL = hex"00";
    bytes public constant DUMMY_SEAL = hex"00";

    /// @dev Virtual offset multiplier — first deposit of X assets yields X * OFFSET shares
    uint256 internal constant OFFSET = 1000;

    uint64 public nextNonce = 1;

    function setUp() public {
        // Deploy mock verifier
        mockVerifier = new MockKernelExecutionVerifier();
        mockVerifier.setJournal(
            AGENT_ID,
            bytes32(uint256(0xC0DE)),
            bytes32(uint256(0xC0175A1)),
            bytes32(uint256(0x1200700)),
            1,
            bytes32(uint256(0x11207)),
            bytes32(0)
        );

        // Deploy mock ERC20 token
        token = new MockERC20("Test Token", "TEST", 18);

        // Deploy ERC20 vault
        vault = new KernelVault(address(token), address(mockVerifier), AGENT_ID, IMAGE_ID, address(this));

        // Deploy ETH vault
        ethVault = new KernelVault(address(0), address(mockVerifier), AGENT_ID, IMAGE_ID, address(this));

        // Deploy mock call target (for tests that need a non-asset CALL target)
        callTarget = new MockCallTarget();

        // Fund users
        token.mint(userA, 1000 ether);
        token.mint(userB, 1000 ether);

        vm.prank(userA);
        token.approve(address(vault), type(uint256).max);
        vm.prank(userB);
        token.approve(address(vault), type(uint256).max);
    }

    // ============ Helpers ============

    /// @notice Build a TRANSFER_ERC20 action that sends vault asset tokens to an external address
    function _buildTransferAction(address to, uint256 amount)
        internal
        view
        returns (bytes memory)
    {
        bytes memory payload = abi.encode(address(token), to, amount);

        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(uint256(uint160(address(token)))),
            payload: payload
        });

        return KernelOutputParser.encodeAgentOutput(actions);
    }

    /// @notice Build a CALL action that sends ETH from vault to an external address
    function _buildETHSendCall(address to, uint256 amount)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory payload = abi.encode(amount, bytes(""));

        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_CALL,
            target: bytes32(uint256(uint160(to))),
            payload: payload
        });

        return KernelOutputParser.encodeAgentOutput(actions);
    }

    /// @notice Build two TRANSFER_ERC20 actions in one execution
    function _buildTwoTransferActions(address to1, uint256 amount1, address to2, uint256 amount2)
        internal
        view
        returns (bytes memory)
    {
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](2);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(uint256(uint160(address(token)))),
            payload: abi.encode(address(token), to1, amount1)
        });
        actions[1] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(uint256(uint160(address(token)))),
            payload: abi.encode(address(token), to2, amount2)
        });

        return KernelOutputParser.encodeAgentOutput(actions);
    }

    /// @notice Build a NO_OP action (for testing non-balance-changing executions)
    function _buildNoOpAction() internal pure returns (bytes memory) {
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_NO_OP,
            target: bytes32(0),
            payload: ""
        });

        return KernelOutputParser.encodeAgentOutput(actions);
    }

    /// @notice Configure mock and execute
    function _executeWithCommitment(KernelVault v, bytes memory agentOutput) internal {
        bytes32 commitment = sha256(agentOutput);
        mockVerifier.setActionCommitment(commitment);
        mockVerifier.setExecutionNonce(nextNonce);
        v.execute(DUMMY_JOURNAL, DUMMY_SEAL, agentOutput);
        nextNonce++;
    }

    // ============ Core: Yield Dilution Prevention ============

    /// @notice Exact attack scenario — deposits blocked during strategy prevent yield dilution
    function test_yieldDilution_depositsBlockedDuringStrategy() public {
        // Step 1: User A deposits 100 tokens → 100_000 shares (virtual offset: 100 * 1000)
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);
        assertEq(vault.shares(userA), 100 ether * OFFSET);
        assertEq(vault.totalAssets(), 100 ether);

        // Step 2: TRANSFER_ERC20 sends 90 tokens externally → vault has 10 tokens + 90 elsewhere
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 90 ether);
        _executeWithCommitment(vault, agentOutput);

        // Verify state: totalAssets dropped but strategy is active with snapshot
        assertEq(vault.totalAssets(), 10 ether);
        assertTrue(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 100 ether);
        assertEq(vault.effectiveTotalAssets(), 100 ether);

        // Step 3: User B tries to deposit — BLOCKED
        vm.prank(userB);
        vm.expectRevert(KernelVault.DepositsLockedDuringStrategy.selector);
        vault.depositERC20Tokens(100 ether);

        // Step 4: Assets return with profit (90 principal + 10 yield = 100 returned)
        token.mint(address(vault), 90 ether);
        vault.settle();

        assertEq(vault.totalAssets(), 100 ether);
        assertEq(vault.totalShares(), 100 ether * OFFSET);
        assertFalse(vault.strategyActive());

        // Step 5: User A withdraws all — gets full amount (no dilution)
        vm.prank(userA);
        uint256 userAOut = vault.withdraw(100 ether * OFFSET);
        assertEq(userAOut, 100 ether);

        // Vault is now empty (totalAssets=0, totalShares=0)
        assertEq(vault.totalShares(), 0);
        assertEq(vault.totalAssets(), 0);

        // Step 6: User B deposits into empty vault at 1:OFFSET
        vm.prank(userB);
        uint256 userBShares = vault.depositERC20Tokens(100 ether);
        assertEq(userBShares, 100 ether * OFFSET);
    }

    // ============ Strategy Activation ============

    /// @notice Strategy becomes active when TRANSFER_ERC20 reduces tracked asset balance
    function test_strategyActive_afterTransferReducesBalance() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        assertFalse(vault.strategyActive());

        bytes memory agentOutput = _buildTransferAction(externalProtocol, 50 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 100 ether);
        assertEq(vault.snapshotTotalShares(), 100 ether * OFFSET);
    }

    /// @notice Strategy does NOT activate when a non-balance-changing action is executed
    function test_strategyNotActive_whenNoBalanceChange() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // Execute a NO_OP action (balance unchanged)
        bytes memory agentOutput = _buildNoOpAction();
        _executeWithCommitment(vault, agentOutput);

        // Balance unchanged, strategy should NOT activate
        assertFalse(vault.strategyActive());
        assertEq(vault.totalAssets(), 100 ether);
    }

    // ============ Deposits During Strategy ============

    /// @notice Deposits during active strategy are blocked entirely
    function test_deposit_duringStrategy_reverts() public {
        // User A deposits 200 tokens → 200_000 shares
        vm.prank(userA);
        vault.depositERC20Tokens(200 ether);

        // TRANSFER_ERC20 sends 150 tokens externally → totalAssets = 50, but snapshot = 200
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 150 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());

        // User B tries to deposit — BLOCKED
        vm.prank(userB);
        vm.expectRevert(KernelVault.DepositsLockedDuringStrategy.selector);
        vault.depositERC20Tokens(100 ether);
    }

    // ============ Withdrawals During Strategy ============

    /// @notice Withdrawals during active strategy use snapshot PPS
    function test_withdraw_duringStrategy_usesSnapshotPPS() public {
        // User A deposits 100 tokens → 100_000 shares
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // TRANSFER_ERC20 sends 80 tokens externally
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 80 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        // totalAssets = 20, effectiveTotalAssets = 100

        // User A withdraws 10_000 shares (10 ether worth at snapshot PPS)
        // With snapshot PPS + offset: assetsOut = 10_000 * (100 + 1) / (100_000 + 1000) = 10 tokens
        vm.prank(userA);
        uint256 assetsOut = vault.withdraw(10 ether * OFFSET);
        assertEq(assetsOut, 10 ether);

        // Snapshot should be updated
        assertEq(vault.snapshotTotalAssets(), 90 ether); // 100 - 10
        assertEq(vault.snapshotTotalShares(), 90 ether * OFFSET); // 100_000 - 10_000
    }

    /// @notice Withdrawal reverts if requested amount exceeds available balance
    function test_withdraw_duringStrategy_capsToAvailableBalance() public {
        // User A deposits 100 tokens → 100_000 shares
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // TRANSFER_ERC20 sends 90 tokens externally → only 10 available
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 90 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        assertEq(vault.totalAssets(), 10 ether);

        // Try to withdraw 50_000 shares → PPS says 50 tokens, but only 10 available
        vm.prank(userA);
        vm.expectRevert(
            abi.encodeWithSelector(KernelVault.InsufficientAvailableAssets.selector, 50 ether, 10 ether)
        );
        vault.withdraw(50 ether * OFFSET);
    }

    // ============ Settlement ============

    /// @notice settle() clears strategy and restores live accounting
    function test_settle_restoresLiveAccounting() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        bytes memory agentOutput = _buildTransferAction(externalProtocol, 60 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());

        // Simulate assets returning
        token.mint(address(vault), 60 ether);

        // Settle
        vm.expectEmit(false, false, false, true);
        emit KernelVault.StrategySettled(100 ether, 100 ether);
        vault.settle();

        assertFalse(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 0);
        assertEq(vault.snapshotTotalShares(), 0);
        assertEq(vault.effectiveTotalAssets(), vault.totalAssets());
    }

    /// @notice No auto-settle — strategy stays active even when balance recovers
    function test_noAutoSettle_balanceRecoveryDoesNotSettle() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // TRANSFER_ERC20 sends 50 tokens externally
        bytes memory agentOutput1 = _buildTransferAction(externalProtocol, 50 ether);
        _executeWithCommitment(vault, agentOutput1);

        assertTrue(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 100 ether);

        // Simulate tokens returning to vault
        token.mint(address(vault), 60 ether);
        assertEq(vault.totalAssets(), 110 ether);

        // Execute a NO_OP — strategy should NOT auto-settle
        bytes memory agentOutput2 = _buildNoOpAction();
        _executeWithCommitment(vault, agentOutput2);

        // Strategy stays active — owner must call settle() explicitly
        assertTrue(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 100 ether);

        // Owner settles
        vault.settle();
        assertFalse(vault.strategyActive());
    }

    /// @notice settle() reverts when strategy is not active
    function test_settle_revertsWhenNotActive() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        assertFalse(vault.strategyActive());

        vm.expectRevert(KernelVault.StrategyNotActive.selector);
        vault.settle();
    }

    /// @notice settle() reverts when called by non-owner (prevents griefing to bypass deposit lock)
    function test_settle_revertsWhenNotOwner() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        bytes memory agentOutput = _buildTransferAction(externalProtocol, 50 ether);
        _executeWithCommitment(vault, agentOutput);
        assertTrue(vault.strategyActive());

        // Non-owner tries to settle to bypass deposit lock — BLOCKED
        vm.prank(userB);
        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.settle();

        // Strategy still active, deposits still locked
        assertTrue(vault.strategyActive());
    }

    // ============ Multiple Transfers ============

    /// @notice Multiple TRANSFER_ERC20 actions in one execution — snapshot taken once (on first decrease)
    function test_multipleTransfersInExecution_snapshotOnce() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // Build two TRANSFER_ERC20 actions: first sends 30, second sends 20
        bytes memory agentOutput =
            _buildTwoTransferActions(externalProtocol, 30 ether, externalProtocol, 20 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        // Snapshot should capture state BEFORE first decrease (100 tokens, 100_000 shares)
        assertEq(vault.snapshotTotalAssets(), 100 ether);
        assertEq(vault.snapshotTotalShares(), 100 ether * OFFSET);
        // Actual balance is 50 (100 - 30 - 20)
        assertEq(vault.totalAssets(), 50 ether);
    }

    // ============ ETH Vault ============

    /// @notice ETH deposits blocked during active strategy
    function test_ethVault_depositBlocked_duringStrategy() public {
        // Fund users with ETH
        vm.deal(userA, 100 ether);
        vm.deal(userB, 100 ether);

        // User A deposits 100 ETH → 100_000 shares
        vm.prank(userA);
        ethVault.depositETH{ value: 100 ether }();
        assertEq(ethVault.shares(userA), 100 ether * OFFSET);

        // CALL sends 80 ETH to external protocol
        bytes memory agentOutput = _buildETHSendCall(externalProtocol, 80 ether);
        _executeWithCommitment(ethVault, agentOutput);

        assertTrue(ethVault.strategyActive());
        assertEq(ethVault.snapshotTotalAssets(), 100 ether);
        assertEq(address(ethVault).balance, 20 ether);

        // User B tries to deposit ETH — BLOCKED
        vm.prank(userB);
        vm.expectRevert(KernelVault.DepositsLockedDuringStrategy.selector);
        ethVault.depositETH{ value: 100 ether }();
    }

    // ============ Convert Functions During Strategy ============

    /// @notice convertToShares uses effectiveTotalAssets during active strategy
    function test_convertToShares_duringStrategy_usesEffective() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // TRANSFER_ERC20 sends 80 tokens externally
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 80 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());

        // With snapshot (effective=100): convertToShares(100) = 100 * (100_000 + 1000) / (100 + 1)
        // = 100 * 101_000 / 101 = 100_000 shares (exact)
        assertEq(vault.convertToShares(100 ether), 100 ether * OFFSET);
    }

    /// @notice Deposit succeeds after strategy settles at correct post-profit PPS
    function test_deposit_afterSettlement_succeeds() public {
        // User A deposits 100 tokens → 100_000 shares
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // TRANSFER_ERC20 sends 80 tokens externally
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 80 ether);
        _executeWithCommitment(vault, agentOutput);
        assertTrue(vault.strategyActive());

        // Assets return with profit: 80 principal + 20 yield = 100 returned
        token.mint(address(vault), 100 ether);
        // Vault now has 20 (remaining) + 100 (returned) = 120 tokens
        vault.settle();

        assertFalse(vault.strategyActive());
        assertEq(vault.totalAssets(), 120 ether);
        assertEq(vault.totalShares(), 100 ether * OFFSET);
        // PPS = 120/100_000 → 1.2 per 1000 shares

        // User B deposits 120 tokens → gets ~100_000 shares
        // shares = 120 * (100_000 + 1000) / (120 + 1) = 120 * 101_000 / 121
        vm.prank(userB);
        uint256 sharesMinted = vault.depositERC20Tokens(120 ether);
        // Should be very close to 100_000 ether (approximately, due to virtual offset rounding)
        assertApproxEqAbs(sharesMinted, 100 ether * OFFSET, 1e3);
    }

    /// @notice Full yield dilution prevention scenario end-to-end
    function test_yieldDilution_prevented_fullScenario() public {
        // Step 1: User A deposits 10 tokens → 10_000 shares
        vm.prank(userA);
        vault.depositERC20Tokens(10 ether);

        // Step 2: Operator deploys all 10 tokens to external protocol
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 10 ether);
        _executeWithCommitment(vault, agentOutput);
        assertTrue(vault.strategyActive());
        assertEq(vault.totalAssets(), 0);

        // Step 3: User B tries to front-run settlement — BLOCKED
        vm.prank(userB);
        vm.expectRevert(KernelVault.DepositsLockedDuringStrategy.selector);
        vault.depositERC20Tokens(10 ether);

        // Step 4: Operator returns with profit (10 + 2 = 12)
        token.mint(address(vault), 12 ether);
        vault.settle();

        assertFalse(vault.strategyActive());
        assertEq(vault.totalAssets(), 12 ether);
        assertEq(vault.totalShares(), 10 ether * OFFSET);
        // PPS = 12/10_000

        // Step 5: User A withdraws — gets FULL profit (1 wei rounding from virtual offset)
        vm.prank(userA);
        uint256 userAOut = vault.withdraw(10 ether * OFFSET);
        assertApproxEqAbs(userAOut, 12 ether, 1); // All 12 tokens go to A (no dilution!)

        // Vault is nearly empty (≤1 wei rounding dust)
        assertEq(vault.totalShares(), 0);
        assertLe(vault.totalAssets(), 1);
    }

    /// @notice convertToAssets uses effectiveTotalAssets during active strategy
    function test_convertToAssets_duringStrategy_usesEffective() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // TRANSFER_ERC20 sends 80 tokens externally
        bytes memory agentOutput = _buildTransferAction(externalProtocol, 80 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());

        // With snapshot (effective=100): convertToAssets(100_000) = 100_000 * (100 + 1) / (100_000 + 1000)
        // = 100_000 * 101 / 101_000 = 100 (exact)
        assertEq(vault.convertToAssets(100 ether * OFFSET), 100 ether);
    }
}
