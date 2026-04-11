// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { KernelVault } from "../src/KernelVault.sol";
import { KernelOutputParser } from "../src/KernelOutputParser.sol";
import { MockKernelExecutionVerifier } from "./mocks/MockKernelExecutionVerifier.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

// ============================================================================
// Formal Verification of PPS (Price-Per-Share) Math in KernelVault
// ============================================================================
//
// The vault uses an ERC4626-style virtual offset formula:
//
//   _DECIMALS_OFFSET = 1e3
//
//   deposit:   shares = assets * (totalShares + 1e3) / (effectiveAssets + 1)
//   withdraw:  assets = shares * (effectiveAssets + 1) / (totalShares + 1e3)
//   pps:       effectiveTotalAssets * 1e18 / totalShares   (0 shares => 1e18)
//
// The offset creates "virtual" shares and assets that prevent the classic
// ERC4626 inflation/donation attack vector.
// ============================================================================

/// @title PPSInvariantsTest
/// @notice Comprehensive fuzz + invariant tests for KernelVault PPS math
contract PPSInvariantsTest is Test {
    KernelVault public vault;
    MockKernelExecutionVerifier public mockVerifier;
    MockERC20 public token;

    address public vaultOwner = address(0xAAAA);
    address public alice = address(0x1111);
    address public bob = address(0x2222);
    address public charlie = address(0x3333);
    address public feeRecipient = address(0x4444);
    address public protocolTreasury = address(0x5555);
    address public attacker = address(0x6666);

    bytes32 public constant AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant IMAGE_ID = bytes32(uint256(0x1234));

    uint256 internal constant OFFSET = 1e3;

    function setUp() public {
        mockVerifier = new MockKernelExecutionVerifier();
        token = new MockERC20("Test Token", "TEST", 18);

        vault = new KernelVault(
            address(token),
            address(mockVerifier),
            AGENT_ID,
            IMAGE_ID,
            vaultOwner
        );

        // Give everyone unlimited approval
        for (uint256 i = 0; i < 4; i++) {
            address user = [alice, bob, charlie, attacker][i];
            vm.prank(user);
            token.approve(address(vault), type(uint256).max);
        }
    }

    // ========================================================================
    // Helper functions
    // ========================================================================

    function _deposit(address user, uint256 amount) internal returns (uint256 sharesMinted) {
        token.mint(user, amount);
        vm.prank(user);
        sharesMinted = vault.depositERC20Tokens(amount);
    }

    function _withdraw(address user, uint256 shareAmount) internal returns (uint256 assetsOut) {
        vm.prank(user);
        assetsOut = vault.withdraw(shareAmount);
    }

    function _setupFees(uint256 mgmtBps, uint256 perfBps) internal {
        vm.startPrank(vaultOwner);
        vault.setFeeRecipient(feeRecipient);
        vault.setProtocolTreasury(protocolTreasury, 1000); // 10% protocol split
        vault.setFees(mgmtBps, perfBps);
        vm.stopPrank();
    }

    /// @notice Build a properly-encoded AgentOutput for a TRANSFER_ERC20 action
    /// @dev Uses the KernelOutputParser.encodeAgentOutput helper via the library's wire format:
    ///      [action_count: u32 LE][action_len: u32 LE][action_type: u32 LE][target: bytes32][payload_len: u32 LE][payload]
    function _buildTransferOutput(
        address tokenAddr,
        address to,
        uint256 amount
    ) internal pure returns (bytes memory) {
        bytes memory payload = abi.encode(tokenAddr, to, amount);
        KernelOutputParser.Action[] memory actions = new KernelOutputParser.Action[](1);
        actions[0] = KernelOutputParser.Action({
            actionType: 0x00000003, // ACTION_TYPE_TRANSFER_ERC20
            target: bytes32(uint256(uint160(tokenAddr))),
            payload: payload
        });
        return KernelOutputParser.encodeAgentOutput(actions);
    }

    // ========================================================================
    // INVARIANT 1: No Inflation Attack
    // ========================================================================
    // A small first depositor cannot manipulate PPS to steal from subsequent
    // depositors. With the virtual offset, even a 1 wei deposit works correctly.
    // The OFFSET=1e3 bounds the attacker's advantage: for a donation D and
    // victim deposit V, the victim loses at most D / (D + OFFSET * V).
    // ========================================================================

    /// @notice Fuzz test: first depositor deposits small amount, attacker donates
    /// large amount directly, second depositor should not lose significant value.
    /// The maximum loss for the victim is bounded by:
    ///   loss_fraction <= donation / (OFFSET * secondDeposit)
    /// So for secondDeposit >> donation / OFFSET, the loss is negligible.
    function testFuzz_noInflationAttack(
        uint256 firstDeposit,
        uint256 donation,
        uint256 secondDeposit
    ) public {
        firstDeposit = bound(firstDeposit, 1, 1e24);
        donation = bound(donation, 1, 1e24);
        // Ensure secondDeposit is large enough relative to donation so loss < 5%
        // loss ~ donation / (OFFSET * secondDeposit), so secondDeposit > donation / (OFFSET * 0.05)
        // = donation * 20 / OFFSET = donation / 50
        uint256 minSecondDeposit = donation / 50 + OFFSET;
        secondDeposit = bound(secondDeposit, minSecondDeposit, 1e24 + minSecondDeposit);

        // First depositor deposits
        _deposit(alice, firstDeposit);

        // Attacker donates tokens directly to vault (not via deposit)
        token.mint(address(vault), donation);

        // Second depositor deposits
        uint256 shares2 = _deposit(bob, secondDeposit);

        // Second depositor should be able to get back a non-trivial portion.
        // With OFFSET=1e3 the maximum attacker advantage is bounded.
        uint256 bobAssets = vault.convertToAssets(shares2);

        // Bob should get back >= 95% of deposit given our bounds
        assertGe(
            bobAssets,
            secondDeposit * 95 / 100,
            "Inflation attack: second depositor lost >5% of deposit"
        );

        // Always verify: bob received some shares
        assertGt(shares2, 0, "Second depositor received zero shares");
    }

    /// @notice Classic inflation attack: deposit 1 wei, donate large amount, 2nd depositor gets 0 shares.
    /// With OFFSET=1e3, the victim needs to deposit more than donation/OFFSET to get shares.
    /// We verify that for reasonable victim deposit amounts, shares are always minted.
    function testFuzz_classicInflationAttackPrevented(uint256 donation) public {
        donation = bound(donation, 1e18, 1e30);

        // Attacker deposits 1 wei
        _deposit(attacker, 1);

        // Attacker donates large amount directly to vault
        token.mint(address(vault), donation);

        // Victim deposits an amount equal to donation (same scale) -- should always get shares
        uint256 victimDeposit = donation;
        uint256 victimShares = _deposit(alice, victimDeposit);

        // With virtual offset, victim always gets shares when deposit >= donation
        assertGt(victimShares, 0, "Victim got zero shares in inflation attack");

        // Victim's shares should be worth a meaningful portion of their deposit
        uint256 victimAssets = vault.convertToAssets(victimShares);
        assertGe(
            victimAssets,
            victimDeposit * 49 / 100,
            "Victim shares worth less than 49% of deposit"
        );
    }

    // ========================================================================
    // INVARIANT 2: Deposit-Withdraw Roundtrip
    // ========================================================================
    // For any single depositor in isolation (no fees, no strategy),
    // depositing X assets and immediately withdrawing all shares should
    // return at least X-1 assets (allowing 1 wei rounding).
    // ========================================================================

    /// @notice Fuzz: deposit then immediately withdraw should return ~same amount
    function testFuzz_depositWithdrawRoundtrip(uint256 depositAmount) public {
        depositAmount = bound(depositAmount, 2, 1e36);

        uint256 sharesMinted = _deposit(alice, depositAmount);
        uint256 assetsOut = _withdraw(alice, sharesMinted);

        // Should get back at least depositAmount - 1 (rounding tolerance)
        assertGe(
            assetsOut,
            depositAmount - 1,
            "Roundtrip lost more than 1 wei"
        );

        // Should not get more than deposited (no free value creation)
        assertLe(
            assetsOut,
            depositAmount,
            "Roundtrip returned more than deposited"
        );
    }

    /// @notice Fuzz: roundtrip with prior depositor in the vault
    function testFuzz_depositWithdrawRoundtripWithExistingDepositor(
        uint256 existingDeposit,
        uint256 newDeposit
    ) public {
        existingDeposit = bound(existingDeposit, 1, 1e30);
        newDeposit = bound(newDeposit, 2, 1e30);

        // Existing depositor
        _deposit(alice, existingDeposit);

        // New depositor roundtrip
        uint256 sharesMinted = _deposit(bob, newDeposit);
        uint256 assetsOut = _withdraw(bob, sharesMinted);

        // Bob should get back at least newDeposit - 1
        assertGe(
            assetsOut,
            newDeposit - 1,
            "Roundtrip with existing depositor lost more than 1 wei"
        );

        // Bob should not extract more than deposited
        assertLe(
            assetsOut,
            newDeposit,
            "Roundtrip extracted more value than deposited"
        );
    }

    // ========================================================================
    // INVARIANT 3: PPS Monotonicity on Deposit
    // ========================================================================
    // A deposit of positive assets must not decrease the PPS for existing
    // holders (no dilution beyond rounding).
    // ========================================================================

    /// @notice Fuzz: PPS should not decrease after a deposit
    function testFuzz_ppsMonotonicOnDeposit(
        uint256 initialDeposit,
        uint256 newDeposit
    ) public {
        initialDeposit = bound(initialDeposit, 1, 1e30);
        newDeposit = bound(newDeposit, 1, 1e30);

        _deposit(alice, initialDeposit);

        uint256 ppsBefore = vault.currentPps();

        _deposit(bob, newDeposit);

        uint256 ppsAfter = vault.currentPps();

        // PPS must not decrease (1 wei tolerance for rounding)
        assertGe(
            ppsAfter + 1,
            ppsBefore,
            "PPS decreased after deposit (dilution attack)"
        );
    }

    /// @notice Fuzz: multiple sequential deposits should not decrease PPS
    function testFuzz_ppsMonotonicOnMultipleDeposits(
        uint256 dep1,
        uint256 dep2,
        uint256 dep3
    ) public {
        dep1 = bound(dep1, 1, 1e28);
        dep2 = bound(dep2, 1, 1e28);
        dep3 = bound(dep3, 1, 1e28);

        _deposit(alice, dep1);
        uint256 pps1 = vault.currentPps();

        _deposit(bob, dep2);
        uint256 pps2 = vault.currentPps();

        _deposit(charlie, dep3);
        uint256 pps3 = vault.currentPps();

        // Each PPS should be >= previous (with 1 wei tolerance)
        assertGe(pps2 + 1, pps1, "PPS decreased after second deposit");
        assertGe(pps3 + 1, pps2, "PPS decreased after third deposit");
    }

    // ========================================================================
    // INVARIANT 4: PPS Monotonicity on Withdraw
    // ========================================================================
    // A withdrawal must not increase the PPS for remaining holders beyond
    // rounding (no value extraction by withdrawing).
    // ========================================================================

    /// @notice Fuzz: PPS should not increase significantly after a withdrawal.
    /// @dev ERC4626-style vaults round DOWN on withdrawal (favoring the vault),
    ///      which means a tiny amount of "dust" stays in the vault, slightly
    ///      increasing PPS for remaining holders. This is by design and prevents
    ///      value extraction. We verify the increase is bounded to rounding dust only.
    function testFuzz_ppsMonotonicOnWithdraw(
        uint256 deposit1,
        uint256 deposit2,
        uint256 withdrawFraction
    ) public {
        deposit1 = bound(deposit1, 1e6, 1e30);
        deposit2 = bound(deposit2, 1e6, 1e30);
        withdrawFraction = bound(withdrawFraction, 1, 100);

        _deposit(alice, deposit1);
        uint256 bobShares = _deposit(bob, deposit2);

        uint256 ppsBefore = vault.currentPps();

        // Bob withdraws a fraction of shares
        uint256 sharesToWithdraw = bobShares * withdrawFraction / 100;
        if (sharesToWithdraw == 0) sharesToWithdraw = 1;
        if (sharesToWithdraw > bobShares) sharesToWithdraw = bobShares;

        _withdraw(bob, sharesToWithdraw);

        uint256 ppsAfter = vault.currentPps();
        uint256 remainingShares = vault.totalShares();

        // PPS can increase slightly due to rounding dust staying in the vault.
        // The maximum increase is bounded by 1 asset unit (the rounding error)
        // spread over all remaining shares: maxIncrease = 1e18 / remainingShares
        // We use a generous tolerance: PPS increase <= 1 basis point (0.01%)
        if (ppsAfter > ppsBefore) {
            uint256 increaseBps = (ppsAfter - ppsBefore) * 10000 / ppsBefore;
            assertLe(
                increaseBps,
                1, // At most 1 basis point increase from rounding
                "PPS increased more than 1 bps after withdrawal (value extraction)"
            );
        }
    }

    // ========================================================================
    // INVARIANT 5: Share Fairness
    // ========================================================================
    // Two depositors depositing the same amount at the same PPS should
    // receive the same number of shares (within 1 wei).
    // ========================================================================

    /// @notice Fuzz: equal deposits at same PPS yield equal shares
    function testFuzz_shareFairness(uint256 amount) public {
        amount = bound(amount, 1, 1e30);

        uint256 sharesAlice = _deposit(alice, amount);
        uint256 sharesBob = _deposit(bob, amount);

        // Shares should be equal or differ by at most 1
        if (sharesAlice > sharesBob) {
            assertLe(
                sharesAlice - sharesBob,
                1,
                "Share fairness violated: alice got significantly more"
            );
        } else {
            assertLe(
                sharesBob - sharesAlice,
                1,
                "Share fairness violated: bob got significantly more"
            );
        }
    }

    /// @notice Fuzz: depositing double the amount yields double the shares (within rounding)
    function testFuzz_shareProportionality(uint256 baseAmount) public {
        baseAmount = bound(baseAmount, 1, 1e28);
        uint256 doubleAmount = baseAmount * 2;

        uint256 sharesAlice = _deposit(alice, baseAmount);
        uint256 sharesBob = _deposit(bob, doubleAmount);

        // Bob's shares should be approximately 2x Alice's shares
        // Allow 2 shares of rounding tolerance
        uint256 expectedBobShares = sharesAlice * 2;
        if (sharesBob > expectedBobShares) {
            assertLe(
                sharesBob - expectedBobShares,
                2,
                "Proportionality: bob got disproportionately more"
            );
        } else {
            assertLe(
                expectedBobShares - sharesBob,
                2,
                "Proportionality: bob got disproportionately fewer"
            );
        }
    }

    // ========================================================================
    // INVARIANT 6: Fee Dilution Bounded
    // ========================================================================
    // Management fees over time should dilute PPS by at most managementFeeBps
    // per year. Performance fees should only be charged above the high water mark.
    // ========================================================================

    /// @notice Fuzz: management fee dilution bounded by annual rate
    function testFuzz_managementFeeDilutionBounded(
        uint256 depositAmount,
        uint256 mgmtBps,
        uint256 timeElapsed
    ) public {
        depositAmount = bound(depositAmount, 1e18, 1e30);
        mgmtBps = bound(mgmtBps, 1, 500); // 0.01% to 5%
        timeElapsed = bound(timeElapsed, 1 hours, 365 days);

        _setupFees(mgmtBps, 0);
        _deposit(alice, depositAmount);

        uint256 ppsBefore = vault.currentPps();

        // Advance time
        vm.warp(block.timestamp + timeElapsed);

        // Collect management fee
        vault.collectManagementFee();

        uint256 ppsAfter = vault.currentPps();

        // PPS should decrease (fee dilution)
        assertLe(ppsAfter, ppsBefore, "PPS should not increase from fee collection alone");

        // The dilution should be bounded by mgmtBps * timeElapsed / 365 days
        // Using wider bound to account for rounding: allow 2x the theoretical max
        uint256 maxDilutionBps = mgmtBps * timeElapsed / 365 days;
        uint256 actualDilutionBps;
        if (ppsBefore > ppsAfter) {
            actualDilutionBps = (ppsBefore - ppsAfter) * 10000 / ppsBefore;
        }

        assertLe(
            actualDilutionBps,
            maxDilutionBps + 1, // +1 for rounding
            "Management fee dilution exceeds annual rate"
        );
    }

    /// @notice Performance fee should only collect above high water mark
    function testFuzz_performanceFeeOnlyAboveHWM(
        uint256 depositAmount,
        uint256 perfBps,
        uint256 donationPct
    ) public {
        depositAmount = bound(depositAmount, 1e18, 1e28);
        perfBps = bound(perfBps, 100, 5000); // At least 1% to ensure feeShares > 0
        // Donation must be large enough relative to deposit to produce non-zero profitBps
        // profitBps = donation * 1e18 / (depositAmount * 1e3) * 10000 / hwm
        // We ensure donation >= 1% of deposit so profitBps >= 100
        donationPct = bound(donationPct, 1, 100); // 1% to 100% of deposit
        uint256 donationAmount = depositAmount * donationPct / 100;
        // Ensure donation is at least 1e15 for meaningful fee shares
        vm.assume(donationAmount >= 1e15);

        _setupFees(0, perfBps);
        _deposit(alice, depositAmount);

        uint256 hwmBefore = vault.highWaterMark();

        // No donation => no profit => no fee
        uint256 feeShares = vault.collectPerformanceFee();
        assertEq(feeShares, 0, "Performance fee collected without profit");

        // Now simulate profit by donating tokens to vault
        token.mint(address(vault), donationAmount);

        uint256 ppsBeforeFee = vault.currentPps();
        assertGt(ppsBeforeFee, hwmBefore, "PPS should be above HWM after donation");

        // Collect performance fee
        feeShares = vault.collectPerformanceFee();
        assertGt(feeShares, 0, "Performance fee should be collected on profit");

        // HWM should be updated to the PPS before dilution
        uint256 hwmAfter = vault.highWaterMark();
        assertGe(hwmAfter, hwmBefore, "HWM should not decrease");
    }

    // ========================================================================
    // INVARIANT 7: Zero Share Protection
    // ========================================================================
    // When totalShares is 0, the first deposit should work correctly and
    // not revert (except for ZeroShares on dust amounts).
    // ========================================================================

    /// @notice Fuzz: first deposit always works for non-dust amounts
    function testFuzz_firstDepositWorks(uint256 amount) public {
        amount = bound(amount, 1, 1e36);

        assertEq(vault.totalShares(), 0, "Pre-condition: total shares should be 0");

        uint256 sharesMinted = _deposit(alice, amount);

        // For first deposit: shares = amount * (0 + 1e3) / (0 + 1) = amount * 1000
        assertEq(sharesMinted, amount * OFFSET, "First deposit should mint amount * OFFSET shares");
        assertGt(vault.totalShares(), 0, "Total shares should be > 0 after first deposit");
    }

    /// @notice PPS returns 1e18 when totalShares is 0
    function test_ppsReturns1e18WhenNoShares() public view {
        assertEq(vault.totalShares(), 0);
        assertEq(vault.currentPps(), 1e18, "PPS should be 1e18 when no shares exist");
    }

    /// @notice PPS is 1e15 after any first deposit (virtual offset effect)
    function testFuzz_ppsAfterFirstDeposit(uint256 amount) public {
        amount = bound(amount, 1e6, 1e30);

        _deposit(alice, amount);

        uint256 pps = vault.currentPps();

        // PPS after first deposit:
        // effectiveTotalAssets = amount, totalShares = amount * 1000
        // PPS = amount * 1e18 / (amount * 1000) = 1e18 / 1000 = 1e15
        assertEq(pps, 1e15, "First deposit PPS should be 1e15");
    }

    // ========================================================================
    // INVARIANT 8: No Share Over-Burn
    // ========================================================================
    // Withdrawing all shares should result in totalShares == 0 for the user.
    // ========================================================================

    /// @notice Fuzz: withdrawing all shares leaves user with 0 shares
    function testFuzz_noShareOverBurn(uint256 depositAmount) public {
        depositAmount = bound(depositAmount, 2, 1e30);

        uint256 sharesMinted = _deposit(alice, depositAmount);

        assertEq(vault.shares(alice), sharesMinted, "Shares mismatch after deposit");

        _withdraw(alice, sharesMinted);

        assertEq(vault.shares(alice), 0, "User should have 0 shares after full withdrawal");
        assertEq(vault.totalShares(), 0, "Total shares should be 0 when sole depositor withdraws all");
    }

    /// @notice Fuzz: partial withdrawal does not over-burn
    function testFuzz_partialWithdrawNoOverBurn(
        uint256 depositAmount,
        uint256 withdrawPct
    ) public {
        depositAmount = bound(depositAmount, 1e6, 1e30);
        withdrawPct = bound(withdrawPct, 1, 99);

        uint256 sharesMinted = _deposit(alice, depositAmount);
        uint256 sharesToWithdraw = sharesMinted * withdrawPct / 100;
        if (sharesToWithdraw == 0) sharesToWithdraw = 1;

        _withdraw(alice, sharesToWithdraw);

        uint256 expectedRemaining = sharesMinted - sharesToWithdraw;
        assertEq(
            vault.shares(alice),
            expectedRemaining,
            "Share balance incorrect after partial withdrawal"
        );
    }

    /// @notice Cannot withdraw more shares than you have
    function testFuzz_cannotOverWithdraw(uint256 depositAmount, uint256 extraShares) public {
        depositAmount = bound(depositAmount, 1, 1e30);
        extraShares = bound(extraShares, 1, 1e30);

        uint256 sharesMinted = _deposit(alice, depositAmount);

        vm.expectRevert(
            abi.encodeWithSelector(
                KernelVault.InsufficientShares.selector,
                sharesMinted + extraShares,
                sharesMinted
            )
        );
        vm.prank(alice);
        vault.withdraw(sharesMinted + extraShares);
    }

    // ========================================================================
    // INVARIANT 9: Strategy Snapshot Integrity
    // ========================================================================
    // During active strategy, effectiveTotalAssets returns snapshot value,
    // not live balance. PPS should not change due to external balance changes.
    // ========================================================================

    /// @notice When strategy is not active, effectiveTotalAssets == totalAssets
    function testFuzz_effectiveAssetsEqualsLiveWhenNoStrategy(uint256 amount) public {
        amount = bound(amount, 1, 1e30);

        _deposit(alice, amount);

        assertFalse(vault.strategyActive(), "Strategy should not be active");
        assertEq(
            vault.effectiveTotalAssets(),
            vault.totalAssets(),
            "effectiveTotalAssets should equal totalAssets when no strategy"
        );
    }

    /// @notice During strategy, PPS is frozen to snapshot -- verified by checking that
    /// a direct donation changes totalAssets but NOT effectiveTotalAssets when no strategy
    function test_donationChangesPPSWithoutStrategy() public {
        _deposit(alice, 100 ether);

        uint256 ppsBefore = vault.currentPps();

        // Donate tokens directly to vault
        token.mint(address(vault), 50 ether);

        // Without strategy, PPS changes due to donation
        uint256 ppsAfterDonation = vault.currentPps();
        assertGt(
            ppsAfterDonation,
            ppsBefore,
            "PPS should increase after direct donation when no strategy"
        );
    }

    /// @notice Strategy activation freezes PPS (deposits blocked, PPS uses snapshot)
    function test_depositsBlockedDuringStrategy() public {
        _deposit(alice, 100 ether);

        // Build a proper transfer output using the parser's encoding
        bytes memory agentOutput = _buildTransferOutput(
            address(token),
            bob,
            10 ether
        );
        bytes32 actionCommitment = sha256(agentOutput);

        mockVerifier.setEssentials(AGENT_ID, 1, actionCommitment);

        vm.prank(vaultOwner);
        vault.execute(new bytes(209), new bytes(0), agentOutput);

        assertTrue(vault.strategyActive(), "Strategy should be active after outgoing transfer");

        // PPS should use snapshot, not live balance
        uint256 snapshotAssets = vault.snapshotTotalAssets();
        assertEq(
            vault.effectiveTotalAssets(),
            snapshotAssets,
            "effectiveTotalAssets should return snapshot during strategy"
        );

        // Try to deposit during active strategy -- should revert
        token.mint(attacker, 50 ether);
        vm.prank(attacker);
        vm.expectRevert(KernelVault.DepositsLockedDuringStrategy.selector);
        vault.depositERC20Tokens(50 ether);
    }

    // ========================================================================
    // INVARIANT 10: Emergency Withdrawal Fairness
    // ========================================================================
    // Emergency withdraw should use the same PPS formula as normal withdraw.
    // ========================================================================

    /// @notice Emergency withdraw uses same formula as normal withdraw
    function testFuzz_emergencyWithdrawSameFormula(
        uint256 depositAmount
    ) public {
        depositAmount = bound(depositAmount, 1e6, 1e30);

        // Two users deposit equal amounts
        uint256 aliceShares = _deposit(alice, depositAmount);
        _deposit(bob, depositAmount);

        // Calculate expected assets for alice via convertToAssets
        uint256 expectedAliceAssets = vault.convertToAssets(aliceShares);

        // Pause the vault and wait for emergency delay
        vm.prank(vaultOwner);
        vault.pause();
        vm.warp(block.timestamp + 14 days + 1);

        // Alice does emergency withdraw
        vm.prank(alice);
        uint256 aliceAssetsOut = vault.emergencyWithdraw(aliceShares);

        // The assets out should match what convertToAssets predicted
        assertEq(
            aliceAssetsOut,
            expectedAliceAssets,
            "Emergency withdraw should match convertToAssets"
        );
    }

    // ========================================================================
    // ATTACK SCENARIO 1: Donation Attack
    // ========================================================================
    // Attacker sends tokens directly to vault (not via deposit) to inflate
    // PPS, then first depositor gets fewer shares.
    // ========================================================================

    /// @notice Donation before any deposit should not break first deposit
    function testFuzz_donationBeforeFirstDeposit(uint256 donation) public {
        // Bound donation so that 1 ether deposit still yields shares.
        // shares = 1e18 * (0 + 1000) / (donation + 1)
        // For shares > 0: donation < 1e18 * 1000 = 1e21
        donation = bound(donation, 1, 1e20);

        // Attacker donates tokens directly to vault before anyone deposits
        token.mint(address(vault), donation);

        // First depositor deposits
        uint256 depositAmount = 1 ether;
        uint256 sharesMinted = _deposit(alice, depositAmount);

        // Shares should still be minted (virtual offset protects)
        assertGt(sharesMinted, 0, "First deposit after donation should mint shares");

        // Alice should be able to withdraw
        uint256 assetsOut = _withdraw(alice, sharesMinted);
        assertGt(assetsOut, 0, "Alice should get some assets back");
    }

    /// @notice Donation attack: deposit small, donate large, second depositor penalized
    function test_donationAttackMitigated() public {
        // Attacker deposits 1 token
        _deposit(attacker, 1 ether);

        // Attacker donates 1000 ether directly
        token.mint(address(vault), 1000 ether);

        // Victim deposits 1 ether
        uint256 victimShares = _deposit(alice, 1 ether);
        uint256 victimValue = vault.convertToAssets(victimShares);

        // With virtual offset, victim should retain most of their value
        assertGe(
            victimValue,
            0.99 ether, // Victim retains >= 99% of deposit
            "Donation attack: victim lost > 1%"
        );
    }

    // ========================================================================
    // ATTACK SCENARIO 2: Full Inflation Attack Sequence
    // ========================================================================
    // First depositor deposits 1 wei, donates large amount, second depositor
    // gets 0 shares -- prevented by virtual offset for reasonable deposit sizes.
    // ========================================================================

    /// @notice Inflation attack: 1 wei deposit + donation, victim deposits proportionally
    function testFuzz_inflationAttackVictimGetsShares(uint256 donation) public {
        donation = bound(donation, 1e18, 1e30);

        // Attacker deposits 1 wei
        _deposit(attacker, 1);

        // Attacker donates
        token.mint(address(vault), donation);

        // Victim deposits same as donation (proportional response)
        uint256 victimDeposit = donation;
        uint256 victimShares = _deposit(alice, victimDeposit);

        // Victim should always get shares when depositing at same scale as donation
        assertGt(victimShares, 0, "Victim should get shares with proportional deposit");

        // Verify victim can withdraw a meaningful amount
        uint256 victimWithdrawn = _withdraw(alice, victimShares);
        assertGt(victimWithdrawn, 0, "Victim should be able to withdraw");
    }

    /// @notice Extreme inflation: 1 wei deposit + 1e30 donation, large victim deposit
    function test_extremeInflationAttack() public {
        _deposit(attacker, 1);

        // Extreme donation
        token.mint(address(vault), 1e30);

        // Victim deposits at same scale as donation
        uint256 victimDeposit = 1e30;
        uint256 victimShares = _deposit(alice, victimDeposit);

        assertGt(victimShares, 0, "Victim should get shares even with extreme donation");

        // Verify the virtual offset limits the attacker's gain
        uint256 victimValue = vault.convertToAssets(victimShares);
        assertGe(
            victimValue,
            victimDeposit * 49 / 100,
            "Victim should retain at least 49% of deposit"
        );
    }

    // ========================================================================
    // ATTACK SCENARIO 3: Fee Extraction via Deposit-Withdraw
    // ========================================================================
    // Deposit just before fee collection, withdraw just after.
    // ========================================================================

    /// @notice Fee extraction: depositor should not benefit from timing fees
    function testFuzz_feeTimingAttack(
        uint256 existingDeposit,
        uint256 attackerDeposit,
        uint256 timeBetween
    ) public {
        existingDeposit = bound(existingDeposit, 1e18, 1e30);
        attackerDeposit = bound(attackerDeposit, 1e18, 1e30);
        timeBetween = bound(timeBetween, 1 days, 365 days);

        // Setup: 2% management fee
        _setupFees(200, 0);

        // Existing depositor deposits
        _deposit(alice, existingDeposit);

        // Time passes, fees accrue
        vm.warp(block.timestamp + timeBetween);

        // Attacker deposits just before fee collection
        uint256 attackerShares = _deposit(attacker, attackerDeposit);

        // Fees are collected (dilutes all shareholders equally)
        vault.collectManagementFee();

        // Attacker withdraws immediately after
        uint256 attackerAssetsOut = _withdraw(attacker, attackerShares);

        // Attacker should not profit from this timing
        assertLe(
            attackerAssetsOut,
            attackerDeposit,
            "Fee timing attack: attacker profited"
        );

        // Attacker's loss should be bounded
        assertGe(
            attackerAssetsOut,
            attackerDeposit * 95 / 100, // Should not lose more than 5%
            "Fee timing: attacker lost too much"
        );
    }

    // ========================================================================
    // ATTACK SCENARIO 4: Sandwich Attack on PPS
    // ========================================================================
    // Deposit before execution that increases balance, withdraw after.
    // ========================================================================

    /// @notice Sandwich attack: deposit before balance increase, withdraw after
    function test_sandwichAttackOnDonation() public {
        // Setup: existing deposit
        _deposit(alice, 100 ether);

        // Attacker front-runs: deposits before balance increase
        uint256 attackerShares = _deposit(attacker, 50 ether);

        // Simulated balance increase (like returning strategy profits)
        token.mint(address(vault), 10 ether);

        // Attacker back-runs: withdraws after balance increase
        uint256 attackerAssetsOut = _withdraw(attacker, attackerShares);

        // The profit is proportional to the attacker's share of the pool.
        // attacker has ~50/(100+50) = 1/3 of shares, so gets ~1/3 of 10 ether = ~3.33 ether
        // This is "expected" behavior -- they legitimately held shares when profits came in.
        // The key protection is that during active strategy, deposits are LOCKED.

        // Verify: alice's remaining value is not unfairly reduced
        uint256 aliceShares = vault.shares(alice);
        uint256 aliceValue = vault.convertToAssets(aliceShares);
        assertGe(aliceValue, 100 ether, "Alice should not lose principal from sandwich");
    }

    // ========================================================================
    // EDGE CASES
    // ========================================================================

    /// @notice Very large deposit values (1e36)
    function test_veryLargeDeposit() public {
        uint256 largeAmount = 1e36;
        uint256 shares = _deposit(alice, largeAmount);

        assertGt(shares, 0, "Large deposit should mint shares");

        uint256 assetsOut = _withdraw(alice, shares);
        assertGe(assetsOut, largeAmount - 1, "Large roundtrip should preserve value");
    }

    /// @notice Very small deposit (1 wei)
    function test_verySmallDeposit() public {
        uint256 shares = _deposit(alice, 1);

        // 1 wei deposit: shares = 1 * (0 + 1000) / (0 + 1) = 1000
        assertEq(shares, 1000, "1 wei deposit should mint 1000 shares");

        uint256 assetsOut = _withdraw(alice, shares);
        // assets = 1000 * (1 + 1) / (1000 + 1000) = 2000/2000 = 1
        assertEq(assetsOut, 1, "1 wei roundtrip should return 1 wei");
    }

    /// @notice Concurrent depositors: many deposits then many withdrawals
    function test_concurrentDepositors() public {
        uint256 depositAmount = 100 ether;
        address[3] memory users = [alice, bob, charlie];
        uint256[3] memory userShares;

        // All deposit same amount
        for (uint256 i = 0; i < 3; i++) {
            userShares[i] = _deposit(users[i], depositAmount);
        }

        // All withdraw all shares
        uint256 totalAssetsOut;
        for (uint256 i = 0; i < 3; i++) {
            uint256 out = _withdraw(users[i], userShares[i]);
            totalAssetsOut += out;
        }

        // Total assets out should be <= total deposited (rounding loses at most 3 wei)
        assertLe(
            totalAssetsOut,
            depositAmount * 3,
            "Total withdrawn exceeds total deposited"
        );
        assertGe(
            totalAssetsOut,
            depositAmount * 3 - 3,
            "Total withdrawn lost more than 3 wei rounding"
        );

        assertEq(vault.totalShares(), 0, "All shares should be burned");
    }

    /// @notice Zero deposit should revert
    function test_zeroDepositReverts() public {
        vm.expectRevert(KernelVault.ZeroDeposit.selector);
        vm.prank(alice);
        vault.depositERC20Tokens(0);
    }

    /// @notice Zero withdraw should revert
    function test_zeroWithdrawReverts() public {
        _deposit(alice, 1 ether);

        vm.expectRevert(KernelVault.ZeroWithdraw.selector);
        vm.prank(alice);
        vault.withdraw(0);
    }

    /// @notice ConvertToShares and convertToAssets are inverses (within rounding)
    function testFuzz_convertFunctionsAreInverses(uint256 amount) public {
        amount = bound(amount, 1, 1e30);

        _deposit(alice, 100 ether); // Establish some PPS

        uint256 sharesFromAssets = vault.convertToShares(amount);
        if (sharesFromAssets > 0) {
            uint256 assetsFromShares = vault.convertToAssets(sharesFromAssets);
            // Should be within 1 of original
            assertLe(
                amount > assetsFromShares ? amount - assetsFromShares : assetsFromShares - amount,
                1,
                "convertToShares/convertToAssets not inverse within 1 wei"
            );
        }
    }

    /// @notice Verify the virtual offset formula produces consistent results
    function testFuzz_virtualOffsetConsistency(
        uint256 deposit1,
        uint256 deposit2,
        uint256 deposit3
    ) public {
        deposit1 = bound(deposit1, 1, 1e28);
        deposit2 = bound(deposit2, 1, 1e28);
        deposit3 = bound(deposit3, 1, 1e28);

        uint256 totalDeposited = deposit1 + deposit2 + deposit3;

        _deposit(alice, deposit1);
        _deposit(bob, deposit2);
        _deposit(charlie, deposit3);

        // Total assets in vault should equal total deposited
        assertEq(
            vault.totalAssets(),
            totalDeposited,
            "Total assets should equal total deposited"
        );

        // Sum of all shares * convertToAssets should approximate total assets
        uint256 aliceValue = vault.convertToAssets(vault.shares(alice));
        uint256 bobValue = vault.convertToAssets(vault.shares(bob));
        uint256 charlieValue = vault.convertToAssets(vault.shares(charlie));

        uint256 totalValue = aliceValue + bobValue + charlieValue;

        // Total redeemable value should be <= total assets (rounding rounds down)
        assertLe(
            totalValue,
            totalDeposited,
            "Sum of redeemable values exceeds total assets"
        );

        // Total redeemable value should be close to total assets (within 3 wei rounding)
        assertGe(
            totalValue,
            totalDeposited - 3,
            "Sum of redeemable values too far from total assets"
        );
    }

    /// @notice PPS should be 1e15 for the very first deposit (OFFSET = 1e3)
    function test_ppsFirstDepositFormula() public {
        uint256 amount = 1000 ether;
        _deposit(alice, amount);

        // PPS = effectiveTotalAssets * 1e18 / totalShares
        // = amount * 1e18 / (amount * 1000)
        // = 1e18 / 1000 = 1e15
        assertEq(vault.currentPps(), 1e15, "First deposit PPS should be 1e15");
    }

    /// @notice Stress test: many small deposits followed by one large withdraw
    function test_manySmallDepositsLargeWithdraw() public {
        uint256 smallAmount = 1 ether;
        uint256 totalAliceDeposited;
        uint256 totalAliceShares;

        // 10 small deposits from alice
        for (uint256 i = 0; i < 10; i++) {
            uint256 shares = _deposit(alice, smallAmount);
            totalAliceShares += shares;
            totalAliceDeposited += smallAmount;
        }

        // Single large withdrawal of all shares
        uint256 assetsOut = _withdraw(alice, totalAliceShares);

        // Should get back total deposited (within rounding)
        assertGe(
            assetsOut,
            totalAliceDeposited - 1,
            "Many small deposits roundtrip should preserve value"
        );
    }

    /// @notice Stress test: alternating deposits and withdrawals
    function testFuzz_alternatingDepositWithdraw(uint256 seed) public {
        seed = bound(seed, 1, type(uint64).max);

        uint256 aliceTotalIn;
        uint256 aliceTotalOut;

        for (uint256 i = 0; i < 5; i++) {
            uint256 amount = (uint256(keccak256(abi.encode(seed, i))) % 1e24) + 1;
            uint256 shares = _deposit(alice, amount);
            aliceTotalIn += amount;

            // Withdraw half shares
            uint256 halfShares = shares / 2;
            if (halfShares > 0) {
                uint256 out = _withdraw(alice, halfShares);
                aliceTotalOut += out;
            }
        }

        // Withdraw remaining shares
        uint256 remaining = vault.shares(alice);
        if (remaining > 0) {
            uint256 out = _withdraw(alice, remaining);
            aliceTotalOut += out;
        }

        // Total out should be <= total in (no free money)
        assertLe(
            aliceTotalOut,
            aliceTotalIn,
            "Alternating deposit/withdraw created free money"
        );
    }
}

// ============================================================================
// Stateful Invariant Testing Handler
// ============================================================================
// A handler contract that performs random deposit/withdraw sequences and
// checks invariants hold across all state transitions.
// ============================================================================

/// @title VaultHandler
/// @notice Handler for stateful invariant testing of KernelVault PPS
contract VaultHandler is Test {
    KernelVault public vault;
    MockERC20 public token;

    address[] public actors;
    mapping(address => uint256) public ghostDeposited; // track deposits per actor
    mapping(address => uint256) public ghostWithdrawn; // track withdrawals per actor
    uint256 public ghostTotalDeposited;
    uint256 public ghostTotalWithdrawn;
    uint256 public ghostTotalDonated;

    constructor(KernelVault _vault, MockERC20 _token) {
        vault = _vault;
        token = _token;

        // Create actor pool
        for (uint256 i = 1; i <= 5; i++) {
            address actor = address(uint160(0x10000 + i));
            actors.push(actor);
            vm.prank(actor);
            token.approve(address(vault), type(uint256).max);
        }
    }

    function deposit(uint256 actorIdx, uint256 amount) external {
        actorIdx = actorIdx % actors.length;
        amount = bound(amount, 1, 1e28);

        address actor = actors[actorIdx];
        token.mint(actor, amount);

        vm.prank(actor);
        vault.depositERC20Tokens(amount);

        ghostDeposited[actor] += amount;
        ghostTotalDeposited += amount;
    }

    function withdraw(uint256 actorIdx, uint256 shareFraction) external {
        actorIdx = actorIdx % actors.length;
        shareFraction = bound(shareFraction, 1, 100);

        address actor = actors[actorIdx];
        uint256 actorShares = vault.shares(actor);
        if (actorShares == 0) return;

        uint256 sharesToWithdraw = actorShares * shareFraction / 100;
        if (sharesToWithdraw == 0) sharesToWithdraw = 1;

        vm.prank(actor);
        uint256 assetsOut = vault.withdraw(sharesToWithdraw);

        ghostWithdrawn[actor] += assetsOut;
        ghostTotalWithdrawn += assetsOut;
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 1, 1e24);
        token.mint(address(vault), amount);
        ghostTotalDonated += amount;
    }

    function getActors() external view returns (address[] memory) {
        return actors;
    }
}

/// @title PPSStatefulInvariantsTest
/// @notice Stateful invariant tests using the VaultHandler
contract PPSStatefulInvariantsTest is Test {
    KernelVault public vault;
    MockKernelExecutionVerifier public mockVerifier;
    MockERC20 public token;
    VaultHandler public handler;

    address public vaultOwner = address(0xAAAA);

    bytes32 public constant AGENT_ID = bytes32(uint256(0xA6E17));
    bytes32 public constant IMAGE_ID = bytes32(uint256(0x1234));

    function setUp() public {
        mockVerifier = new MockKernelExecutionVerifier();
        token = new MockERC20("Test Token", "TEST", 18);

        vault = new KernelVault(
            address(token),
            address(mockVerifier),
            AGENT_ID,
            IMAGE_ID,
            vaultOwner
        );

        handler = new VaultHandler(vault, token);

        // Target only the handler for invariant tests
        targetContract(address(handler));
    }

    /// @notice INVARIANT: Total assets in vault >= sum of all redeemable values
    /// @dev This ensures no phantom value is created
    function invariant_totalAssetsBacksAllShares() public view {
        uint256 totalAssets = vault.totalAssets();
        uint256 totalShares = vault.totalShares();

        if (totalShares == 0) return;

        // Sum of all actors' redeemable value
        address[] memory actors = handler.getActors();
        uint256 totalRedeemable;
        for (uint256 i = 0; i < actors.length; i++) {
            uint256 actorShares = vault.shares(actors[i]);
            if (actorShares > 0) {
                totalRedeemable += vault.convertToAssets(actorShares);
            }
        }

        // Total redeemable should not exceed total assets (no phantom value)
        assertLe(
            totalRedeemable,
            totalAssets,
            "INVARIANT VIOLATED: redeemable value exceeds total assets"
        );
    }

    /// @notice INVARIANT: PPS * totalShares should approximate effectiveTotalAssets
    /// @dev Ensures PPS and share accounting are consistent
    function invariant_ppsTimesSharesApproximatesAssets() public view {
        uint256 totalShares = vault.totalShares();
        if (totalShares == 0) return;

        uint256 pps = vault.currentPps();
        uint256 effectiveAssets = vault.effectiveTotalAssets();

        // pps = effectiveAssets * 1e18 / totalShares
        // => effectiveAssets ~= pps * totalShares / 1e18
        uint256 reconstructed = pps * totalShares / 1e18;

        // Allow rounding tolerance of 1 per 1e18 of total shares + 1
        uint256 tolerance = totalShares / 1e18 + 1;

        if (reconstructed > effectiveAssets) {
            assertLe(
                reconstructed - effectiveAssets,
                tolerance,
                "INVARIANT VIOLATED: PPS * totalShares too far from effectiveAssets (above)"
            );
        } else {
            assertLe(
                effectiveAssets - reconstructed,
                tolerance,
                "INVARIANT VIOLATED: PPS * totalShares too far from effectiveAssets (below)"
            );
        }
    }

    /// @notice INVARIANT: No ghost shares (totalShares == sum of all shares[actor])
    function invariant_noGhostShares() public view {
        uint256 sumShares;
        address[] memory actors = handler.getActors();
        for (uint256 i = 0; i < actors.length; i++) {
            sumShares += vault.shares(actors[i]);
        }

        // Sum of individual shares should not exceed totalShares
        // (fee recipient or protocol treasury may hold additional shares)
        assertLe(
            sumShares,
            vault.totalShares(),
            "INVARIANT VIOLATED: sum of actor shares exceeds totalShares"
        );
    }

    /// @notice INVARIANT: No value created from thin air
    /// @dev Conservation of value: totalWithdrawn + currentBalance <= totalDeposited + totalDonated
    ///      All value in the system comes from deposits or donations. Rounding can only
    ///      destroy value (rounds down on withdraw), never create it.
    function invariant_noFreeValue() public view {
        uint256 totalWithdrawn = handler.ghostTotalWithdrawn();
        uint256 totalDeposited = handler.ghostTotalDeposited();
        uint256 totalDonated = handler.ghostTotalDonated();
        uint256 currentBalance = vault.totalAssets();

        // All value that was withdrawn plus what remains in the vault must not exceed
        // total value that entered (deposits + donations)
        assertLe(
            totalWithdrawn + currentBalance,
            totalDeposited + totalDonated,
            "INVARIANT VIOLATED: more value in system than was deposited + donated"
        );
    }
}
