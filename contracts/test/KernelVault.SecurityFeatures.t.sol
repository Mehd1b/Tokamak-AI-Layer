// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { KernelVault } from "../src/KernelVault.sol";
import { KernelExecutionVerifier } from "../src/KernelExecutionVerifier.sol";
import { KernelOutputParser } from "../src/KernelOutputParser.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { MockVerifier } from "./mocks/MockVerifier.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title KernelVault Security Features Tests
/// @notice Tests for pause/unpause, emergencySettle, emergencyWithdraw,
///         transferOwnership, and CALL self-blocking
contract KernelVaultSecurityFeaturesTest is Test {
    KernelVault public vault;
    KernelExecutionVerifier public executionVerifier;
    MockVerifier public mockRiscZeroVerifier;
    MockERC20 public token;

    address public vaultOwner = address(this);
    address public user = address(0x1111111111111111111111111111111111111111);
    address public user2 = address(0x3333333333333333333333333333333333333333);
    address public recipient = address(0x2222222222222222222222222222222222222222);
    address public attacker = address(0x4444444444444444444444444444444444444444);

    bytes32 public constant TEST_AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant TEST_IMAGE_ID = bytes32(uint256(0x1234));
    bytes32 public constant TEST_CODE_HASH = bytes32(uint256(0xC0DE));
    bytes32 public constant TEST_CONSTRAINT_HASH = bytes32(uint256(0xC0175A1));
    bytes32 public constant TEST_INPUT_ROOT = bytes32(uint256(0x1200700));
    bytes32 public constant TEST_INPUT_COMMITMENT = bytes32(uint256(0x11207));

    uint256 public constant INITIAL_BALANCE = 1000 ether;
    uint256 public constant DEPOSIT_AMOUNT = 100 ether;
    uint256 internal constant OFFSET = 1000;

    function setUp() public {
        mockRiscZeroVerifier = new MockVerifier();

        KernelExecutionVerifier verifierImpl = new KernelExecutionVerifier();
        ERC1967Proxy verifierProxy = new ERC1967Proxy(
            address(verifierImpl),
            abi.encodeCall(
                KernelExecutionVerifier.initialize, (address(mockRiscZeroVerifier), address(this))
            )
        );
        executionVerifier = KernelExecutionVerifier(address(verifierProxy));

        token = new MockERC20("Test Token", "TEST", 18);

        vault = new KernelVault(
            address(token), address(executionVerifier), TEST_AGENT_ID, TEST_IMAGE_ID, address(this)
        );

        token.mint(user, INITIAL_BALANCE);
        token.mint(user2, INITIAL_BALANCE);

        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
        vm.prank(user2);
        token.approve(address(vault), type(uint256).max);
    }

    // ============ Helper Functions ============

    function _depositAs(address depositor, uint256 amount) internal {
        vm.prank(depositor);
        vault.depositERC20Tokens(amount);
    }

    function _buildJournal(bytes32 agentId, uint64 nonce, bytes32 actionCommitment)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory journal = new bytes(209);
        journal[0] = 0x01;
        journal[1] = 0x00;
        journal[2] = 0x00;
        journal[3] = 0x00;
        journal[4] = 0x01;
        journal[5] = 0x00;
        journal[6] = 0x00;
        journal[7] = 0x00;
        for (uint256 i = 0; i < 32; i++) {
            journal[8 + i] = agentId[i];
        }
        bytes32 codeHash = TEST_CODE_HASH;
        for (uint256 i = 0; i < 32; i++) {
            journal[40 + i] = codeHash[i];
        }
        bytes32 constraintHash = TEST_CONSTRAINT_HASH;
        for (uint256 i = 0; i < 32; i++) {
            journal[72 + i] = constraintHash[i];
        }
        bytes32 inputRoot = TEST_INPUT_ROOT;
        for (uint256 i = 0; i < 32; i++) {
            journal[104 + i] = inputRoot[i];
        }
        journal[136] = bytes1(uint8(nonce & 0xFF));
        journal[137] = bytes1(uint8((nonce >> 8) & 0xFF));
        journal[138] = bytes1(uint8((nonce >> 16) & 0xFF));
        journal[139] = bytes1(uint8((nonce >> 24) & 0xFF));
        journal[140] = bytes1(uint8((nonce >> 32) & 0xFF));
        journal[141] = bytes1(uint8((nonce >> 40) & 0xFF));
        journal[142] = bytes1(uint8((nonce >> 48) & 0xFF));
        journal[143] = bytes1(uint8((nonce >> 56) & 0xFF));
        bytes32 inputCommitment = TEST_INPUT_COMMITMENT;
        for (uint256 i = 0; i < 32; i++) {
            journal[144 + i] = inputCommitment[i];
        }
        for (uint256 i = 0; i < 32; i++) {
            journal[176 + i] = actionCommitment[i];
        }
        journal[208] = 0x01;
        return journal;
    }

    function _buildTransferAction(address tokenAddr, address to, uint256 amount)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory payload = abi.encode(tokenAddr, to, amount);
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(uint256(uint160(tokenAddr))),
            payload: payload
        });
        return KernelOutputParser.encodeAgentOutput(actions);
    }

    function _buildCallAction(address target, uint256 value, bytes memory callData)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory payload = abi.encode(value, callData);
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_CALL,
            target: bytes32(uint256(uint160(target))),
            payload: payload
        });
        return KernelOutputParser.encodeAgentOutput(actions);
    }

    function _activateStrategy() internal {
        _depositAs(user, DEPOSIT_AMOUNT);
        bytes memory agentOutput = _buildTransferAction(address(token), recipient, 10 ether);
        bytes32 commitment = sha256(agentOutput);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, commitment);
        vault.execute(journal, "", agentOutput);
        assertTrue(vault.strategyActive(), "Strategy should be active");
    }

    // ============ Pause/Unpause Tests ============

    function test_pause_onlyOwner() public {
        vault.pause();
        assertTrue(vault.paused(), "Should be paused");
    }

    function test_pause_nonOwnerReverts() public {
        vm.prank(attacker);
        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.pause();
    }

    function test_unpause_onlyOwner() public {
        vault.pause();
        vault.unpause();
        assertFalse(vault.paused(), "Should be unpaused");
    }

    function test_unpause_nonOwnerReverts() public {
        vault.pause();
        vm.prank(attacker);
        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.unpause();
    }

    function test_pause_tracksPausedAt() public {
        uint256 ts = 1000;
        vm.warp(ts);
        vault.pause();
        assertEq(vault.pausedAt(), ts, "pausedAt should match block.timestamp");
    }

    /// @dev [H-02 FIX] `pausedAt` is permanent once set and is NOT cleared
    ///      on unpause. Prevents the pause/unpause cycling attack that
    ///      reset the 14-day emergency withdrawal deadline.
    function test_unpause_doesNotClearPausedAt() public {
        vm.warp(1000);
        vault.pause();
        assertEq(vault.pausedAt(), 1000);
        vault.unpause();
        // [H-02 FIX] pausedAt must REMAIN at its first-pause value.
        assertEq(vault.pausedAt(), 1000, "[H-02] pausedAt must not be cleared on unpause");
    }

    // ============ whenNotPaused Tests ============

    function test_depositERC20_whenPaused_reverts() public {
        vault.pause();
        vm.prank(user);
        vm.expectRevert(); // EnforcedPause from OpenZeppelin
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);
    }

    function test_withdraw_whenPaused_reverts() public {
        _depositAs(user, DEPOSIT_AMOUNT);
        vault.pause();
        vm.prank(user);
        vm.expectRevert(); // EnforcedPause
        vault.withdraw(1000);
    }

    function test_execute_whenPaused_reverts() public {
        vault.pause();
        vm.expectRevert(); // EnforcedPause
        vault.execute("", "", "");
    }

    function test_executeWithOracle_whenPaused_reverts() public {
        vault.pause();
        vm.expectRevert(); // EnforcedPause
        vault.executeWithOracle("", "", "", "", 0);
    }

    function test_settle_notBlockedByPause() public {
        _activateStrategy();
        vault.pause();
        // settle() is NOT pausable — must work even when paused
        vault.settle();
        assertFalse(vault.strategyActive(), "Strategy should be settled");
    }

    // ============ Emergency Settle Tests ============

    function test_emergencySettle_revertsBeforeDelay() public {
        _activateStrategy();

        vm.prank(attacker);
        vm.expectRevert();
        vault.emergencySettle();
    }

    function test_emergencySettle_succeedsAfterDelay() public {
        _activateStrategy();

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(attacker); // anyone can call
        vault.emergencySettle();
        assertFalse(vault.strategyActive(), "Strategy should be settled");
    }

    function test_emergencySettle_revertsWhenNoStrategy() public {
        _depositAs(user, DEPOSIT_AMOUNT);
        vm.expectRevert(KernelVault.StrategyNotActive.selector);
        vault.emergencySettle();
    }

    function test_emergencySettle_clearsStrategyActivatedAt() public {
        _activateStrategy();
        assertTrue(vault.strategyActivatedAt() > 0);

        vm.warp(block.timestamp + 7 days + 1);
        vault.emergencySettle();

        assertEq(vault.strategyActivatedAt(), 0, "strategyActivatedAt should be cleared");
    }

    function test_emergencySettle_exactlyAtDelay_succeeds() public {
        _activateStrategy();
        uint256 activatedAt = vault.strategyActivatedAt();

        vm.warp(activatedAt + 7 days); // exactly at boundary is allowed (uses <)
        vm.prank(attacker);
        vault.emergencySettle();
        assertFalse(vault.strategyActive(), "Strategy should be settled at exact boundary");
    }

    // ============ Emergency Withdraw Tests ============

    function test_emergencyWithdraw_revertsWhenNotPaused() public {
        _depositAs(user, DEPOSIT_AMOUNT);
        vm.prank(user);
        vm.expectRevert("not paused");
        vault.emergencyWithdraw(1000);
    }

    function test_emergencyWithdraw_revertsBeforeDelay() public {
        _depositAs(user, DEPOSIT_AMOUNT);
        vault.pause();

        vm.prank(user);
        vm.expectRevert();
        vault.emergencyWithdraw(1000);
    }

    function test_emergencyWithdraw_succeedsAfterDelay() public {
        _depositAs(user, DEPOSIT_AMOUNT);

        uint256 ts = block.timestamp;
        vault.pause();

        vm.warp(ts + 14 days + 1);

        uint256 userShares = vault.shares(user);
        uint256 balBefore = token.balanceOf(user);

        vm.prank(user);
        uint256 assetsOut = vault.emergencyWithdraw(userShares);

        assertGt(assetsOut, 0, "Should withdraw assets");
        assertEq(vault.shares(user), 0, "Shares should be burned");
        assertEq(token.balanceOf(user), balBefore + assetsOut, "User should receive assets");
    }

    function test_emergencyWithdraw_zeroShares_reverts() public {
        _depositAs(user, DEPOSIT_AMOUNT);
        vault.pause();
        vm.warp(block.timestamp + 14 days + 1);

        vm.prank(user);
        vm.expectRevert(KernelVault.ZeroWithdraw.selector);
        vault.emergencyWithdraw(0);
    }

    function test_emergencyWithdraw_insufficientShares_reverts() public {
        _depositAs(user, DEPOSIT_AMOUNT);
        vault.pause();
        vm.warp(block.timestamp + 14 days + 1);

        uint256 tooMany = vault.shares(user) + 1;
        vm.prank(user);
        vm.expectRevert();
        vault.emergencyWithdraw(tooMany);
    }

    function test_emergencyWithdraw_exactlyAtDelay_succeeds() public {
        _depositAs(user, DEPOSIT_AMOUNT);
        uint256 ts = block.timestamp;
        vault.pause();

        vm.warp(ts + 14 days); // exactly at boundary is allowed (uses <)
        uint256 userShares = vault.shares(user);
        vm.prank(user);
        uint256 assetsOut = vault.emergencyWithdraw(userShares);
        assertGt(assetsOut, 0, "Should withdraw at exact boundary");
    }

    /// @notice H-03 regression: emergency withdraw must not permanently block
    ///         depositors during an active strategy.
    function test_H03_emergencyWithdraw_partialDuringActiveStrategy() public {
        // 1. Deposit and activate a strategy that deploys the per-action cap.
        //    The liquid residual is smaller than the user's pro-rata share
        //    (because the snapshot includes the deployed funds), which is
        //    exactly the scenario that exercises the partial-burn emergency
        //    withdrawal path.
        _depositAs(user, DEPOSIT_AMOUNT);

        uint256 totalBefore = vault.totalAssets();
        uint256 deploymentAmount =
            (totalBefore * vault.MAX_CALL_VALUE_BPS()) / vault.BPS_DENOMINATOR();
        bytes memory agentOutput = _buildTransferAction(
            address(token), recipient, deploymentAmount
        );
        bytes32 commitment = sha256(agentOutput);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, commitment);
        vault.execute(journal, "", agentOutput);
        assertTrue(vault.strategyActive(), "Strategy should be active");

        // 2. Owner disappears; user must emergency-exit
        vault.pause();
        vm.warp(block.timestamp + 14 days + 1);

        // 3. Emergency withdraw must NOT revert with InsufficientAvailableAssets
        //    anymore — it should gracefully return the liquid balance.
        uint256 userShares = vault.shares(user);
        uint256 balBefore = token.balanceOf(user);
        uint256 liquidBefore = vault.totalAssets();
        assertLt(liquidBefore, DEPOSIT_AMOUNT, "Live balance should be depleted");

        vm.prank(user);
        uint256 assetsOut = vault.emergencyWithdraw(userShares);

        // 4. User receives at most the liquid balance and still holds shares
        //    proportional to the unwithdrawn snapshot (partial burn).
        assertEq(assetsOut, liquidBefore, "Should receive full liquid balance");
        assertEq(
            token.balanceOf(user) - balBefore,
            liquidBefore,
            "Balance delta equals liquid-out"
        );
        assertGt(vault.shares(user), 0, "Residual shares remain on snapshot");
    }

    // ============ CALL Self-Blocking Tests ============

    function test_executeCall_selfTarget_reverts() public {
        _depositAs(user, DEPOSIT_AMOUNT);

        // Build a CALL action targeting the vault itself
        bytes memory agentOutput = _buildCallAction(address(vault), 0, "");
        bytes32 commitment = sha256(agentOutput);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, commitment);

        vm.expectRevert(
            abi.encodeWithSelector(KernelVault.InvalidCallTarget.selector, address(vault))
        );
        vault.execute(journal, "", agentOutput);
    }

    function test_executeCall_externalTarget_succeeds() public {
        _depositAs(user, DEPOSIT_AMOUNT);

        // Build a CALL action targeting an external contract (e.g., approve on token)
        bytes memory callData = abi.encodeWithSelector(token.approve.selector, recipient, 100 ether);
        bytes memory agentOutput = _buildCallAction(address(token), 0, callData);
        bytes32 commitment = sha256(agentOutput);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, commitment);

        vault.execute(journal, "", agentOutput);
        // Should succeed — external targets are allowed
    }

    // ============ Constants Tests ============

    function test_emergencySettleDelay_is7Days() public view {
        assertEq(vault.EMERGENCY_SETTLE_DELAY(), 7 days);
    }

    function test_emergencyWithdrawDelay_is14Days() public view {
        assertEq(vault.EMERGENCY_WITHDRAW_DELAY(), 14 days);
    }
}

/// @title TransferOwnership Tests for UUPS contracts
/// @notice Tests transferOwnership on AgentRegistry, VaultFactory, KernelExecutionVerifier
contract TransferOwnershipTest is Test {
    AgentRegistry public registry;
    VaultFactory public factory;
    KernelExecutionVerifier public verifier;
    MockVerifier public mockRiscZeroVerifier;

    address public originalOwner = address(this);
    address public newOwner = address(0x5555555555555555555555555555555555555555);
    address public attacker = address(0x6666666666666666666666666666666666666666);

    function setUp() public {
        mockRiscZeroVerifier = new MockVerifier();

        // Deploy AgentRegistry
        AgentRegistry regImpl = new AgentRegistry();
        ERC1967Proxy regProxy = new ERC1967Proxy(
            address(regImpl), abi.encodeCall(AgentRegistry.initialize, (address(this)))
        );
        registry = AgentRegistry(address(regProxy));

        // Deploy KernelExecutionVerifier
        KernelExecutionVerifier verImpl = new KernelExecutionVerifier();
        ERC1967Proxy verProxy = new ERC1967Proxy(
            address(verImpl),
            abi.encodeCall(
                KernelExecutionVerifier.initialize, (address(mockRiscZeroVerifier), address(this))
            )
        );
        verifier = KernelExecutionVerifier(address(verProxy));

        // Deploy VaultFactory (needs a real registry + verifier + code store for init)
        VaultFactory facImpl = new VaultFactory();
        // Use a dummy code store address for this test (we don't deploy vaults)
        ERC1967Proxy facProxy = new ERC1967Proxy(
            address(facImpl),
            abi.encodeCall(
                VaultFactory.initialize,
                (address(registry), address(verifier), address(this), address(0x1))
            )
        );
        factory = VaultFactory(address(facProxy));
    }

    // ============ AgentRegistry transferOwnership (two-step) ============

    function test_registry_transferOwnership_succeeds() public {
        registry.transferOwnership(newOwner);
        // Ownership is only pending — owner unchanged until acceptOwnership.
        assertEq(registry.owner(), originalOwner);
        assertEq(registry.pendingOwner(), newOwner);

        vm.prank(newOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), newOwner);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_registry_transferOwnership_nonOwnerReverts() public {
        vm.prank(attacker);
        vm.expectRevert();
        registry.transferOwnership(newOwner);
    }

    /// @notice Passing address(0) cancels any pending proposal — it is NOT
    ///         a completed transfer, and it MUST NOT revert. A reverting
    ///         cancel path would make typo recovery impossible.
    function test_registry_transferOwnership_zeroAddressReverts() public {
        registry.transferOwnership(newOwner);
        assertEq(registry.pendingOwner(), newOwner);

        // Cancel by proposing address(0)
        registry.transferOwnership(address(0));
        assertEq(registry.pendingOwner(), address(0));
        // Owner is unchanged
        assertEq(registry.owner(), originalOwner);
    }

    function test_registry_transferOwnership_newOwnerCanAct() public {
        registry.transferOwnership(newOwner);
        vm.prank(newOwner);
        registry.acceptOwnership();

        // New owner can then propose another transfer
        vm.prank(newOwner);
        registry.transferOwnership(address(0xCC));
        vm.prank(address(0xCC));
        registry.acceptOwnership();
        assertEq(registry.owner(), address(0xCC));
    }

    function test_registry_transferOwnership_oldOwnerLosesAccess() public {
        registry.transferOwnership(newOwner);
        vm.prank(newOwner);
        registry.acceptOwnership();

        // Original owner should no longer be able to propose
        vm.expectRevert();
        registry.transferOwnership(address(0xDD));
    }

    // ============ VaultFactory transferOwnership (two-step) ============

    function test_factory_transferOwnership_succeeds() public {
        factory.transferOwnership(newOwner);
        assertEq(factory.owner(), originalOwner);
        assertEq(factory.pendingOwner(), newOwner);

        vm.prank(newOwner);
        factory.acceptOwnership();
        assertEq(factory.owner(), newOwner);
    }

    function test_factory_transferOwnership_nonOwnerReverts() public {
        vm.prank(attacker);
        vm.expectRevert();
        factory.transferOwnership(newOwner);
    }

    /// @notice Passing address(0) cancels a pending proposal.
    function test_factory_transferOwnership_zeroAddressReverts() public {
        factory.transferOwnership(newOwner);
        assertEq(factory.pendingOwner(), newOwner);

        factory.transferOwnership(address(0));
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.owner(), originalOwner);
    }

    // ============ KernelExecutionVerifier transferOwnership (two-step) ============

    function test_verifier_transferOwnership_succeeds() public {
        verifier.transferOwnership(newOwner);
        assertEq(verifier.owner(), originalOwner);
        assertEq(verifier.pendingOwner(), newOwner);

        vm.prank(newOwner);
        verifier.acceptOwnership();
        assertEq(verifier.owner(), newOwner);
    }

    function test_verifier_transferOwnership_nonOwnerReverts() public {
        vm.prank(attacker);
        vm.expectRevert();
        verifier.transferOwnership(newOwner);
    }

    /// @notice Passing address(0) cancels a pending proposal.
    function test_verifier_transferOwnership_zeroAddressReverts() public {
        verifier.transferOwnership(newOwner);
        assertEq(verifier.pendingOwner(), newOwner);

        verifier.transferOwnership(address(0));
        assertEq(verifier.pendingOwner(), address(0));
        assertEq(verifier.owner(), originalOwner);
    }
}
