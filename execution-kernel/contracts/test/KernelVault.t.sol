// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { KernelVault } from "../src/KernelVault.sol";
import { KernelExecutionVerifier } from "../src/KernelExecutionVerifier.sol";
import { KernelOutputParser } from "../src/KernelOutputParser.sol";
import { MockVerifier } from "./mocks/MockVerifier.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title KernelVaultTest
/// @notice Comprehensive test suite for KernelVault
contract KernelVaultTest is Test {
    KernelVault public vault;
    KernelExecutionVerifier public executionVerifier;
    MockVerifier public mockRiscZeroVerifier;
    MockERC20 public token;

    address public owner = address(this);
    address public user = address(0x1111111111111111111111111111111111111111);
    address public recipient = address(0x2222222222222222222222222222222222222222);

    bytes32 public constant TEST_AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant TEST_IMAGE_ID = bytes32(uint256(0x1234));
    bytes32 public constant TEST_CODE_HASH = bytes32(uint256(0xC0DE));
    bytes32 public constant TEST_CONSTRAINT_HASH = bytes32(uint256(0xC0175A1));
    bytes32 public constant TEST_INPUT_ROOT = bytes32(uint256(0x1200700));
    bytes32 public constant TEST_INPUT_COMMITMENT = bytes32(uint256(0x11207));

    uint256 public constant INITIAL_BALANCE = 1000 ether;
    uint256 public constant DEPOSIT_AMOUNT = 100 ether;

    /// @dev Virtual offset multiplier — first deposit of X assets yields X * OFFSET shares
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

        // Deploy KernelVault with trustedImageId
        vault = new KernelVault(address(token), address(executionVerifier), TEST_AGENT_ID, TEST_IMAGE_ID, address(this));

        // Mint tokens to user
        token.mint(user, INITIAL_BALANCE);

        // Approve vault to spend user tokens
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
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
        // Create payload: abi.encode(token, to, amount)
        bytes memory payload = abi.encode(tokenAddr, to, amount);

        // Create action
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(uint256(uint160(tokenAddr))), // target can be token address
            payload: payload
        });

        return KernelOutputParser.encodeAgentOutput(actions);
    }

    /// @notice Build AgentOutput with multiple actions
    function _buildMultipleTransferActions(
        address tokenAddr,
        address[] memory recipients,
        uint256[] memory amounts
    ) internal pure returns (bytes memory) {
        require(recipients.length == amounts.length, "Length mismatch");

        KernelOutputParser.Action[] memory actions =
            new KernelOutputParser.Action[](recipients.length);

        for (uint256 i = 0; i < recipients.length; i++) {
            bytes memory payload = abi.encode(tokenAddr, recipients[i], amounts[i]);
            actions[i] = KernelOutputParser.Action({
                actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
                target: bytes32(uint256(uint160(tokenAddr))),
                payload: payload
            });
        }

        return KernelOutputParser.encodeAgentOutput(actions);
    }

    // ============ Deposit Tests ============

    function test_deposit_success() public {
        vm.prank(user);
        uint256 sharesMinted = vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        assertEq(sharesMinted, DEPOSIT_AMOUNT * OFFSET);
        assertEq(vault.shares(user), DEPOSIT_AMOUNT * OFFSET);
        assertEq(vault.totalShares(), DEPOSIT_AMOUNT * OFFSET);
        assertEq(token.balanceOf(address(vault)), DEPOSIT_AMOUNT);
        assertEq(token.balanceOf(user), INITIAL_BALANCE - DEPOSIT_AMOUNT);
    }

    function test_deposit_zeroAmount_reverts() public {
        vm.prank(user);
        vm.expectRevert(KernelVault.ZeroDeposit.selector);
        vault.depositERC20Tokens(0);
    }

    function test_deposit_multipleDeposits() public {
        vm.startPrank(user);

        vault.depositERC20Tokens(DEPOSIT_AMOUNT);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        vm.stopPrank();

        assertEq(vault.shares(user), DEPOSIT_AMOUNT * 2 * OFFSET);
        assertEq(vault.totalShares(), DEPOSIT_AMOUNT * 2 * OFFSET);
    }

    // ============ Withdraw Tests ============

    function test_withdraw_success() public {
        vm.startPrank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 balanceBefore = token.balanceOf(user);
        uint256 amount = vault.withdraw(DEPOSIT_AMOUNT * OFFSET);
        vm.stopPrank();

        assertEq(amount, DEPOSIT_AMOUNT);
        assertEq(vault.shares(user), 0);
        assertEq(vault.totalShares(), 0);
        assertEq(token.balanceOf(user), balanceBefore + DEPOSIT_AMOUNT);
    }

    function test_withdraw_partial() public {
        vm.startPrank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 withdrawShares = DEPOSIT_AMOUNT * OFFSET / 2;
        vault.withdraw(withdrawShares);
        vm.stopPrank();

        assertEq(vault.shares(user), DEPOSIT_AMOUNT * OFFSET - withdrawShares);
    }

    function test_withdraw_zeroAmount_reverts() public {
        vm.prank(user);
        vm.expectRevert(KernelVault.ZeroWithdraw.selector);
        vault.withdraw(0);
    }

    function test_withdraw_insufficientShares_reverts() public {
        vm.startPrank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.InsufficientShares.selector, DEPOSIT_AMOUNT * OFFSET + 1, DEPOSIT_AMOUNT * OFFSET
            )
        );
        vault.withdraw(DEPOSIT_AMOUNT * OFFSET + 1);
        vm.stopPrank();
    }

    // ============ Execute Tests ============

    function test_execute_transferAction_success() public {
        // Setup: deposit tokens to vault
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 transferAmount = 10 ether;

        // Build agent output with transfer action
        bytes memory agentOutputBytes =
            _buildTransferAction(address(token), recipient, transferAmount);

        // Compute action commitment
        bytes32 actionCommitment = sha256(agentOutputBytes);

        // Build journal
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);

        // Execute
        bytes memory seal = hex"deadbeef"; // Mock verifier ignores this

        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        uint256 vaultBalanceBefore = token.balanceOf(address(vault));

        vault.execute(journal, seal, agentOutputBytes);

        // Verify transfer occurred
        assertEq(token.balanceOf(recipient), recipientBalanceBefore + transferAmount);
        assertEq(token.balanceOf(address(vault)), vaultBalanceBefore - transferAmount);

        // Verify nonce updated
        assertEq(vault.lastExecutionNonce(), nonce);
    }

    function test_execute_multipleTransfers_success() public {
        // Setup: deposit tokens to vault
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Build multiple transfer actions
        address[] memory recipients = new address[](3);
        recipients[0] = address(0x1111);
        recipients[1] = address(0x2222);
        recipients[2] = address(0x3333);

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 5 ether;
        amounts[1] = 10 ether;
        amounts[2] = 15 ether;

        bytes memory agentOutputBytes =
            _buildMultipleTransferActions(address(token), recipients, amounts);
        bytes32 actionCommitment = sha256(agentOutputBytes);

        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        vault.execute(journal, seal, agentOutputBytes);

        // Verify all transfers
        assertEq(token.balanceOf(recipients[0]), amounts[0]);
        assertEq(token.balanceOf(recipients[1]), amounts[1]);
        assertEq(token.balanceOf(recipients[2]), amounts[2]);
    }

    function test_execute_replayProtection_reverts() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, 1 ether);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        // First execution should succeed
        vault.execute(journal, seal, agentOutputBytes);

        // Second execution with same nonce should fail
        vm.expectRevert(abi.encodeWithSelector(KernelVault.InvalidNonce.selector, nonce, nonce));
        vault.execute(journal, seal, agentOutputBytes);
    }

    function test_execute_nonceGap_withinLimit_succeeds() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Execute with nonce 1 (correct - lastNonce is 0)
        bytes memory agentOutputBytes1 = _buildTransferAction(address(token), recipient, 1 ether);
        bytes32 actionCommitment1 = sha256(agentOutputBytes1);
        uint64 nonce1 = 1;
        bytes memory journal1 = _buildJournal(TEST_AGENT_ID, nonce1, actionCommitment1);
        bytes memory seal = hex"deadbeef";

        vault.execute(journal1, seal, agentOutputBytes1);
        assertEq(vault.lastExecutionNonce(), 1);

        // Execute with nonce 3 (skipping nonce 2 - allowed with gap tolerance)
        bytes memory agentOutputBytes2 = _buildTransferAction(address(token), recipient, 2 ether);
        bytes32 actionCommitment2 = sha256(agentOutputBytes2);
        uint64 nonce2 = 3;
        bytes memory journal2 = _buildJournal(TEST_AGENT_ID, nonce2, actionCommitment2);

        // Gap of 2 is within MAX_NONCE_GAP (100), so this should succeed
        vault.execute(journal2, seal, agentOutputBytes2);
        assertEq(vault.lastExecutionNonce(), 3);
    }

    function test_execute_nonceGap_exceedsLimit_reverts() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Execute with nonce 1
        bytes memory agentOutputBytes1 = _buildTransferAction(address(token), recipient, 1 ether);
        bytes32 actionCommitment1 = sha256(agentOutputBytes1);
        uint64 nonce1 = 1;
        bytes memory journal1 = _buildJournal(TEST_AGENT_ID, nonce1, actionCommitment1);
        bytes memory seal = hex"deadbeef";

        vault.execute(journal1, seal, agentOutputBytes1);

        // Try to execute with nonce 102 (gap of 101 exceeds MAX_NONCE_GAP of 100)
        bytes memory agentOutputBytes2 = _buildTransferAction(address(token), recipient, 2 ether);
        bytes32 actionCommitment2 = sha256(agentOutputBytes2);
        uint64 nonce2 = 102;
        bytes memory journal2 = _buildJournal(TEST_AGENT_ID, nonce2, actionCommitment2);

        vm.expectRevert(
            abi.encodeWithSelector(KernelVault.NonceGapTooLarge.selector, nonce1, nonce2, 100)
        );
        vault.execute(journal2, seal, agentOutputBytes2);
    }

    function test_execute_actionCommitmentMismatch_reverts() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, 1 ether);
        bytes32 wrongCommitment = bytes32(uint256(0xBADBAD));
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, wrongCommitment);
        bytes memory seal = hex"deadbeef";

        bytes32 actualCommitment = sha256(agentOutputBytes);

        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.ActionCommitmentMismatch.selector, wrongCommitment, actualCommitment
            )
        );
        vault.execute(journal, seal, agentOutputBytes);
    }

    function test_execute_wrongAgentId_reverts() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, 1 ether);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        uint64 nonce = 1;

        // Use wrong agent ID
        bytes32 wrongAgentId = bytes32(uint256(0xBADA6E17));
        bytes memory journal = _buildJournal(wrongAgentId, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        // With verifyAndParseWithImageId, the vault checks agentId match after parsing
        // The verifier no longer checks agent registration - it uses the caller-provided imageId
        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.AgentIdMismatch.selector, TEST_AGENT_ID, wrongAgentId
            )
        );
        vault.execute(journal, seal, agentOutputBytes);
    }

    function test_execute_emitsEvent() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, 1 ether);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        vm.expectEmit(true, true, false, true);
        emit KernelVault.ExecutionApplied(TEST_AGENT_ID, nonce, actionCommitment, 1);

        vault.execute(journal, seal, agentOutputBytes);
    }

    function test_execute_incrementingNonces_success() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        bytes memory seal = hex"deadbeef";

        // Execute multiple times with incrementing nonces
        for (uint64 i = 1; i <= 5; i++) {
            bytes memory agentOutputBytes = _buildTransferAction(address(token), recipient, 1 ether);
            bytes32 actionCommitment = sha256(agentOutputBytes);
            bytes memory journal = _buildJournal(TEST_AGENT_ID, i, actionCommitment);

            vault.execute(journal, seal, agentOutputBytes);
            assertEq(vault.lastExecutionNonce(), i);
        }

        assertEq(token.balanceOf(recipient), 5 ether);
    }

    // ============ Edge Cases ============

    function test_execute_emptyActions() public {
        // Setup
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Build empty action output
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](0);
        bytes memory agentOutputBytes = KernelOutputParser.encodeAgentOutput(actions);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        // Should succeed with no actions executed
        vault.execute(journal, seal, agentOutputBytes);
        assertEq(vault.lastExecutionNonce(), nonce);
    }

    function test_constants() public view {
        assertEq(vault.ACTION_TYPE_CALL(), 0x00000002);
        assertEq(vault.ACTION_TYPE_TRANSFER_ERC20(), 0x00000003);
        assertEq(vault.agentId(), TEST_AGENT_ID);
        assertEq(vault.trustedImageId(), TEST_IMAGE_ID);
    }

    function test_constructor_zeroImageId_reverts() public {
        vm.expectRevert(KernelVault.InvalidTrustedImageId.selector);
        new KernelVault(address(token), address(executionVerifier), TEST_AGENT_ID, bytes32(0), address(this));
    }

    function test_execute_usesVerifyAndParseWithImageId() public {
        // This test verifies that execute() uses verifyAndParseWithImageId with the pinned trustedImageId
        // We can verify this by checking that execution works correctly when the vault is configured
        // with a trustedImageId that matches the mock verifier's expectations

        // Setup: deposit tokens to vault
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 transferAmount = 10 ether;
        bytes memory agentOutputBytes =
            _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        // Execute - this will use verifyAndParseWithImageId internally
        vault.execute(journal, seal, agentOutputBytes);

        // Verify transfer occurred
        assertEq(token.balanceOf(recipient), recipientBalanceBefore + transferAmount);
        assertEq(vault.lastExecutionNonce(), nonce);
    }

    // ============ PPS Accounting Tests ============

    function test_totalAssets_returnsBalance() public {
        // Initially zero
        assertEq(vault.totalAssets(), 0);

        // After deposit
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);
        assertEq(vault.totalAssets(), DEPOSIT_AMOUNT);
        assertEq(vault.totalAssets(), token.balanceOf(address(vault)));
    }

    function test_convertToShares_whenEmpty_returnsWithOffset() public view {
        // When totalShares == 0: shares = assets * OFFSET / 1
        assertEq(vault.convertToShares(100 ether), 100 ether * OFFSET);
        assertEq(vault.convertToShares(1), OFFSET);
    }

    function test_convertToAssets_whenEmpty_returnsWithOffset() public view {
        // When totalShares == 0: assets = shares * 1 / OFFSET
        // Round-trip: convertToAssets(convertToShares(X)) ≈ X
        assertEq(vault.convertToAssets(100 ether * OFFSET), 100 ether);
        assertEq(vault.convertToAssets(OFFSET), 1);
    }

    function test_deposit_whenEmpty_mintsWithOffset() public {
        // totalShares=0, deposit 100 → 100 * OFFSET shares
        vm.prank(user);
        uint256 sharesMinted = vault.depositERC20Tokens(100 ether);

        assertEq(sharesMinted, 100 ether * OFFSET);
        assertEq(vault.shares(user), 100 ether * OFFSET);
        assertEq(vault.totalShares(), 100 ether * OFFSET);
        assertEq(vault.totalAssets(), 100 ether);
    }

    function test_deposit_withYield_mintsPPS() public {
        // User1 deposits 100 assets → gets 100_000 shares (100 * OFFSET when empty)
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        assertEq(vault.shares(user), 100 ether * OFFSET);
        assertEq(vault.totalShares(), 100 ether * OFFSET);
        assertEq(vault.totalAssets(), 100 ether);

        // Simulate yield: mint 100 tokens directly to vault (doubling assets)
        token.mint(address(vault), 100 ether);

        // Now totalAssets = 200 ether, totalShares = 100_000 ether
        assertEq(vault.totalAssets(), 200 ether);
        assertEq(vault.totalShares(), 100 ether * OFFSET);

        // User2 deposits 100 assets → should get ~50_000 shares
        // shares = 100 * (100_000 + 1000) / (200 + 1) ≈ 50_000
        address user2 = address(0x3333333333333333333333333333333333333333);
        token.mint(user2, 100 ether);
        vm.startPrank(user2);
        token.approve(address(vault), type(uint256).max);
        uint256 sharesMinted = vault.depositERC20Tokens(100 ether);
        vm.stopPrank();

        assertApproxEqAbs(sharesMinted, 50 ether * OFFSET, OFFSET);
        assertApproxEqAbs(vault.shares(user2), 50 ether * OFFSET, OFFSET);
        assertApproxEqAbs(vault.totalShares(), 150 ether * OFFSET, OFFSET);
        assertEq(vault.totalAssets(), 300 ether);
    }

    function test_withdraw_reflectsPPS() public {
        // User1 deposits 100 assets → gets 100_000 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        // Simulate yield: double the assets
        token.mint(address(vault), 100 ether);

        // Now totalAssets = 200, totalShares = 100_000
        assertEq(vault.totalAssets(), 200 ether);
        assertEq(vault.totalShares(), 100 ether * OFFSET);

        // User1 withdraws all shares → should get ~200 assets (1 wei rounding from offset)
        uint256 balanceBefore = token.balanceOf(user);
        vm.prank(user);
        uint256 assetsOut = vault.withdraw(100 ether * OFFSET);

        assertApproxEqAbs(assetsOut, 200 ether, 1);
        assertApproxEqAbs(token.balanceOf(user), balanceBefore + 200 ether, 1);
        assertEq(vault.shares(user), 0);
        assertEq(vault.totalShares(), 0);
        assertLe(vault.totalAssets(), 1); // ≤1 wei rounding dust
    }

    function test_withdraw_partialAfterYield() public {
        // User deposits 100 assets → gets 100_000 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        // Simulate yield: double the assets
        token.mint(address(vault), 100 ether);

        // Now totalAssets = 200, totalShares = 100_000
        // User withdraws 50_000 shares → should get ~100 assets
        uint256 balanceBefore = token.balanceOf(user);
        vm.prank(user);
        uint256 assetsOut = vault.withdraw(50 ether * OFFSET);

        assertApproxEqAbs(assetsOut, 100 ether, 1);
        assertApproxEqAbs(token.balanceOf(user), balanceBefore + 100 ether, 1);
        assertEq(vault.shares(user), 50 ether * OFFSET);
        assertEq(vault.totalShares(), 50 ether * OFFSET);
        assertApproxEqAbs(vault.totalAssets(), 100 ether, 1);
    }

    function test_execute_changesPPS_notShares() public {
        // User deposits 100 assets → gets 100_000 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        assertEq(vault.totalShares(), 100 ether * OFFSET);
        assertEq(vault.totalAssets(), 100 ether);

        // Execute transfers 40 tokens out of vault (activates strategy via TRANSFER_ERC20)
        uint256 transferAmount = 40 ether;
        bytes memory agentOutputBytes =
            _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        vault.execute(journal, seal, agentOutputBytes);

        // Shares should NOT change
        assertEq(vault.totalShares(), 100 ether * OFFSET);
        assertEq(vault.shares(user), 100 ether * OFFSET);

        // Assets should decrease, strategy should be active
        assertEq(vault.totalAssets(), 60 ether);
        assertTrue(vault.strategyActive());

        // Settle the strategy so user can withdraw at current PPS
        vault.settle();

        // User withdraws all shares → should get 60 assets (loss from transfer)
        uint256 balanceBefore = token.balanceOf(user);
        vm.prank(user);
        uint256 assetsOut = vault.withdraw(100 ether * OFFSET);

        assertEq(assetsOut, 60 ether);
        assertEq(token.balanceOf(user), balanceBefore + 60 ether);
    }

    function test_convertToShares_afterYield() public {
        // User deposits 100 assets → gets 100_000 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        // Simulate yield: double the assets
        token.mint(address(vault), 100 ether);

        // Now totalAssets = 200, totalShares = 100_000
        // convertToShares(100) ≈ 100 * (100_000 + 1000) / (200 + 1) ≈ 50_000
        assertApproxEqAbs(vault.convertToShares(100 ether), 50 ether * OFFSET, OFFSET);
        assertApproxEqAbs(vault.convertToShares(200 ether), 100 ether * OFFSET, OFFSET);
        assertApproxEqAbs(vault.convertToShares(50 ether), 25 ether * OFFSET, OFFSET);
    }

    function test_convertToAssets_afterYield() public {
        // User deposits 100 assets → gets 100_000 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        // Simulate yield: double the assets
        token.mint(address(vault), 100 ether);

        // Now totalAssets = 200, totalShares = 100_000
        // convertToAssets(100_000) ≈ 100_000 * (200+1) / (100_000+1000) ≈ 200
        assertApproxEqAbs(vault.convertToAssets(100 ether * OFFSET), 200 ether, 1);
        assertApproxEqAbs(vault.convertToAssets(50 ether * OFFSET), 100 ether, 1);
        assertApproxEqAbs(vault.convertToAssets(25 ether * OFFSET), 50 ether, 1);
    }

    function test_pps_multipleUsersWithYield() public {
        // User1 deposits 100 assets → gets 100_000 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        // Yield: +50 assets (now 150 assets, 100_000 shares)
        token.mint(address(vault), 50 ether);

        // User2 deposits 150 assets → gets ~100_000 shares (150 * (100_000+1000) / (150+1) ≈ 100_000)
        address user2 = address(0x4444444444444444444444444444444444444444);
        token.mint(user2, 150 ether);
        vm.startPrank(user2);
        token.approve(address(vault), type(uint256).max);
        uint256 user2Shares = vault.depositERC20Tokens(150 ether);
        vm.stopPrank();

        assertApproxEqAbs(user2Shares, 100 ether * OFFSET, OFFSET);

        // State: totalAssets = 300, totalShares ≈ 200_000
        assertEq(vault.totalAssets(), 300 ether);
        assertApproxEqAbs(vault.totalShares(), 200 ether * OFFSET, OFFSET);

        // More yield: +60 assets (now 360 assets, ~200_000 shares)
        token.mint(address(vault), 60 ether);

        // User1 withdraws 100_000 shares → gets ~180 assets
        uint256 user1BalanceBefore = token.balanceOf(user);
        vm.prank(user);
        uint256 user1Out = vault.withdraw(100 ether * OFFSET);
        assertApproxEqAbs(user1Out, 180 ether, 1);
        assertApproxEqAbs(token.balanceOf(user), user1BalanceBefore + 180 ether, 1);

        // User2 withdraws all shares → gets ~180 assets
        uint256 user2BalanceBefore = token.balanceOf(user2);
        vm.prank(user2);
        uint256 user2Out = vault.withdraw(user2Shares);
        assertApproxEqAbs(user2Out, 180 ether, 1);
        assertApproxEqAbs(token.balanceOf(user2), user2BalanceBefore + 180 ether, 1);

        // Vault should be nearly empty (≤2 wei rounding dust)
        assertLe(vault.totalAssets(), 2);
        assertEq(vault.totalShares(), 0);
    }

    function test_execute_assetsIncrease_ppsGoesUp() public {
        // User deposits 100 assets → gets 100_000 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        // Simulate an execute that brings assets INTO the vault
        // We'll do this by minting directly (simulating a profitable trade)
        token.mint(address(vault), 50 ether);

        // Now totalAssets = 150, totalShares = 100_000
        // User's 100_000 shares are now worth ~150 assets
        assertApproxEqAbs(vault.convertToAssets(100 ether * OFFSET), 150 ether, 1);

        vm.prank(user);
        uint256 assetsOut = vault.withdraw(100 ether * OFFSET);
        assertApproxEqAbs(assetsOut, 150 ether, 1);
    }

    // ============ TVL Tracking Tests ============

    function test_tvl_startsAtZero() public view {
        assertEq(vault.totalValueLocked(), 0);
        assertEq(vault.totalDeposited(), 0);
        assertEq(vault.totalWithdrawn(), 0);
    }

    function test_tvl_increasesOnDeposit() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        assertEq(vault.totalValueLocked(), DEPOSIT_AMOUNT);
        assertEq(vault.totalDeposited(), DEPOSIT_AMOUNT);
        assertEq(vault.totalWithdrawn(), 0);
    }

    function test_tvl_decreasesOnWithdraw() public {
        vm.startPrank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        uint256 withdrawShares = DEPOSIT_AMOUNT * OFFSET / 2;
        uint256 assetsOut = vault.withdraw(withdrawShares);
        vm.stopPrank();

        assertEq(vault.totalValueLocked(), DEPOSIT_AMOUNT - assetsOut);
        assertEq(vault.totalDeposited(), DEPOSIT_AMOUNT);
        assertEq(vault.totalWithdrawn(), assetsOut);
    }

    function test_tvl_unaffectedByExecute() public {
        // Deposit 100
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        assertEq(vault.totalValueLocked(), DEPOSIT_AMOUNT);

        // Execute transfers 40 tokens out of vault
        uint256 transferAmount = 40 ether;
        bytes memory agentOutputBytes =
            _buildTransferAction(address(token), recipient, transferAmount);
        bytes32 actionCommitment = sha256(agentOutputBytes);
        uint64 nonce = 1;
        bytes memory journal = _buildJournal(TEST_AGENT_ID, nonce, actionCommitment);
        bytes memory seal = hex"deadbeef";

        vault.execute(journal, seal, agentOutputBytes);

        // Key invariant: TVL stays at 100 even though vault balance is 60
        assertEq(vault.totalAssets(), DEPOSIT_AMOUNT - transferAmount);
        assertEq(vault.totalValueLocked(), DEPOSIT_AMOUNT);
    }

    function test_tvl_unaffectedByDirectTransfer() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        assertEq(vault.totalValueLocked(), DEPOSIT_AMOUNT);

        // Direct transfer to vault (not through deposit)
        token.mint(address(vault), 50 ether);

        // totalAssets increases but TVL should not
        assertEq(vault.totalAssets(), DEPOSIT_AMOUNT + 50 ether);
        assertEq(vault.totalValueLocked(), DEPOSIT_AMOUNT);
    }

    function test_tvl_safeUnderflow() public {
        // Deposit 100
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Simulate yield: double the assets
        token.mint(address(vault), DEPOSIT_AMOUNT);

        // Withdraw all shares — assetsOut will be ~200 (> totalDeposited of 100)
        vm.prank(user);
        uint256 assetsOut = vault.withdraw(DEPOSIT_AMOUNT * OFFSET);
        assertApproxEqAbs(assetsOut, 200 ether, 1);

        // totalWithdrawn (~200) > totalDeposited (100) — should return 0, not underflow
        assertEq(vault.totalValueLocked(), 0);
    }

    function test_tvl_multipleDepositsAndWithdrawals() public {
        vm.startPrank(user);

        // Deposit 50
        vault.depositERC20Tokens(50 ether);
        assertEq(vault.totalValueLocked(), 50 ether);

        // Deposit 50 more
        vault.depositERC20Tokens(50 ether);
        assertEq(vault.totalValueLocked(), 100 ether);

        // Withdraw 25_000 shares (25 assets at 1:OFFSET PPS)
        vault.withdraw(25 ether * OFFSET);
        assertEq(vault.totalValueLocked(), 75 ether);

        vm.stopPrank();
    }

    // ============ Emergency Withdraw Tests ============

    function test_emergencyWithdraw_success() public {
        // Deposit
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        // Pause the vault
        vault.pause();

        // Warp past emergency withdraw delay
        vm.warp(block.timestamp + 14 days + 1);

        // Emergency withdraw
        uint256 balanceBefore = token.balanceOf(user);
        vm.prank(user);
        uint256 assetsOut = vault.emergencyWithdraw(DEPOSIT_AMOUNT * OFFSET);

        assertEq(assetsOut, DEPOSIT_AMOUNT);
        assertEq(token.balanceOf(user), balanceBefore + DEPOSIT_AMOUNT);
        assertEq(vault.shares(user), 0);
    }

    function test_emergencyWithdraw_tooEarly_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        vault.pause();

        // Try before delay expires
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.EmergencyWithdrawTooEarly.selector,
                block.timestamp + 14 days,
                block.timestamp
            )
        );
        vault.emergencyWithdraw(DEPOSIT_AMOUNT * OFFSET);
    }

    function test_emergencyWithdraw_notPaused_reverts() public {
        vm.prank(user);
        vault.depositERC20Tokens(DEPOSIT_AMOUNT);

        vm.prank(user);
        vm.expectRevert("not paused");
        vault.emergencyWithdraw(DEPOSIT_AMOUNT * OFFSET);
    }

    function test_pausedAt_tracksTimestamp() public {
        assertEq(vault.pausedAt(), 0);

        vm.warp(1000);
        vault.pause();
        assertEq(vault.pausedAt(), 1000);

        vault.unpause();
        assertEq(vault.pausedAt(), 0);
    }

    function test_rounding_depositorGetsFewer() public {
        // User1 deposits 100 assets → gets 100 shares
        vm.prank(user);
        vault.depositERC20Tokens(100 ether);

        // Add 1 wei of yield
        token.mint(address(vault), 1);

        // totalAssets = 100 ether + 1, totalShares = 100 ether
        // User2 deposits 100 ether
        // shares = 100 ether * 100 ether / (100 ether + 1)
        // Due to floor rounding, depositor gets slightly fewer shares
        address user2 = address(0x5555555555555555555555555555555555555555);
        token.mint(user2, 100 ether);
        vm.startPrank(user2);
        token.approve(address(vault), type(uint256).max);
        uint256 sharesMinted = vault.depositERC20Tokens(100 ether);
        vm.stopPrank();

        // shares should be slightly less than 100_000 ether due to rounding
        assertLt(sharesMinted, 100 ether * OFFSET);
    }
}
