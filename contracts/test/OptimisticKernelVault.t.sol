// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { OptimisticKernelVault } from "../src/OptimisticKernelVault.sol";
import { KernelVault } from "../src/KernelVault.sol";
import { KernelExecutionVerifier } from "../src/KernelExecutionVerifier.sol";
import { KernelOutputParser } from "../src/KernelOutputParser.sol";
import { WSTONBondManager } from "../src/WSTONBondManager.sol";
import { IOptimisticKernelVault } from "../src/interfaces/IOptimisticKernelVault.sol";
import { IBondManager } from "../src/interfaces/IBondManager.sol";
import { MockVerifier } from "./mocks/MockVerifier.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title OptimisticKernelVaultTest
/// @notice Comprehensive test suite for OptimisticKernelVault
contract OptimisticKernelVaultTest is Test {
    OptimisticKernelVault public vault;
    KernelExecutionVerifier public executionVerifier;
    MockVerifier public mockRiscZeroVerifier;
    WSTONBondManager public bondManager;
    MockERC20 public token;
    MockERC20 public mockWston;

    address public owner = address(this);
    address public user = address(0x1111111111111111111111111111111111111111);
    address public recipient = address(0x2222222222222222222222222222222222222222);
    address public treasury = address(0x3333333333333333333333333333333333333333);
    address public nonOwner = address(0x4444444444444444444444444444444444444444);

    bytes32 public constant TEST_AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant TEST_IMAGE_ID = bytes32(uint256(0x1234));
    bytes32 public constant TEST_CODE_HASH = bytes32(uint256(0xC0DE));
    bytes32 public constant TEST_CONSTRAINT_HASH = bytes32(uint256(0xC0175A1));
    bytes32 public constant TEST_INPUT_ROOT = bytes32(uint256(0x1200700));
    bytes32 public constant TEST_INPUT_COMMITMENT = bytes32(uint256(0x11207));

    uint256 public constant INITIAL_BALANCE = 1000 ether;
    uint256 public constant DEPOSIT_AMOUNT = 100 ether;
    uint256 public constant BOND_AMOUNT = 10 ether;

    /// @dev Virtual offset multiplier
    uint256 internal constant OFFSET = 1000;

    function setUp() public {
        // Deploy mock RISC Zero verifier
        mockRiscZeroVerifier = new MockVerifier();

        // Deploy KernelExecutionVerifier via proxy
        KernelExecutionVerifier verifierImpl = new KernelExecutionVerifier();
        ERC1967Proxy verifierProxy = new ERC1967Proxy(
            address(verifierImpl),
            abi.encodeCall(KernelExecutionVerifier.initialize, (address(mockRiscZeroVerifier), address(this)))
        );
        executionVerifier = KernelExecutionVerifier(address(verifierProxy));

        // Deploy mock ERC20 token
        token = new MockERC20("Test Token", "TEST", 18);

        // Deploy MockWSTON token for bonds
        mockWston = new MockERC20("Wrapped Staked TON", "WSTON", 18);

        // Deploy WSTONBondManager
        bondManager = new WSTONBondManager(address(mockWston), treasury, address(this), BOND_AMOUNT);

        // Deploy OptimisticKernelVault
        vault = new OptimisticKernelVault(
            address(token),
            address(executionVerifier),
            TEST_AGENT_ID,
            TEST_IMAGE_ID,
            address(this), // owner
            address(bondManager)
        );

        // Authorize vault in BondManager
        bondManager.authorizeVault(address(vault));

        // Enable optimistic mode
        vault.setOptimisticEnabled(true);

        // Set minBond to match bondManager floor
        vault.setMinBond(BOND_AMOUNT);

        // Mint tokens to user
        token.mint(user, INITIAL_BALANCE);

        // Approve vault to spend user tokens
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);

        // Mint WSTON to owner for bonds and approve BondManager
        mockWston.mint(owner, 1000 ether);
        mockWston.approve(address(bondManager), type(uint256).max);
    }

    // ============ Helper Functions ============

    /// @notice Build a valid 209-byte KernelJournalV1 with specified parameters
    function _buildJournal(bytes32 agentId, uint64 nonce, bytes32 actionCommitment)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory journal = new bytes(209);

        // protocol_version = 1 (u32 LE at offset 0)
        journal[0] = 0x01;
        journal[1] = 0x00;
        journal[2] = 0x00;
        journal[3] = 0x00;

        // kernel_version = 1 (u32 LE at offset 4)
        journal[4] = 0x01;
        journal[5] = 0x00;
        journal[6] = 0x00;
        journal[7] = 0x00;

        // agent_id (bytes32 at offset 8-40)
        for (uint256 i = 0; i < 32; i++) {
            journal[8 + i] = agentId[i];
        }

        // agent_code_hash (bytes32 at offset 40-72)
        bytes32 codeHash = TEST_CODE_HASH;
        for (uint256 i = 0; i < 32; i++) {
            journal[40 + i] = codeHash[i];
        }

        // constraint_set_hash (bytes32 at offset 72-104)
        bytes32 constraintHash = TEST_CONSTRAINT_HASH;
        for (uint256 i = 0; i < 32; i++) {
            journal[72 + i] = constraintHash[i];
        }

        // input_root (bytes32 at offset 104-136)
        bytes32 inputRoot = TEST_INPUT_ROOT;
        for (uint256 i = 0; i < 32; i++) {
            journal[104 + i] = inputRoot[i];
        }

        // execution_nonce (u64 LE at offset 136-144)
        journal[136] = bytes1(uint8(nonce & 0xFF));
        journal[137] = bytes1(uint8((nonce >> 8) & 0xFF));
        journal[138] = bytes1(uint8((nonce >> 16) & 0xFF));
        journal[139] = bytes1(uint8((nonce >> 24) & 0xFF));
        journal[140] = bytes1(uint8((nonce >> 32) & 0xFF));
        journal[141] = bytes1(uint8((nonce >> 40) & 0xFF));
        journal[142] = bytes1(uint8((nonce >> 48) & 0xFF));
        journal[143] = bytes1(uint8((nonce >> 56) & 0xFF));

        // input_commitment (bytes32 at offset 144-176)
        bytes32 inputCommitment = TEST_INPUT_COMMITMENT;
        for (uint256 i = 0; i < 32; i++) {
            journal[144 + i] = inputCommitment[i];
        }

        // action_commitment (bytes32 at offset 176-208)
        for (uint256 i = 0; i < 32; i++) {
            journal[176 + i] = actionCommitment[i];
        }

        // execution_status = 0x01 (success) at offset 208
        journal[208] = 0x01;

        return journal;
    }

    /// @notice Build AgentOutput with a single TRANSFER_ERC20 action
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

    /// @notice Build AgentOutput with zero actions (no-op)
    function _buildEmptyAction() internal pure returns (bytes memory) {
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](0);
        return KernelOutputParser.encodeAgentOutput(actions);
    }

    /// @notice Helper: submit a valid optimistic execution with a transfer action
    function _submitOptimistic(uint64 nonce, uint256 transferAmount)
        internal
        returns (bytes memory journal, bytes memory agentOutputBytes)
    {
        agentOutputBytes = _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);

        vault.executeOptimistic(
            journal, agentOutputBytes, "", 0, BOND_AMOUNT
        );
    }

    /// @notice Helper: submit an optimistic execution with empty actions
    function _submitOptimisticEmpty(uint64 nonce)
        internal
        returns (bytes memory journal, bytes memory agentOutputBytes)
    {
        agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);

        vault.executeOptimistic(
            journal, agentOutputBytes, "", 0, BOND_AMOUNT
        );
    }

    // ============ Happy Path Tests ============

    function test_executeOptimistic_happyPath() public {
        // Deposit tokens to vault
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Submit optimistic execution
        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, 1 ether);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);

        // Verify PendingExecution stored
        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.journalHash, sha256(journal));
        assertEq(pending.actionCommitment, actionCommitment);
        assertEq(pending.bondAmount, BOND_AMOUNT);
        assertEq(pending.deadline, block.timestamp + vault.challengeWindow());
        assertEq(pending.status, 1); // STATUS_PENDING

        // Verify pending count
        assertEq(vault.pendingCount(), 1);
    }

    function test_executeOptimistic_executesActions() public {
        // Deposit tokens to vault
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 transferAmount = 5 ether;
        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 vaultBefore = token.balanceOf(address(vault));

        _submitOptimistic(1, transferAmount);

        // Verify actions executed (tokens transferred)
        assertEq(token.balanceOf(recipient), recipientBefore + transferAmount);
        assertEq(token.balanceOf(address(vault)), vaultBefore - transferAmount);
    }

    function test_submitProof_finalizesExecution() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Submit proof
        bytes memory seal = hex"deadbeef"; // Mock verifier accepts anything
        vault.submitProof(1, seal);

        // Verify status changed to FINALIZED
        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 2); // STATUS_FINALIZED
    }

    function test_submitProof_releasesBond() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 ownerBefore = mockWston.balanceOf(owner);

        _submitOptimisticEmpty(1);

        // Owner WSTON balance decreased by bond
        assertEq(mockWston.balanceOf(owner), ownerBefore - BOND_AMOUNT);

        // Submit proof — bond should be released back to owner
        bytes memory seal = hex"deadbeef";
        vault.submitProof(1, seal);

        assertEq(mockWston.balanceOf(owner), ownerBefore);
    }

    function test_fullCycle_optimisticThenProof() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 transferAmount = 10 ether;
        uint256 ownerWstonBefore = mockWston.balanceOf(owner);
        uint256 recipientBefore = token.balanceOf(recipient);

        // 1. Submit optimistic execution
        _submitOptimistic(1, transferAmount);

        // Verify transfer happened immediately
        assertEq(token.balanceOf(recipient), recipientBefore + transferAmount);

        // 2. Submit proof
        bytes memory seal = hex"deadbeef";
        vault.submitProof(1, seal);

        // 3. Verify bond returned and execution finalized
        assertEq(mockWston.balanceOf(owner), ownerWstonBefore);
        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 2); // STATUS_FINALIZED
        assertEq(vault.pendingCount(), 0);
    }

    // ============ Timeout/Slash Tests ============

    function test_slashExpired_afterDeadline() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Warp past deadline
        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        // Slash (permissionless — anyone can call)
        vm.prank(nonOwner);
        vault.slashExpired(1);

        // Verify status changed to SLASHED
        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 3); // STATUS_SLASHED
        assertEq(vault.pendingCount(), 0);
    }

    function test_slashExpired_beforeDeadline_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        uint256 deadline = block.timestamp + vault.challengeWindow();

        // Try to slash before deadline
        vm.prank(nonOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.DeadlineNotReached.selector,
                uint64(1),
                deadline,
                block.timestamp
            )
        );
        vault.slashExpired(1);
    }

    function test_slashExpired_distributesBond() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        uint256 finderBefore = mockWston.balanceOf(nonOwner);
        uint256 vaultBefore = mockWston.balanceOf(address(vault));
        uint256 treasuryBefore = mockWston.balanceOf(treasury);

        // Warp past deadline and slash
        vm.warp(block.timestamp + vault.challengeWindow() + 1);
        vm.prank(nonOwner);
        vault.slashExpired(1);

        // Verify distribution: 10% finder, 80% vault, 10% treasury
        assertEq(mockWston.balanceOf(nonOwner), finderBefore + 1 ether); // 10% of 10 ether
        assertEq(mockWston.balanceOf(address(vault)), vaultBefore + 8 ether); // 80% of 10 ether
        assertEq(mockWston.balanceOf(treasury), treasuryBefore + 1 ether); // 10% of 10 ether
    }

    function test_selfSlash_ownerOnly() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Owner can self-slash
        vault.selfSlash(1);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 3); // STATUS_SLASHED
    }

    function test_selfSlash_notOwner_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.prank(nonOwner);
        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.selfSlash(1);
    }

    function test_selfSlash_noFinderFee() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        uint256 vaultBefore = mockWston.balanceOf(address(vault));
        uint256 treasuryBefore = mockWston.balanceOf(treasury);

        // Self-slash: no finder fee
        vault.selfSlash(1);

        // 90% to vault, 10% to treasury
        assertEq(mockWston.balanceOf(address(vault)), vaultBefore + 9 ether);
        assertEq(mockWston.balanceOf(treasury), treasuryBefore + 1 ether);
    }

    // ============ Bond Enforcement Tests ============

    function test_executeOptimistic_insufficientBond_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        // Provide less than minBond
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InsufficientBond.selector,
                BOND_AMOUNT - 1,
                BOND_AMOUNT
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT - 1);
    }

    function test_executeOptimistic_exactMinBond_succeeds() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        // Exact minimum bond should work
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);

        assertEq(vault.pendingCount(), 1);
    }

    function test_executeOptimistic_excessBond_accepted() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        // Overpaying is fine
        uint256 excessBond = BOND_AMOUNT + 5 ether;
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, excessBond);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.bondAmount, excessBond);
    }

    // ============ Nonce Ordering Tests ============

    function test_executeOptimistic_advancesNonce() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        assertEq(vault.lastExecutionNonce(), 0);

        _submitOptimisticEmpty(1);
        assertEq(vault.lastExecutionNonce(), 1);

        _submitOptimisticEmpty(2);
        assertEq(vault.lastExecutionNonce(), 2);
    }

    function test_executeOptimistic_outOfOrder_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Try to submit nonce 1 again (nonce <= lastNonce)
        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        vm.expectRevert(
            abi.encodeWithSelector(KernelVault.InvalidNonce.selector, uint64(1), uint64(1))
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_executeOptimistic_nonceGapTooLarge_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // First execution at nonce 1
        _submitOptimisticEmpty(1);

        // Try nonce 102 (gap of 101, exceeds MAX_NONCE_GAP of 100)
        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 102, actionCommitment);

        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.NonceGapTooLarge.selector, uint64(1), uint64(102), uint64(100)
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_mixedSyncAndOptimistic_nonceOrdering() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Synchronous execute at nonce 1
        bytes memory agentOutputBytes1 = _buildEmptyAction();
        bytes32 actionCommitment1 = sha256(agentOutputBytes1);
        bytes memory journal1 = _buildJournal(TEST_AGENT_ID, 1, actionCommitment1);
        bytes memory seal = hex"deadbeef";

        vault.execute(journal1, seal, agentOutputBytes1);
        assertEq(vault.lastExecutionNonce(), 1);

        // Optimistic at nonce 2
        _submitOptimisticEmpty(2);
        assertEq(vault.lastExecutionNonce(), 2);
    }

    // ============ Max Pending Tests ============

    function test_executeOptimistic_maxPending_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // maxPending is DEFAULT_MAX_PENDING = 3
        uint256 maxPend = vault.maxPending();

        // Submit maxPending executions
        for (uint64 i = 1; i <= uint64(maxPend); i++) {
            _submitOptimisticEmpty(i);
        }

        assertEq(vault.pendingCount(), maxPend);

        // Next one should revert
        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, uint64(maxPend + 1), actionCommitment);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.TooManyPending.selector, maxPend, maxPend
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_submitProof_decrementsPendingCount() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);
        _submitOptimisticEmpty(2);
        assertEq(vault.pendingCount(), 2);

        // Submit proof for nonce 1
        vault.submitProof(1, hex"deadbeef");
        assertEq(vault.pendingCount(), 1);

        // Submit proof for nonce 2
        vault.submitProof(2, hex"deadbeef");
        assertEq(vault.pendingCount(), 0);
    }

    function test_slashExpired_decrementsPendingCount() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);
        _submitOptimisticEmpty(2);
        assertEq(vault.pendingCount(), 2);

        // Warp past deadline and slash nonce 1
        vm.warp(block.timestamp + vault.challengeWindow() + 1);
        vault.slashExpired(1);
        assertEq(vault.pendingCount(), 1);
    }

    // ============ Pause Interaction Tests ============

    function test_submitProof_worksWhilePaused() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Pause the vault
        vault.pause();

        // Proof submission should still work (CRITICAL: not gated by whenNotPaused)
        vault.submitProof(1, hex"deadbeef");

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 2); // STATUS_FINALIZED
    }

    function test_executeOptimistic_blockedWhilePaused() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        vault.pause();

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        vm.expectRevert(); // Pausable: paused
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_slashExpired_worksWhilePaused() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Pause the vault
        vault.pause();

        // Warp past deadline
        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        // Slashing should still work (not gated by whenNotPaused)
        vm.prank(nonOwner);
        vault.slashExpired(1);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 3); // STATUS_SLASHED
    }

    // ============ Strategy Interaction Tests ============

    function test_executeOptimistic_activatesStrategy() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        assertFalse(vault.strategyActive());

        // Execute a transfer — should activate strategy (balance decreases)
        _submitOptimistic(1, 10 ether);

        assertTrue(vault.strategyActive());
    }

    // ============ Oracle Tests ============

    function test_executeOptimistic_withOracle_invalid_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Configure oracle signer
        address oracleSigner = address(0x7777000000000000000000000000000000000007);
        vault.setOracleSigner(oracleSigner, 900);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        // Invalid oracle signature (wrong length)
        vm.expectRevert();
        vault.executeOptimistic(
            journal, agentOutputBytes, hex"0000", uint64(block.timestamp), BOND_AMOUNT
        );
    }

    // ============ Config Tests ============

    function test_setChallengeWindow_valid() public {
        uint256 newWindow = 30 minutes;
        vault.setChallengeWindow(newWindow);
        assertEq(vault.challengeWindow(), newWindow);
    }

    function test_setChallengeWindow_tooLow_reverts() public {
        uint256 tooLow = vault.MIN_CHALLENGE_WINDOW() - 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InvalidChallengeWindow.selector,
                tooLow,
                vault.MIN_CHALLENGE_WINDOW(),
                vault.MAX_CHALLENGE_WINDOW()
            )
        );
        vault.setChallengeWindow(tooLow);
    }

    function test_setChallengeWindow_tooHigh_reverts() public {
        uint256 tooHigh = vault.MAX_CHALLENGE_WINDOW() + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InvalidChallengeWindow.selector,
                tooHigh,
                vault.MIN_CHALLENGE_WINDOW(),
                vault.MAX_CHALLENGE_WINDOW()
            )
        );
        vault.setChallengeWindow(tooHigh);
    }

    function test_setOptimisticEnabled_requiresBondManager() public {
        // Deploy a vault without bond manager
        OptimisticKernelVault noBondVault = new OptimisticKernelVault(
            address(token),
            address(executionVerifier),
            TEST_AGENT_ID,
            TEST_IMAGE_ID,
            address(this),
            address(0)
        );

        vm.expectRevert(IOptimisticKernelVault.BondManagerNotSet.selector);
        noBondVault.setOptimisticEnabled(true);
    }

    function test_config_onlyOwner() public {
        vm.startPrank(nonOwner);

        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.setChallengeWindow(30 minutes);

        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.setMinBond(1 ether);

        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.setMaxPending(5);

        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.setOptimisticEnabled(false);

        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.setBondManager(IBondManager(address(0)));

        vm.stopPrank();
    }

    function test_setMaxPending_aboveCap_reverts() public {
        uint256 tooMany = vault.MAX_MAX_PENDING() + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InvalidMaxPending.selector,
                tooMany,
                vault.MAX_MAX_PENDING()
            )
        );
        vault.setMaxPending(tooMany);
    }

    // ============ Backward Compatibility Tests ============

    function test_synchronousExecute_stillWorks() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 transferAmount = 5 ether;
        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory seal = hex"deadbeef";

        uint256 recipientBefore = token.balanceOf(recipient);

        vault.execute(journal, seal, agentOutputBytes);

        assertEq(token.balanceOf(recipient), recipientBefore + transferAmount);
        assertEq(vault.lastExecutionNonce(), 1);
    }

    function test_synchronousExecuteWithOracle_stillWorks() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // No oracle signer configured, so empty sig is fine
        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory seal = hex"deadbeef";

        vault.executeWithOracle(journal, seal, agentOutputBytes, "", 0);

        assertEq(vault.lastExecutionNonce(), 1);
    }

    // ============ Permissionless Tests ============

    function test_submitProof_permissionless() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Non-owner can submit proof
        vm.prank(nonOwner);
        vault.submitProof(1, hex"deadbeef");

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 2); // STATUS_FINALIZED
    }

    function test_slashExpired_permissionless() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        // Non-owner can slash
        vm.prank(nonOwner);
        vault.slashExpired(1);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 3); // STATUS_SLASHED
    }

    // ============ Event Tests ============

    function test_executeOptimistic_emitsEvents() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes32 journalHash = sha256(journal);
        uint256 deadline = block.timestamp + vault.challengeWindow();

        vm.expectEmit(true, true, false, true);
        emit KernelVault.ExecutionApplied(TEST_AGENT_ID, 1, actionCommitment, 0);

        vm.expectEmit(true, false, false, true);
        emit IOptimisticKernelVault.OptimisticExecutionSubmitted(1, journalHash, BOND_AMOUNT, deadline);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_submitProof_emitsEvent() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.expectEmit(true, true, false, false);
        emit IOptimisticKernelVault.ProofSubmitted(1, nonOwner);

        vm.prank(nonOwner);
        vault.submitProof(1, hex"deadbeef");
    }

    function test_slashExpired_emitsEvent() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        vm.expectEmit(true, true, false, true);
        emit IOptimisticKernelVault.ExecutionSlashed(1, nonOwner, BOND_AMOUNT);

        vm.prank(nonOwner);
        vault.slashExpired(1);
    }

    // ============ Error Path Tests ============

    function test_executeOptimistic_notOwner_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        vm.prank(nonOwner);
        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_executeOptimistic_notEnabled_reverts() public {
        // Disable optimistic
        vault.setOptimisticEnabled(false);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        vm.expectRevert(IOptimisticKernelVault.OptimisticNotEnabled.selector);
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_executeOptimistic_wrongAgentId_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes32 wrongAgentId = bytes32(uint256(0xBADA6E17));
        bytes memory journal = _buildJournal(wrongAgentId, 1, actionCommitment);

        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.AgentIdMismatch.selector, TEST_AGENT_ID, wrongAgentId
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_executeOptimistic_actionCommitmentMismatch_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 wrongCommitment = bytes32(uint256(0xBADBAD));
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, wrongCommitment);

        bytes32 actualCommitment = sha256(agentOutputBytes);

        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.ActionCommitmentMismatch.selector, wrongCommitment, actualCommitment
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function test_submitProof_notPending_reverts() public {
        // No execution submitted at nonce 1 — status is EMPTY (0)
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.ExecutionNotPending.selector, uint64(1), uint8(0)
            )
        );
        vault.submitProof(1, hex"deadbeef");
    }

    function test_submitProof_alreadyFinalized_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);
        vault.submitProof(1, hex"deadbeef");

        // Try submitting proof again — status is FINALIZED (2)
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.ExecutionNotPending.selector, uint64(1), uint8(2)
            )
        );
        vault.submitProof(1, hex"deadbeef");
    }

    function test_submitProof_proofVerificationFailed_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        // Make the mock verifier fail
        mockRiscZeroVerifier.setShouldFail(true);

        vm.expectRevert(IOptimisticKernelVault.ProofVerificationFailed.selector);
        vault.submitProof(1, hex"deadbeef");
    }

}
