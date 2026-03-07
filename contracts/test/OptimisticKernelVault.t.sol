// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { OptimisticKernelVault } from "../src/OptimisticKernelVault.sol";
import { KernelVault } from "../src/KernelVault.sol";
import { KernelExecutionVerifier } from "../src/KernelExecutionVerifier.sol";
import { KernelOutputParser } from "../src/KernelOutputParser.sol";
import { IOptimisticKernelVault } from "../src/interfaces/IOptimisticKernelVault.sol";
import { MockVerifier } from "./mocks/MockVerifier.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title OptimisticKernelVaultTest
/// @notice Comprehensive test suite for OptimisticKernelVault with cross-chain oracle-attested bonds
contract OptimisticKernelVaultTest is Test {
    OptimisticKernelVault public vault;
    KernelExecutionVerifier public executionVerifier;
    MockVerifier public mockRiscZeroVerifier;
    MockERC20 public token;

    address public owner = address(this);
    address public user = address(0x1111111111111111111111111111111111111111);
    address public recipient = address(0x2222222222222222222222222222222222222222);
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
    uint256 public constant BOND_CHAIN_ID = 1; // Ethereum mainnet

    uint256 internal constant ORACLE_PRIVATE_KEY = 0xA11CE;

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

        // Deploy OptimisticKernelVault (cross-chain bond mode, bondChainId = 1)
        vault = new OptimisticKernelVault(
            address(token),
            address(executionVerifier),
            TEST_AGENT_ID,
            TEST_IMAGE_ID,
            address(this), // owner
            BOND_CHAIN_ID
        );

        // Configure oracle signer (needed for bond attestation)
        address oracleSigner = vm.addr(ORACLE_PRIVATE_KEY);
        vault.setOracleSigner(oracleSigner, 0); // no age check for tests

        // Enable optimistic mode
        vault.setOptimisticEnabled(true);

        // Set minBond
        vault.setMinBond(BOND_AMOUNT);

        // Mint tokens to user
        token.mint(user, INITIAL_BALANCE);

        // Approve vault to spend user tokens
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
    }

    // ============ Helper Functions ============

    function _signBondAttestation(
        address operator,
        address vaultAddr,
        uint64 nonce,
        uint256 amount,
        uint256 chainId
    ) internal pure returns (bytes memory) {
        bytes32 bondHash = keccak256(
            abi.encodePacked("BOND_LOCK_V1", operator, vaultAddr, nonce, amount, chainId)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", bondHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ORACLE_PRIVATE_KEY, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function _buildJournal(bytes32 agentId, uint64 nonce, bytes32 actionCommitment)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory journal = new bytes(209);

        journal[0] = 0x01; journal[1] = 0x00; journal[2] = 0x00; journal[3] = 0x00;
        journal[4] = 0x01; journal[5] = 0x00; journal[6] = 0x00; journal[7] = 0x00;

        for (uint256 i = 0; i < 32; i++) { journal[8 + i] = agentId[i]; }

        bytes32 codeHash = TEST_CODE_HASH;
        for (uint256 i = 0; i < 32; i++) { journal[40 + i] = codeHash[i]; }

        bytes32 constraintHash = TEST_CONSTRAINT_HASH;
        for (uint256 i = 0; i < 32; i++) { journal[72 + i] = constraintHash[i]; }

        bytes32 inputRoot = TEST_INPUT_ROOT;
        for (uint256 i = 0; i < 32; i++) { journal[104 + i] = inputRoot[i]; }

        journal[136] = bytes1(uint8(nonce & 0xFF));
        journal[137] = bytes1(uint8((nonce >> 8) & 0xFF));
        journal[138] = bytes1(uint8((nonce >> 16) & 0xFF));
        journal[139] = bytes1(uint8((nonce >> 24) & 0xFF));
        journal[140] = bytes1(uint8((nonce >> 32) & 0xFF));
        journal[141] = bytes1(uint8((nonce >> 40) & 0xFF));
        journal[142] = bytes1(uint8((nonce >> 48) & 0xFF));
        journal[143] = bytes1(uint8((nonce >> 56) & 0xFF));

        bytes32 inputCommitment = TEST_INPUT_COMMITMENT;
        for (uint256 i = 0; i < 32; i++) { journal[144 + i] = inputCommitment[i]; }

        for (uint256 i = 0; i < 32; i++) { journal[176 + i] = actionCommitment[i]; }

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

    function _buildEmptyAction() internal pure returns (bytes memory) {
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](0);
        return KernelOutputParser.encodeAgentOutput(actions);
    }

    function _submitOptimistic(uint64 nonce, uint256 transferAmount) internal {
        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), nonce, BOND_AMOUNT, BOND_CHAIN_ID);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function _submitOptimisticEmpty(uint64 nonce) internal {
        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), nonce, BOND_AMOUNT, BOND_CHAIN_ID);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    // ============ Happy Path Tests ============

    function test_executeOptimistic_happyPath() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.journalHash, sha256(journal));
        assertEq(pending.actionCommitment, actionCommitment);
        assertEq(pending.bondAmount, BOND_AMOUNT);
        assertEq(pending.deadline, block.timestamp + vault.challengeWindow());
        assertEq(pending.status, 1);
        assertEq(vault.pendingCount(), 1);
    }

    function test_executeOptimistic_executesActions() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 transferAmount = 5 ether;
        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 vaultBefore = token.balanceOf(address(vault));

        _submitOptimistic(1, transferAmount);

        assertEq(token.balanceOf(recipient), recipientBefore + transferAmount);
        assertEq(token.balanceOf(address(vault)), vaultBefore - transferAmount);
    }

    function test_submitProof_finalizesExecution() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vault.submitProof(1, hex"deadbeef");

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 2); // STATUS_FINALIZED
    }

    function test_fullCycle_optimisticThenProof() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 transferAmount = 10 ether;
        uint256 recipientBefore = token.balanceOf(recipient);

        _submitOptimistic(1, transferAmount);
        assertEq(token.balanceOf(recipient), recipientBefore + transferAmount);

        vault.submitProof(1, hex"deadbeef");

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 2);
        assertEq(vault.pendingCount(), 0);
    }

    // ============ Timeout/Slash Tests ============

    function test_slashExpired_afterDeadline() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        vm.prank(nonOwner);
        vault.slashExpired(1);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 3);
        assertEq(vault.pendingCount(), 0);
    }

    function test_slashExpired_beforeDeadline_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        uint256 deadline = block.timestamp + vault.challengeWindow();

        vm.prank(nonOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.DeadlineNotReached.selector,
                uint64(1), deadline, block.timestamp
            )
        );
        vault.slashExpired(1);
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

    function test_selfSlash_ownerOnly() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vault.selfSlash(1);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 3);
    }

    function test_selfSlash_notOwner_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.prank(nonOwner);
        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.selfSlash(1);
    }

    function test_selfSlash_emitsWithZeroSlasher() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.expectEmit(true, true, false, true);
        emit IOptimisticKernelVault.ExecutionSlashed(1, address(0), BOND_AMOUNT);

        vault.selfSlash(1);
    }

    // ============ Bond Attestation Tests ============

    function test_executeOptimistic_insufficientBond_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        uint256 lowBond = BOND_AMOUNT - 1;
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, lowBond, BOND_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InsufficientBond.selector, lowBond, BOND_AMOUNT
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, lowBond, bondAttestation);
    }

    function test_executeOptimistic_exactMinBond_succeeds() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
        assertEq(vault.pendingCount(), 1);
    }

    function test_executeOptimistic_excessBond_accepted() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        uint256 excessBond = BOND_AMOUNT + 5 ether;
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, excessBond, BOND_CHAIN_ID);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, excessBond, bondAttestation);

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.bondAmount, excessBond);
    }

    function test_invalidAttestation_wrongSigner_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        // Sign with wrong key
        uint256 wrongKey = 0xBAD;
        bytes32 bondHash = keccak256(
            abi.encodePacked("BOND_LOCK_V1", owner, address(vault), uint64(1), BOND_AMOUNT, BOND_CHAIN_ID)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", bondHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory badAttestation = abi.encodePacked(r, s, v);

        vm.expectRevert();
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, badAttestation);
    }

    function test_invalidAttestation_wrongNonce_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        // Attestation signed for nonce 99, executing nonce 1
        bytes memory wrongNonceAttestation = _signBondAttestation(owner, address(vault), 99, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectRevert();
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, wrongNonceAttestation);
    }

    function test_invalidAttestation_wrongChainId_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        // Attestation signed for chainId 137, vault expects chainId 1
        bytes memory wrongChainAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, 137);

        vm.expectRevert();
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, wrongChainAttestation);
    }

    function test_invalidAttestation_emptyBytes_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        vm.expectRevert();
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, "");
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

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(KernelVault.InvalidNonce.selector, uint64(1), uint64(1))
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_executeOptimistic_nonceGapTooLarge_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 102, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 102, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.NonceGapTooLarge.selector, uint64(1), uint64(102), uint64(100)
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_mixedSyncAndOptimistic_nonceOrdering() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Sync at nonce 1
        bytes memory agentOutputBytes1 = _buildEmptyAction();
        bytes32 actionCommitment1 = sha256(agentOutputBytes1);
        bytes memory journal1 = _buildJournal(TEST_AGENT_ID, 1, actionCommitment1);
        vault.execute(journal1, hex"deadbeef", agentOutputBytes1);
        assertEq(vault.lastExecutionNonce(), 1);

        // Optimistic at nonce 2
        _submitOptimisticEmpty(2);
        assertEq(vault.lastExecutionNonce(), 2);
    }

    // ============ Max Pending Tests ============

    function test_executeOptimistic_maxPending_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 maxPend = vault.maxPending();

        for (uint64 i = 1; i <= uint64(maxPend); i++) {
            _submitOptimisticEmpty(i);
        }

        assertEq(vault.pendingCount(), maxPend);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, uint64(maxPend + 1), actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(
            owner, address(vault), uint64(maxPend + 1), BOND_AMOUNT, BOND_CHAIN_ID
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.TooManyPending.selector, maxPend, maxPend
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_submitProof_decrementsPendingCount() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);
        _submitOptimisticEmpty(2);
        assertEq(vault.pendingCount(), 2);

        vault.submitProof(1, hex"deadbeef");
        assertEq(vault.pendingCount(), 1);

        vault.submitProof(2, hex"deadbeef");
        assertEq(vault.pendingCount(), 0);
    }

    function test_slashExpired_decrementsPendingCount() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);
        _submitOptimisticEmpty(2);
        assertEq(vault.pendingCount(), 2);

        vm.warp(block.timestamp + vault.challengeWindow() + 1);
        vault.slashExpired(1);
        assertEq(vault.pendingCount(), 1);
    }

    // ============ Pause Interaction Tests ============

    function test_submitProof_worksWhilePaused() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);
        vault.pause();

        vault.submitProof(1, hex"deadbeef");

        IOptimisticKernelVault.PendingExecution memory pending = vault.getPendingExecution(1);
        assertEq(pending.status, 2);
    }

    function test_executeOptimistic_blockedWhilePaused() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        vault.pause();

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectRevert();
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_slashExpired_worksWhilePaused() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);
        vault.pause();

        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        vm.prank(nonOwner);
        vault.slashExpired(1);

        assertEq(vault.getPendingExecution(1).status, 3);
    }

    // ============ Strategy Interaction Tests ============

    function test_executeOptimistic_activatesStrategy() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        assertFalse(vault.strategyActive());
        _submitOptimistic(1, 10 ether);
        assertTrue(vault.strategyActive());
    }

    // ============ Config Tests ============

    function test_setChallengeWindow_valid() public {
        vault.setChallengeWindow(30 minutes);
        assertEq(vault.challengeWindow(), 30 minutes);
    }

    function test_setChallengeWindow_tooLow_reverts() public {
        uint256 tooLow = vault.MIN_CHALLENGE_WINDOW() - 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InvalidChallengeWindow.selector,
                tooLow, vault.MIN_CHALLENGE_WINDOW(), vault.MAX_CHALLENGE_WINDOW()
            )
        );
        vault.setChallengeWindow(tooLow);
    }

    function test_setChallengeWindow_tooHigh_reverts() public {
        uint256 tooHigh = vault.MAX_CHALLENGE_WINDOW() + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InvalidChallengeWindow.selector,
                tooHigh, vault.MIN_CHALLENGE_WINDOW(), vault.MAX_CHALLENGE_WINDOW()
            )
        );
        vault.setChallengeWindow(tooHigh);
    }

    function test_setOptimisticEnabled_requiresOracleSigner() public {
        // Deploy a vault without oracle signer configured
        OptimisticKernelVault noOracleVault = new OptimisticKernelVault(
            address(token),
            address(executionVerifier),
            TEST_AGENT_ID,
            TEST_IMAGE_ID,
            address(this),
            BOND_CHAIN_ID
        );

        vm.expectRevert(IOptimisticKernelVault.OracleSignerNotSet.selector);
        noOracleVault.setOptimisticEnabled(true);
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
        vault.setBondChainId(137);

        vm.stopPrank();
    }

    function test_setMaxPending_aboveCap_reverts() public {
        uint256 tooMany = vault.MAX_MAX_PENDING() + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOptimisticKernelVault.InvalidMaxPending.selector, tooMany, vault.MAX_MAX_PENDING()
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

        uint256 recipientBefore = token.balanceOf(recipient);
        vault.execute(journal, hex"deadbeef", agentOutputBytes);

        assertEq(token.balanceOf(recipient), recipientBefore + transferAmount);
        assertEq(vault.lastExecutionNonce(), 1);
    }

    function test_synchronousExecuteWithOracle_stillWorks() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);

        vault.executeWithOracle(journal, hex"deadbeef", agentOutputBytes, "", 0);
        assertEq(vault.lastExecutionNonce(), 1);
    }

    // ============ Permissionless Tests ============

    function test_submitProof_permissionless() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.prank(nonOwner);
        vault.submitProof(1, hex"deadbeef");

        assertEq(vault.getPendingExecution(1).status, 2);
    }

    function test_slashExpired_permissionless() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        _submitOptimisticEmpty(1);

        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        vm.prank(nonOwner);
        vault.slashExpired(1);

        assertEq(vault.getPendingExecution(1).status, 3);
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
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectEmit(true, true, false, true);
        emit KernelVault.ExecutionApplied(TEST_AGENT_ID, 1, actionCommitment, 0);

        vm.expectEmit(true, false, false, true);
        emit IOptimisticKernelVault.OptimisticExecutionSubmitted(1, journalHash, BOND_AMOUNT, deadline);

        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
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

    // ============ Error Path Tests ============

    function test_executeOptimistic_notOwner_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.prank(nonOwner);
        vm.expectRevert(KernelVault.NotOwner.selector);
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_executeOptimistic_notEnabled_reverts() public {
        vault.setOptimisticEnabled(false);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectRevert(IOptimisticKernelVault.OptimisticNotEnabled.selector);
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_executeOptimistic_wrongAgentId_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes32 wrongAgentId = bytes32(uint256(0xBADA6E17));
        bytes memory journal = _buildJournal(wrongAgentId, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(KernelVault.AgentIdMismatch.selector, TEST_AGENT_ID, wrongAgentId)
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_executeOptimistic_actionCommitmentMismatch_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 wrongCommitment = bytes32(uint256(0xBADBAD));
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, wrongCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        bytes32 actualCommitment = sha256(agentOutputBytes);
        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.ActionCommitmentMismatch.selector, wrongCommitment, actualCommitment
            )
        );
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT, bondAttestation);
    }

    function test_submitProof_notPending_reverts() public {
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

        mockRiscZeroVerifier.setShouldFail(true);

        vm.expectRevert(IOptimisticKernelVault.ProofVerificationFailed.selector);
        vault.submitProof(1, hex"deadbeef");
    }

    // ============ Oracle Interaction Tests ============

    function test_executeOptimistic_withOracle_invalid_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Oracle signer is already configured, so invalid oracle sig should revert
        vault.setOracleSigner(vm.addr(ORACLE_PRIVATE_KEY), 900);

        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, 1, actionCommitment);
        bytes memory bondAttestation = _signBondAttestation(owner, address(vault), 1, BOND_AMOUNT, BOND_CHAIN_ID);

        vm.expectRevert();
        vault.executeOptimistic(
            journal, agentOutputBytes, hex"0000", uint64(block.timestamp), BOND_AMOUNT, bondAttestation
        );
    }
}
