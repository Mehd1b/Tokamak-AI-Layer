// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { KernelVault } from "../src/KernelVault.sol";
import { KernelOutputParser } from "../src/KernelOutputParser.sol";
import { MockKernelExecutionVerifier } from "./mocks/MockKernelExecutionVerifier.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

/// @title KernelVault Snapshot PPS Tests
/// @notice Tests for yield dilution protection via snapshot PPS accounting
/// @dev Validates that CALL actions reducing tracked asset balance trigger PPS snapshots,
///      preventing new depositors from minting shares at artificially low prices.
contract KernelVaultSnapshotPPSTest is Test {
    KernelVault public vault;
    KernelVault public ethVault;
    MockKernelExecutionVerifier public mockVerifier;
    MockERC20 public token;

    address public userA = address(0x1111111111111111111111111111111111111111);
    address public userB = address(0x2222222222222222222222222222222222222222);
    address public externalProtocol = address(0x3333333333333333333333333333333333333333);

    bytes32 public constant AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant IMAGE_ID = bytes32(uint256(0x1234));

    bytes public constant DUMMY_JOURNAL = hex"00";
    bytes public constant DUMMY_SEAL = hex"00";

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
        vault = new KernelVault(address(token), address(mockVerifier), AGENT_ID, IMAGE_ID);

        // Deploy ETH vault
        ethVault = new KernelVault(address(0), address(mockVerifier), AGENT_ID, IMAGE_ID);

        // Fund users
        token.mint(userA, 1000 ether);
        token.mint(userB, 1000 ether);

        vm.prank(userA);
        token.approve(address(vault), type(uint256).max);
        vm.prank(userB);
        token.approve(address(vault), type(uint256).max);
    }

    // ============ Helpers ============

    /// @notice Build a CALL action that transfers ERC20 tokens from vault to an external address
    /// @dev Simulates vault calling token.transfer(to, amount) — reducing tracked asset balance
    function _buildTokenTransferCall(address to, uint256 amount)
        internal
        view
        returns (bytes memory)
    {
        bytes memory callData =
            abi.encodeWithSignature("transfer(address,uint256)", to, amount);
        bytes memory payload = abi.encode(uint256(0), callData);

        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_CALL,
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

    /// @notice Build two CALL actions in one execution
    function _buildTwoTokenTransferCalls(address to1, uint256 amount1, address to2, uint256 amount2)
        internal
        view
        returns (bytes memory)
    {
        bytes memory callData1 =
            abi.encodeWithSignature("transfer(address,uint256)", to1, amount1);
        bytes memory callData2 =
            abi.encodeWithSignature("transfer(address,uint256)", to2, amount2);

        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](2);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_CALL,
            target: bytes32(uint256(uint160(address(token)))),
            payload: abi.encode(uint256(0), callData1)
        });
        actions[1] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_CALL,
            target: bytes32(uint256(uint160(address(token)))),
            payload: abi.encode(uint256(0), callData2)
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

    /// @notice Exact attack scenario from the plan — verify fair share distribution
    function test_yieldDilution_snapshotPrevents() public {
        // Step 1: User A deposits 100 ETH worth of tokens → 100 shares (PPS=1.0)
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);
        assertEq(vault.shares(userA), 100 ether);
        assertEq(vault.totalAssets(), 100 ether);

        // Step 2: CALL stakes 90 tokens externally → vault has 10 tokens + 90 elsewhere
        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 90 ether);
        _executeWithCommitment(vault, agentOutput);

        // Verify state: totalAssets dropped but strategy is active with snapshot
        assertEq(vault.totalAssets(), 10 ether);
        assertTrue(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 100 ether);
        assertEq(vault.effectiveTotalAssets(), 100 ether);

        // Step 3: User B deposits 100 tokens — should get ~100 shares (not 1000!)
        vm.prank(userB);
        uint256 userBShares = vault.depositERC20Tokens(100 ether);

        // shares = 100 * 100 / 100 = 100 (fair price, NOT 100 * 100 / 10 = 1000)
        assertEq(userBShares, 100 ether);

        // Step 4: Assets return (simulate unstaking — 90 tokens + 30 yield = 120 return)
        token.mint(address(vault), 90 ether);
        // Now vault has 10 + 100 (userB) + 90 (returned) = 200 tokens
        // Snapshot updated to 200 (100 original + 100 userB deposit), settle
        vault.settle();

        assertEq(vault.totalAssets(), 200 ether);
        assertEq(vault.totalShares(), 200 ether);
        assertFalse(vault.strategyActive());

        // Step 5: Both users withdraw — fair distribution
        vm.prank(userA);
        uint256 userAOut = vault.withdraw(100 ether);
        vm.prank(userB);
        uint256 userBOut = vault.withdraw(100 ether);

        // Both get 100 tokens each (1:1 PPS since no yield in this scenario)
        assertEq(userAOut, 100 ether);
        assertEq(userBOut, 100 ether);
    }

    // ============ Strategy Activation ============

    /// @notice Strategy becomes active when CALL reduces tracked asset balance
    function test_strategyActive_afterCallReducesBalance() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        assertFalse(vault.strategyActive());

        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 50 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 100 ether);
        assertEq(vault.snapshotTotalShares(), 100 ether);
    }

    /// @notice Strategy does NOT activate when CALL doesn't reduce balance
    function test_strategyNotActive_whenCallDoesntReduceBalance() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // Build a CALL action that transfers 0 tokens (balance unchanged)
        bytes memory callData =
            abi.encodeWithSignature("transfer(address,uint256)", externalProtocol, uint256(0));
        bytes memory payload = abi.encode(uint256(0), callData);

        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_CALL,
            target: bytes32(uint256(uint160(address(token)))),
            payload: payload
        });
        bytes memory agentOutput = KernelOutputParser.encodeAgentOutput(actions);

        _executeWithCommitment(vault, agentOutput);

        // Balance unchanged, strategy should NOT activate
        assertFalse(vault.strategyActive());
        assertEq(vault.totalAssets(), 100 ether);
    }

    // ============ Deposits During Strategy ============

    /// @notice Deposits during active strategy use snapshot PPS (not artificially low live PPS)
    function test_deposit_duringStrategy_usesSnapshotPPS() public {
        // User A deposits 200 tokens → 200 shares
        vm.prank(userA);
        vault.depositERC20Tokens(200 ether);

        // CALL sends 150 tokens externally → totalAssets = 50, but snapshot = 200
        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 150 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        assertEq(vault.effectiveTotalAssets(), 200 ether);

        // User B deposits 100 tokens
        // Without snapshot: shares = 100 * 200 / 50 = 400 (BAD - dilution!)
        // With snapshot: shares = 100 * 200 / 200 = 100 (FAIR)
        vm.prank(userB);
        uint256 sharesMinted = vault.depositERC20Tokens(100 ether);
        assertEq(sharesMinted, 100 ether);

        // Snapshot should be updated to include new deposit
        assertEq(vault.snapshotTotalAssets(), 300 ether); // 200 + 100
        assertEq(vault.snapshotTotalShares(), 300 ether); // 200 + 100
    }

    // ============ Withdrawals During Strategy ============

    /// @notice Withdrawals during active strategy use snapshot PPS
    function test_withdraw_duringStrategy_usesSnapshotPPS() public {
        // User A deposits 100 tokens → 100 shares
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // CALL sends 80 tokens externally
        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 80 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        // totalAssets = 20, effectiveTotalAssets = 100

        // User A withdraws 10 shares
        // With snapshot PPS: assetsOut = 10 * 100 / 100 = 10 tokens (fair)
        vm.prank(userA);
        uint256 assetsOut = vault.withdraw(10 ether);
        assertEq(assetsOut, 10 ether);

        // Snapshot should be updated
        assertEq(vault.snapshotTotalAssets(), 90 ether); // 100 - 10
        assertEq(vault.snapshotTotalShares(), 90 ether); // 100 - 10
    }

    /// @notice Withdrawal reverts if requested amount exceeds available balance
    function test_withdraw_duringStrategy_capsToAvailableBalance() public {
        // User A deposits 100 tokens → 100 shares
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // CALL sends 90 tokens externally → only 10 available
        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 90 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        assertEq(vault.totalAssets(), 10 ether);

        // Try to withdraw 50 shares → PPS says 50 tokens, but only 10 available
        vm.prank(userA);
        vm.expectRevert(
            abi.encodeWithSelector(KernelVault.InsufficientAvailableAssets.selector, 50 ether, 10 ether)
        );
        vault.withdraw(50 ether);
    }

    // ============ Settlement ============

    /// @notice settle() clears strategy and restores live accounting
    function test_settle_restoresLiveAccounting() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 60 ether);
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

    /// @notice Auto-settle when CALL returns balance to >= snapshot level
    function test_settle_autoOnBalanceRecovery() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // CALL sends 50 tokens externally
        bytes memory agentOutput1 = _buildTokenTransferCall(externalProtocol, 50 ether);
        _executeWithCommitment(vault, agentOutput1);

        assertTrue(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 100 ether);

        // Simulate tokens returning to vault externally
        token.mint(address(vault), 60 ether);
        // Now totalAssets = 50 + 60 - 50 (sent) = 110 > 100 (snapshot)
        // Wait, let me recalculate: after first call, vault has 50. Then we mint 60 → vault has 110.
        assertEq(vault.totalAssets(), 110 ether);

        // Next CALL action (even a no-balance-change one) should trigger auto-settle
        // since balance (110) >= snapshot (100)
        // Build a CALL that doesn't change ERC20 balance (calls external protocol with 0 value)
        // Actually, we need a CALL action that goes through _executeCall
        // The simplest: call external protocol to set storage (no token movement)
        // But we need externalProtocol to be a contract. Let's use a different approach:
        // Transfer 0 tokens via CALL
        bytes memory callData =
            abi.encodeWithSignature("transfer(address,uint256)", externalProtocol, uint256(0));
        bytes memory payload = abi.encode(uint256(0), callData);

        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_CALL,
            target: bytes32(uint256(uint160(address(token)))),
            payload: payload
        });
        bytes memory agentOutput2 = KernelOutputParser.encodeAgentOutput(actions);
        _executeWithCommitment(vault, agentOutput2);

        // Should have auto-settled since balance (110) >= snapshot (100)
        assertFalse(vault.strategyActive());
        assertEq(vault.snapshotTotalAssets(), 0);
        assertEq(vault.snapshotTotalShares(), 0);
    }

    /// @notice settle() reverts when strategy is not active
    function test_settle_revertsWhenNotActive() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        assertFalse(vault.strategyActive());

        vm.expectRevert(KernelVault.StrategyNotActive.selector);
        vault.settle();
    }

    // ============ Multiple Calls ============

    /// @notice Multiple CALL actions in one execution — snapshot taken once (on first decrease)
    function test_multipleCallsInExecution_snapshotOnce() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // Build two CALL actions: first sends 30, second sends 20
        bytes memory agentOutput =
            _buildTwoTokenTransferCalls(externalProtocol, 30 ether, externalProtocol, 20 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());
        // Snapshot should capture state BEFORE first decrease (100 tokens, 100 shares)
        assertEq(vault.snapshotTotalAssets(), 100 ether);
        assertEq(vault.snapshotTotalShares(), 100 ether);
        // Actual balance is 50 (100 - 30 - 20)
        assertEq(vault.totalAssets(), 50 ether);
    }

    // ============ ETH Vault ============

    /// @notice Snapshot PPS works for ETH vaults
    function test_ethVault_snapshotPPS() public {
        // Fund users with ETH
        vm.deal(userA, 100 ether);
        vm.deal(userB, 100 ether);

        // User A deposits 100 ETH
        vm.prank(userA);
        ethVault.depositETH{ value: 100 ether }();
        assertEq(ethVault.shares(userA), 100 ether);

        // CALL sends 80 ETH to external protocol
        bytes memory agentOutput = _buildETHSendCall(externalProtocol, 80 ether);
        _executeWithCommitment(ethVault, agentOutput);

        assertTrue(ethVault.strategyActive());
        assertEq(ethVault.snapshotTotalAssets(), 100 ether);
        assertEq(address(ethVault).balance, 20 ether);

        // User B deposits 100 ETH — should get 100 shares (not 500)
        vm.prank(userB);
        uint256 sharesMinted = ethVault.depositETH{ value: 100 ether }();
        assertEq(sharesMinted, 100 ether);
    }

    // ============ Convert Functions During Strategy ============

    /// @notice convertToShares uses effectiveTotalAssets during active strategy
    function test_convertToShares_duringStrategy_usesEffective() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // CALL sends 80 tokens externally
        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 80 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());

        // Without snapshot: convertToShares(100) = 100 * 100 / 20 = 500 (wrong)
        // With snapshot: convertToShares(100) = 100 * 100 / 100 = 100 (correct)
        assertEq(vault.convertToShares(100 ether), 100 ether);
    }

    /// @notice convertToAssets uses effectiveTotalAssets during active strategy
    function test_convertToAssets_duringStrategy_usesEffective() public {
        vm.prank(userA);
        vault.depositERC20Tokens(100 ether);

        // CALL sends 80 tokens externally
        bytes memory agentOutput = _buildTokenTransferCall(externalProtocol, 80 ether);
        _executeWithCommitment(vault, agentOutput);

        assertTrue(vault.strategyActive());

        // Without snapshot: convertToAssets(100) = 100 * 20 / 100 = 20 (wrong)
        // With snapshot: convertToAssets(100) = 100 * 100 / 100 = 100 (correct)
        assertEq(vault.convertToAssets(100 ether), 100 ether);
    }
}
