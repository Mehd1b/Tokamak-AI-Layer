// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { OptimisticKernelVault } from "../../src/OptimisticKernelVault.sol";
import { KernelVault } from "../../src/KernelVault.sol";
import { KernelExecutionVerifier } from "../../src/KernelExecutionVerifier.sol";
import { KernelOutputParser } from "../../src/KernelOutputParser.sol";
import { WSTONBondManager } from "../../src/WSTONBondManager.sol";
import { IOptimisticKernelVault } from "../../src/interfaces/IOptimisticKernelVault.sol";
import { MockVerifier } from "../mocks/MockVerifier.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title OptimisticIntegrationTest
/// @notice Integration tests for the full optimistic execution stack
contract OptimisticIntegrationTest is Test {
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
    address public slasher = address(0x4444444444444444444444444444444444444444);

    bytes32 public constant TEST_AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant TEST_IMAGE_ID = bytes32(uint256(0x1234));
    bytes32 public constant TEST_CODE_HASH = bytes32(uint256(0xC0DE));
    bytes32 public constant TEST_CONSTRAINT_HASH = bytes32(uint256(0xC0175A1));
    bytes32 public constant TEST_INPUT_ROOT = bytes32(uint256(0x1200700));
    bytes32 public constant TEST_INPUT_COMMITMENT = bytes32(uint256(0x11207));

    uint256 public constant INITIAL_BALANCE = 1000 ether;
    uint256 public constant DEPOSIT_AMOUNT = 100 ether;
    uint256 public constant BOND_AMOUNT = 10 ether;

    function setUp() public {
        // Deploy mock RISC Zero verifier (underneath the real KernelExecutionVerifier)
        mockRiscZeroVerifier = new MockVerifier();

        // Deploy real KernelExecutionVerifier via proxy
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
            address(this),
            address(bondManager)
        );

        // Authorize vault in BondManager
        bondManager.authorizeVault(address(vault));

        // Enable optimistic execution
        vault.setOptimisticEnabled(true);
        vault.setMinBond(BOND_AMOUNT);

        // Mint tokens to user and set up approvals
        token.mint(user, INITIAL_BALANCE);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);

        // Mint WSTON to owner for bonds and approve BondManager
        mockWston.mint(owner, 1000 ether);
        mockWston.approve(address(bondManager), type(uint256).max);
    }

    // ============ Helper Functions ============

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

    function _submitOptimisticEmpty(uint64 nonce) internal {
        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function _submitOptimisticTransfer(uint64 nonce, uint256 transferAmount) internal {
        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        vault.executeOptimistic(journal, agentOutputBytes, "", 0, BOND_AMOUNT);
    }

    function _submitSyncEmpty(uint64 nonce) internal {
        bytes memory agentOutputBytes = _buildEmptyAction();
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";
        vault.execute(journal, seal, agentOutputBytes);
    }

    function _submitSyncTransfer(uint64 nonce, uint256 transferAmount) internal {
        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";
        vault.execute(journal, seal, agentOutputBytes);
    }

    // ============ Integration Tests ============

    /// @notice Submit 3 optimistic executions concurrently, then finalize all with proofs
    function test_multipleConcurrentPending() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Submit 3 optimistic executions
        _submitOptimisticEmpty(1);
        _submitOptimisticEmpty(2);
        _submitOptimisticEmpty(3);

        assertEq(vault.pendingCount(), 3);
        assertEq(vault.lastExecutionNonce(), 3);

        // Verify all are pending
        assertEq(vault.getPendingExecution(1).status, 1);
        assertEq(vault.getPendingExecution(2).status, 1);
        assertEq(vault.getPendingExecution(3).status, 1);

        // Finalize all with proofs (out of order to test independence)
        vault.submitProof(3, hex"deadbeef");
        vault.submitProof(1, hex"deadbeef");
        vault.submitProof(2, hex"deadbeef");

        assertEq(vault.pendingCount(), 0);
        assertEq(vault.getPendingExecution(1).status, 2); // FINALIZED
        assertEq(vault.getPendingExecution(2).status, 2);
        assertEq(vault.getPendingExecution(3).status, 2);
    }

    /// @notice Alternate between synchronous execute() and optimistic execution
    function test_mixedSyncAndOptimistic() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 recipientBefore = token.balanceOf(recipient);

        // Sync nonce 1 (transfer 1 ether)
        _submitSyncTransfer(1, 1 ether);
        assertEq(vault.lastExecutionNonce(), 1);
        assertEq(vault.pendingCount(), 0);

        // Optimistic nonce 2 (no transfer — empty)
        _submitOptimisticEmpty(2);
        assertEq(vault.lastExecutionNonce(), 2);
        assertEq(vault.pendingCount(), 1);

        // Sync nonce 3 (transfer 2 ether)
        _submitSyncTransfer(3, 2 ether);
        assertEq(vault.lastExecutionNonce(), 3);
        assertEq(vault.pendingCount(), 1);

        // Optimistic nonce 4 (transfer 3 ether)
        _submitOptimisticTransfer(4, 3 ether);
        assertEq(vault.lastExecutionNonce(), 4);
        assertEq(vault.pendingCount(), 2);

        // Finalize pending proofs
        vault.submitProof(2, hex"deadbeef");
        vault.submitProof(4, hex"deadbeef");
        assertEq(vault.pendingCount(), 0);

        // Verify total transferred: 1 + 2 + 3 = 6 ether
        assertEq(token.balanceOf(recipient), recipientBefore + 6 ether);
    }

    /// @notice Submit 3, finalize 1, slash 1, leave 1 pending
    function test_partialFinalization() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 ownerWstonBefore = mockWston.balanceOf(owner);

        // Submit 3 optimistic executions
        _submitOptimisticEmpty(1);
        _submitOptimisticEmpty(2);
        _submitOptimisticEmpty(3);

        assertEq(vault.pendingCount(), 3);
        assertEq(mockWston.balanceOf(owner), ownerWstonBefore - 3 * BOND_AMOUNT);

        // Finalize nonce 2 with proof — bond returned
        vault.submitProof(2, hex"deadbeef");
        assertEq(vault.pendingCount(), 2);
        assertEq(vault.getPendingExecution(2).status, 2); // FINALIZED
        assertEq(mockWston.balanceOf(owner), ownerWstonBefore - 2 * BOND_AMOUNT);

        // Warp past deadline to allow slashing
        vm.warp(block.timestamp + vault.challengeWindow() + 1);

        // Slash nonce 1 — bond distributed (finder gets 10%)
        uint256 slasherWstonBefore = mockWston.balanceOf(slasher);
        vm.prank(slasher);
        vault.slashExpired(1);
        assertEq(vault.pendingCount(), 1);
        assertEq(vault.getPendingExecution(1).status, 3); // SLASHED
        assertEq(mockWston.balanceOf(slasher), slasherWstonBefore + 1 ether); // 10% finder fee

        // Nonce 3 is still pending
        assertEq(vault.getPendingExecution(3).status, 1); // PENDING
    }

    /// @notice Synchronous execute then optimistic on next nonce — verifies nonce continuity
    function test_optimisticAfterSync() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Sync execute nonce 1
        _submitSyncEmpty(1);
        assertEq(vault.lastExecutionNonce(), 1);

        // Optimistic nonce 2
        _submitOptimisticEmpty(2);
        assertEq(vault.lastExecutionNonce(), 2);
        assertEq(vault.pendingCount(), 1);

        // Sync execute nonce 3
        _submitSyncEmpty(3);
        assertEq(vault.lastExecutionNonce(), 3);
        assertEq(vault.pendingCount(), 1);

        // Finalize nonce 2
        vault.submitProof(2, hex"deadbeef");
        assertEq(vault.pendingCount(), 0);

        // Another optimistic at nonce 4
        _submitOptimisticEmpty(4);
        assertEq(vault.lastExecutionNonce(), 4);
        assertEq(vault.pendingCount(), 1);

        // Verify the whole nonce sequence is valid
        assertEq(vault.lastExecutionNonce(), 4);
    }

    /// @notice Full lifecycle with deposits, transfers, strategy activation, and settlement
    function test_fullLifecycle_depositsTransfersSettlement() public {
        // User deposits
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Optimistic execution transfers 20 ether to recipient
        _submitOptimisticTransfer(1, 20 ether);

        // Strategy should be active (balance decreased)
        assertTrue(vault.strategyActive());
        assertEq(token.balanceOf(recipient), 20 ether);
        assertEq(token.balanceOf(address(vault)), DEPOSIT_AMOUNT - 20 ether);

        // Submit proof to finalize
        vault.submitProof(1, hex"deadbeef");
        assertEq(vault.pendingCount(), 0);

        // Settle strategy
        vault.settle();
        assertFalse(vault.strategyActive());

        // Sync execution at nonce 2
        _submitSyncTransfer(2, 10 ether);
        assertEq(token.balanceOf(recipient), 30 ether);

        // Settle again
        vault.settle();

        // User can still withdraw remaining assets
        uint256 userShares = vault.shares(user);
        vm.prank(user);
        uint256 assetsOut = vault.withdraw(userShares);

        // Approximately 70 ether remaining (100 - 20 - 10)
        assertEq(assetsOut, 70 ether);
    }

}
