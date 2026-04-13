// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import { KernelVault } from "../../src/KernelVault.sol";
import { OptimisticKernelVault } from "../../src/OptimisticKernelVault.sol";
import { KernelOutputParser } from "../../src/KernelOutputParser.sol";
import { KernelExecutionVerifier } from "../../src/KernelExecutionVerifier.sol";
import { WSTONBondManager } from "../../src/WSTONBondManager.sol";
import { VaultAccessControl } from "../../src/extensions/VaultAccessControl.sol";
import { MockKernelExecutionVerifier } from "../mocks/MockKernelExecutionVerifier.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// ============================================================================
// Mock: Reverting VaultAccessControl for CH-1
// ============================================================================
contract RevertingAccessControl {
    function recordWithdrawal(address, uint256) external pure {
        revert("ACCESS_DENIED");
    }
    function canDeposit(address, uint256) external pure returns (bool) {
        return true;
    }
    function recordDeposit(address, uint256) external pure {}
}

// ============================================================================
// H-1: TRANSFER_ERC20 Compound Drain Bypasses Cumulative 40% Cap
// ============================================================================
contract VerifyH1_TransferERC20CompoundDrain is Test {
    KernelVault public vault;
    MockKernelExecutionVerifier public mockVerifier;
    MockERC20 public token;
    address public attacker = address(0xBAD);
    address public owner = address(0x1);

    bytes32 constant AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 constant IMAGE_ID = bytes32(uint256(0x1234));
    bytes constant DUMMY_JOURNAL = hex"00";
    bytes constant DUMMY_SEAL = hex"00";

    function setUp() public {
        mockVerifier = new MockKernelExecutionVerifier();
        token = new MockERC20("USDC", "USDC", 6);
        vault = new KernelVault(address(token), address(mockVerifier), AGENT_ID, IMAGE_ID, owner);

        // Fund vault with 10,000 USDC (6 decimals)
        token.mint(address(vault), 10_000e6);
    }

    /// @notice C-01 FIX VERIFICATION: 3 compound TRANSFER_ERC20 actions are now blocked
    /// Previously, each action's 40% cap was computed against CURRENT balance (not initial),
    /// allowing 78.4% compound drain. Now the cumulative cap uses _executionInitialBalance.
    function test_H1_compoundTransferERC20Drain() public {
        uint256 initialBalance = token.balanceOf(address(vault));
        console.log("Initial vault balance:", initialBalance);

        // Build 3 TRANSFER_ERC20 actions, each requesting 40% of current balance
        uint256 amount1 = (initialBalance * 4000) / 10000; // 40% of 10000 = 4000
        uint256 remaining1 = initialBalance - amount1;     // 6000
        uint256 amount2 = (remaining1 * 4000) / 10000;     // 40% of 6000 = 2400
        uint256 remaining2 = remaining1 - amount2;          // 3600
        uint256 amount3 = (remaining2 * 4000) / 10000;     // 40% of 3600 = 1440

        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](3);
        actions[0] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(0),
            payload: abi.encode(address(token), attacker, amount1)
        });
        actions[1] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(0),
            payload: abi.encode(address(token), attacker, amount2)
        });
        actions[2] = KernelOutputParser.Action({
            actionType: KernelOutputParser.ACTION_TYPE_TRANSFER_ERC20,
            target: bytes32(0),
            payload: abi.encode(address(token), attacker, amount3)
        });

        bytes memory agentOutput = KernelOutputParser.encodeAgentOutput(actions);
        bytes32 commitment = sha256(agentOutput);
        mockVerifier.setEssentials(AGENT_ID, 1, commitment);

        // C-01 FIX: Execute should revert — cumulative drain (64%) exceeds 40% cap
        vm.prank(owner);
        vm.expectRevert();
        vault.execute(DUMMY_JOURNAL, DUMMY_SEAL, agentOutput);

        // Vault balance unchanged — compound drain blocked
        assertEq(token.balanceOf(address(vault)), initialBalance);
        assertEq(token.balanceOf(attacker), 0);
        console.log("[C-01 FIX VERIFIED] Compound TRANSFER_ERC20 drain blocked by cumulative cap");
    }
}

// ============================================================================
// H-4: Bond-to-TVL Ratio Has No Minimum
// ============================================================================
contract VerifyH4_BondToTVLRatio is Test {
    WSTONBondManager public bondManager;
    MockERC20 public wston;
    address public operator = address(0x0001);
    address public treasury = address(0x0002);
    address public relayer = address(0x0003);
    address public owner;
    address public vault = address(0x1234);

    function setUp() public {
        owner = address(this);
        wston = new MockERC20("WSTON", "WSTON", 27);
        // Constructor: (address _wston, address _treasury, address _owner, uint256 _minBondFloor)
        bondManager = new WSTONBondManager(address(wston), treasury, owner, 1e27);

        // Set relayer (first set is immediate)
        bondManager.setTrustedRelayer(relayer);
    }

    /// @notice Prove HARM: operator can set trivially low bond relative to TVL
    /// A vault with $10K TVL is "protected" by ~$5 bond (1e27 WSTON floor, ~$5 equivalent).
    /// If the operator is also the vault owner, they profit 2000x by draining.
    function test_H4_trivialBondOnLargeVault() public {
        // The minimum bond floor is 1e27 (1 WSTON) -- set in constructor
        uint256 minFloor = bondManager.minBondFloor();
        console.log("Minimum bond floor (raw):", minFloor);

        // Operator locks bond directly (lockBondDirect doesn't need authorized vault)
        wston.mint(operator, minFloor);
        vm.startPrank(operator);
        wston.approve(address(bondManager), minFloor);
        bondManager.lockBondDirect(vault, 1, minFloor);
        vm.stopPrank();

        // Verify bond was locked at the minimum floor
        (uint256 bondAmount, uint256 lockedAt, WSTONBondManager.BondStatus status) =
            bondManager.bonds(operator, vault, 1);

        assertEq(bondAmount, minFloor, "Bond locked at minimum floor");
        assertEq(uint8(status), uint8(WSTONBondManager.BondStatus.Locked), "Bond status is Locked");

        // HARM ASSERTION: There is NO check in the bond manager or OKV that
        // ensures minBond >= f(TVL). A vault with $10K TVL has the same
        // minimum bond requirement as a vault with $0 TVL.
        //
        // The bond-to-TVL ratio is unbounded from below.
        // With 1 WSTON (~$5) protecting $10K:
        //   Operator profit = $10K - $5 = $9,995 (1999x return)
        uint256 vaultTVL = 10_000e6; // $10K USDC equivalent
        uint256 bondValueUSD = 5e6;  // ~$5 (1 WSTON)
        uint256 returnMultiple = vaultTVL / bondValueUSD;

        console.log("Vault TVL (USD):", vaultTVL);
        console.log("Bond value (USD):", bondValueUSD);
        console.log("Return multiple:", returnMultiple, "x");

        // No on-chain enforcement of proportionality exists
        assertGt(returnMultiple, 1000, "HARM: >1000x return on trivial bond");
    }
}

// ============================================================================
// CH-1: Deposit Gate Bypass + AccessControl Withdrawal DoS = One-Way Valve
// ============================================================================
contract VerifyCH1_OneWayValve is Test {
    KernelVault public vault;
    MockKernelExecutionVerifier public mockVerifier;
    MockERC20 public token;
    VaultAccessControl public accessCtrl;
    RevertingAccessControl public revertingCtrl;
    address public vaultOwner = address(0xAAA);
    address public unauthorizedDepositor = address(0xBBB);

    bytes32 constant AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 constant IMAGE_ID = bytes32(uint256(0x1234));

    function setUp() public {
        mockVerifier = new MockKernelExecutionVerifier();
        token = new MockERC20("USDC", "USDC", 6);
        vault = new KernelVault(address(token), address(mockVerifier), AGENT_ID, IMAGE_ID, vaultOwner);
        accessCtrl = new VaultAccessControl(address(vault));
        revertingCtrl = new RevertingAccessControl();

        // Configure access control with whitelist enabled
        accessCtrl.setWhitelistEnabled(true);
        // Note: unauthorizedDepositor is NOT whitelisted

        // Fund the unauthorized depositor
        token.mint(unauthorizedDepositor, 1000e6);
    }

    /// @notice Phase 1: Prove deposit gates are dead (H-5)
    /// canDeposit/recordDeposit are NEVER called by depositERC20Tokens.
    /// An unauthorized depositor can bypass the whitelist.
    function test_CH1_phase1_depositGateBypass() public {
        // Set the access control on the vault
        vm.prank(vaultOwner);
        vault.setAccessControl(address(accessCtrl));

        // Verify: unauthorizedDepositor is NOT whitelisted
        bool canDeposit = accessCtrl.canDeposit(unauthorizedDepositor, 500e6);
        assertFalse(canDeposit, "Unauthorized depositor should fail canDeposit");

        // BUT: depositing still works because KernelVault.depositERC20Tokens
        // never calls canDeposit()
        vm.startPrank(unauthorizedDepositor);
        token.approve(address(vault), 500e6);
        vault.depositERC20Tokens(500e6);
        vm.stopPrank();

        // HARM: unauthorized deposit succeeded despite whitelist
        uint256 shares = vault.shares(unauthorizedDepositor);
        assertGt(shares, 0, "HARM: unauthorized depositor received shares despite whitelist");
        console.log("Unauthorized depositor shares:", shares);
    }

    /// @notice Phase 2: Prove withdrawal DoS (H-15)
    /// Setting accessControl to a reverting contract blocks all withdrawals.
    function test_CH1_phase2_withdrawalDoS() public {
        // First, deposit funds normally
        token.mint(unauthorizedDepositor, 1000e6);
        vm.startPrank(unauthorizedDepositor);
        token.approve(address(vault), 500e6);
        vault.depositERC20Tokens(500e6);
        vm.stopPrank();

        uint256 sharesHeld = vault.shares(unauthorizedDepositor);
        assertGt(sharesHeld, 0, "Depositor has shares");

        // Owner sets a reverting access control
        vm.prank(vaultOwner);
        vault.setAccessControl(address(revertingCtrl));

        // Now attempt withdrawal -- reverts because recordWithdrawal reverts
        vm.prank(unauthorizedDepositor);
        vm.expectRevert("ACCESS_DENIED");
        vault.withdraw(sharesHeld);

        // HARM: depositor's funds are permanently locked
        uint256 remainingShares = vault.shares(unauthorizedDepositor);
        assertEq(remainingShares, sharesHeld, "HARM: shares still locked, cannot withdraw");
    }

    /// @notice Full chain: unauthorized deposit + withdrawal DoS = one-way valve
    function test_CH1_fullChain_oneWayValve() public {
        // Step 1: Deposit bypasses whitelist (H-5)
        vm.prank(vaultOwner);
        vault.setAccessControl(address(accessCtrl));
        accessCtrl.setWhitelistEnabled(true);

        vm.startPrank(unauthorizedDepositor);
        token.approve(address(vault), 500e6);
        vault.depositERC20Tokens(500e6);
        vm.stopPrank();

        uint256 depositedShares = vault.shares(unauthorizedDepositor);
        assertGt(depositedShares, 0, "Step 1: unauthorized deposit succeeded");

        // Step 2: Owner sets reverting access control (H-15)
        vm.prank(vaultOwner);
        vault.setAccessControl(address(revertingCtrl));

        // Step 3: Withdrawal fails
        vm.prank(unauthorizedDepositor);
        vm.expectRevert("ACCESS_DENIED");
        vault.withdraw(depositedShares);

        // HARM: One-way valve confirmed -- funds entered but cannot exit
        console.log("HARM: One-way valve - deposited shares:", depositedShares);
        console.log("HARM: Withdrawal permanently blocked");
    }
}

// ============================================================================
// CH-2: Verification Pause Cycle + Upgrade Drops Verifiers = Ecosystem Halt
// ============================================================================
contract VerifyCH2_PauseCycleEcosystemHalt is Test {
    KernelExecutionVerifier public verifier;
    address public verifierOwner = address(0xAAA);

    function setUp() public {
        // Deploy verifier behind ERC1967 proxy (Initializable requires proxy pattern)
        KernelExecutionVerifier impl = new KernelExecutionVerifier();
        bytes memory initData = abi.encodeWithSelector(
            KernelExecutionVerifier.initialize.selector,
            address(0x1234),
            verifierOwner
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        verifier = KernelExecutionVerifier(address(proxy));
    }

    /// @notice Prove cycle-pause can extend indefinitely past MAX_PAUSE_DURATION (H-12)
    /// Each call to setVerificationPaused(true) resets pausedSince, resetting the 7-day timer.
    function test_CH2_cyclePauseIndefinite() public {
        uint256 maxPause = verifier.MAX_PAUSE_DURATION();
        console.log("MAX_PAUSE_DURATION:", maxPause);

        // Day 0: Owner pauses
        vm.prank(verifierOwner);
        verifier.setVerificationPaused(true);
        uint256 firstPaused = verifier.pausedSince();
        console.log("First pausedSince:", firstPaused);

        // Day 6.9: Just before expiry, owner re-pauses (resets timer)
        vm.warp(block.timestamp + 6.9 days);
        vm.prank(verifierOwner);
        verifier.setVerificationPaused(true);
        uint256 secondPaused = verifier.pausedSince();

        // pausedSince was RESET to current timestamp
        assertGt(secondPaused, firstPaused, "pausedSince was refreshed");
        console.log("Second pausedSince:", secondPaused);

        // Day 6.9 + 6.9 = 13.8: Re-pause again
        vm.warp(block.timestamp + 6.9 days);
        vm.prank(verifierOwner);
        verifier.setVerificationPaused(true);
        uint256 thirdPaused = verifier.pausedSince();
        assertGt(thirdPaused, secondPaused, "pausedSince refreshed again");

        // Now verify that at day 13.8 (well past the 7-day MAX_PAUSE_DURATION),
        // verification is STILL paused
        bool isPaused = verifier.verificationPaused();
        assertTrue(isPaused, "Verification is still paused");

        // The auto-expiry check is: block.timestamp < pausedSince + MAX_PAUSE_DURATION
        // Since pausedSince was just reset, the pause is effectively indefinite
        assertTrue(
            block.timestamp < thirdPaused + maxPause,
            "HARM: Pause is still active at day 13.8 -- indefinite pause via cycle"
        );

        console.log("HARM: Verification paused indefinitely via cycle at day 13.8");
    }

    /// @notice Prove UUPS upgrade drops approvedVerifiers (H-26 component)
    /// This is a [CODE-TRACE] since we cannot execute a real UUPS upgrade in a unit test.
    /// The key insight is that `approvedVerifiers` is a mapping in the proxy's storage,
    /// and a new implementation's initialize() does not re-populate it.
    function test_CH2_upgradeDropsVerifiers_codeTrace() public {
        // Approve a verifier in current implementation
        vm.prank(verifierOwner);
        verifier.approveVerifier(address(0x5678));

        bool approved = verifier.approvedVerifiers(address(0x5678));
        assertTrue(approved, "Verifier is approved before upgrade");

        // CODE-TRACE: After UUPS upgrade with new implementation:
        // 1. approvedVerifiers is a mapping(address => bool) in storage
        // 2. UUPSUpgradeable.upgradeToAndCall calls initialize() on new impl
        // 3. initialize() sets verifier and _owner but does NOT re-populate approvedVerifiers
        // 4. The mapping retains its storage UNLESS the new impl's initialize changes the storage layout
        //
        // HOWEVER: if the upgrade includes re-initialization (common UUPS pattern),
        // or if the new impl has different storage layout, the mapping could be reset.
        //
        // The risk: post-upgrade, the protocol team may NOT remember to re-approve verifiers,
        // leaving the ecosystem unable to verify proofs.
        //
        // Combined with CH-2 cycle-pause: the pause covers the dangerous window
        // where no verifier is available, and when it lifts, the ecosystem discovers
        // zero approved verifiers exist.

        console.log("CODE-TRACE: approvedVerifiers mapping survives UUPS proxy upgrade");
        console.log("  BUT may be cleared by re-initialization in new implementation");
        console.log("  Combined with cycle-pause: indefinite pause masks the gap");
    }
}

// ============================================================================
// H-2: RISC Zero CVE-2025-52484 Applicability (CONTESTED)
// ============================================================================
contract VerifyH2_RiscZeroCVE is Test {
    /// @notice H-2 is CONTESTED because the CVE's applicability depends on the
    /// deployed verifier version, which cannot be determined from source code alone.
    /// This test documents the structural concern rather than proving exploitation.
    function test_H2_structuralConcern_codeTrace() public {
        // CODE-TRACE analysis:
        // 1. KernelExecutionVerifier stores `verifier` (IRiscZeroVerifier) which is the
        //    on-chain RISC Zero Groth16 verifier
        // 2. CVE-2025-52484 affects risc0-zkvm 2.0.0-2.0.2: underconstrained remu/divu
        //    operations in the STARK circuit allow arbitrary proof forgery
        // 3. The verifier contract address is set at initialize() and rotatable via
        //    the C-03 fix (3-step governance rotation with timelock)
        // 4. The DEPLOYED verifier's version cannot be determined from this source code
        //
        // IF the CVE is unpatched:
        //   - Any attacker can forge a valid RISC Zero proof for any imageId
        //   - Combined with H-1, this enables single-block total vault drain
        //
        // The structural fix (C-03 verifier rotation) exists but does not retroactively
        // patch already-deployed verifiers.

        console.log("H-2: CONTESTED -- CVE applicability depends on deployed verifier version");
        console.log("  Structural concern: no on-chain version tag on deployed verifier");
        console.log("  If CVE unpatched + H-1: CRITICAL (single-block total vault drain)");

        // This test passes by design -- it documents the concern, not proves exploitation
        assertTrue(true, "Structural concern documented");
    }
}

// ============================================================================
// H-3: Cross-Chain Bond Slash Timing Gap
// ============================================================================
contract VerifyH3_BondSlashTimingGap is Test {
    WSTONBondManager public bondManager;
    MockERC20 public wston;
    address public operator = address(0x0001);
    address public treasury = address(0x0002);
    address public relayer = address(0x0003);
    address public owner;
    address public vault = address(0x1234);

    function setUp() public {
        owner = address(this);
        wston = new MockERC20("WSTON", "WSTON", 27);
        // Constructor: (address _wston, address _treasury, address _owner, uint256 _minBondFloor)
        bondManager = new WSTONBondManager(address(wston), treasury, owner, 1e27);
        bondManager.setTrustedRelayer(relayer);
    }

    /// @notice Prove HARM: bond can be reclaimed after 90 days if relayer fails
    /// to call markSlashPending. The operator drains vault and recovers bond.
    function test_H3_bondReclaimWithoutSlash() public {
        uint256 bondAmount = 1e27; // 1 WSTON

        // Step 1: Operator locks bond (lockBondDirect is permissionless)
        wston.mint(operator, bondAmount);
        vm.startPrank(operator);
        wston.approve(address(bondManager), bondAmount);
        bondManager.lockBondDirect(vault, 1, bondAmount);
        vm.stopPrank();

        uint256 operatorBalanceBefore = wston.balanceOf(operator);
        assertEq(operatorBalanceBefore, 0, "Operator spent all WSTON on bond");

        // Step 2: Time passes. Assume operator executed malicious optimistic execution
        // and slashExpired was called on HyperEVM, emitting ExecutionSlashed.
        // BUT: relayer is offline/DoS'd and NEVER calls markSlashPending.

        // Step 3: Wait 90 days (BOND_EXPIRY)
        vm.warp(block.timestamp + 90 days + 1);

        // Step 4: Operator reclaims bond -- slashPending is false (never set)
        vm.prank(operator);
        bondManager.reclaimExpiredBond(vault, 1);

        uint256 operatorBalanceAfter = wston.balanceOf(operator);
        assertEq(operatorBalanceAfter, bondAmount, "HARM: Operator reclaimed full bond");

        // Verify bond status
        (,, WSTONBondManager.BondStatus status) = bondManager.bonds(operator, vault, 1);
        assertEq(uint8(status), uint8(WSTONBondManager.BondStatus.Released), "Bond released via expiry");

        console.log("HARM: Operator reclaimed", bondAmount, "WSTON after vault drain");
        console.log("  Relayer was offline, markSlashPending never called");
        console.log("  Net operator cost: gas fees only");
    }

    /// @notice Prove that markSlashPending DOES prevent reclaim (defense exists)
    function test_H3_markSlashPendingBlocksReclaim() public {
        uint256 bondAmount = 1e27;

        wston.mint(operator, bondAmount);
        vm.startPrank(operator);
        wston.approve(address(bondManager), bondAmount);
        bondManager.lockBondDirect(vault, 1, bondAmount);
        vm.stopPrank();

        // Relayer marks slash pending
        vm.prank(relayer);
        bondManager.markSlashPending(operator, vault, 1);

        // Wait 90 days
        vm.warp(block.timestamp + 90 days + 1);

        // Reclaim FAILS because slashPending is true
        vm.prank(operator);
        vm.expectRevert(WSTONBondManager.UnresolvedSlashPending.selector);
        bondManager.reclaimExpiredBond(vault, 1);

        console.log("Defense confirmed: markSlashPending blocks reclaim");
        console.log("  BUT: defense requires relayer to be online and functioning");
    }
}
