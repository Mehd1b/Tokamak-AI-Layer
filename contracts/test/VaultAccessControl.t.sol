// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { VaultAccessControl, IKycVerifier } from "../src/extensions/VaultAccessControl.sol";

/// @title MockKycVerifier
/// @notice Minimal mock for KYC verification
contract MockKycVerifier is IKycVerifier {
    mapping(address => bool) public verified;

    function setVerified(address user, bool status) external {
        verified[user] = status;
    }

    function isVerified(address user) external view returns (bool) {
        return verified[user];
    }
}

/// @title VaultAccessControlTest
/// @notice Comprehensive test suite for VaultAccessControl
contract VaultAccessControlTest is Test {
    VaultAccessControl public ac;
    MockKycVerifier public kyc;

    address public owner = address(this);
    address public vault = address(0x4444444444444444444444444444444444444444);
    address public user1 = address(0x1111111111111111111111111111111111111111);
    address public user2 = address(0x2222222222222222222222222222222222222222);
    address public user3 = address(0x3333333333333333333333333333333333333333);
    address public unauthorized = address(0x6666666666666666666666666666666666666666);

    function setUp() public {
        ac = new VaultAccessControl(vault);
        kyc = new MockKycVerifier();
    }

    // ============ Constructor Tests ============

    function test_constructor() public view {
        assertEq(ac.vault(), vault);
        assertEq(ac.owner(), owner);
        assertFalse(ac.whitelistEnabled());
        assertFalse(ac.depositCapEnabled());
        assertFalse(ac.kycVerifierEnabled());
    }

    function test_constructor_revert_zeroVault() public {
        vm.expectRevert(VaultAccessControl.ZeroAddress.selector);
        new VaultAccessControl(address(0));
    }

    // ============ Ownership Tests ============

    function test_transferOwnership() public {
        ac.transferOwnership(user1);
        assertEq(ac.owner(), user1);
    }

    function test_transferOwnership_revert_notOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.transferOwnership(user1);
    }

    function test_transferOwnership_revert_zeroAddress() public {
        vm.expectRevert(VaultAccessControl.ZeroAddress.selector);
        ac.transferOwnership(address(0));
    }

    // ============ Whitelist Tests ============

    function test_whitelist_enable() public {
        ac.setWhitelistEnabled(true);
        assertTrue(ac.whitelistEnabled());
    }

    function test_whitelist_disable() public {
        ac.setWhitelistEnabled(true);
        ac.setWhitelistEnabled(false);
        assertFalse(ac.whitelistEnabled());
    }

    function test_whitelist_addSingle() public {
        address[] memory accounts = new address[](1);
        accounts[0] = user1;
        ac.addToWhitelist(accounts);
        assertTrue(ac.whitelisted(user1));
    }

    function test_whitelist_addMultiple() public {
        address[] memory accounts = new address[](3);
        accounts[0] = user1;
        accounts[1] = user2;
        accounts[2] = user3;
        ac.addToWhitelist(accounts);
        assertTrue(ac.whitelisted(user1));
        assertTrue(ac.whitelisted(user2));
        assertTrue(ac.whitelisted(user3));
    }

    function test_whitelist_remove() public {
        address[] memory toAdd = new address[](2);
        toAdd[0] = user1;
        toAdd[1] = user2;
        ac.addToWhitelist(toAdd);

        address[] memory toRemove = new address[](1);
        toRemove[0] = user1;
        ac.removeFromWhitelist(toRemove);

        assertFalse(ac.whitelisted(user1));
        assertTrue(ac.whitelisted(user2));
    }

    function test_whitelist_addEmpty_revert() public {
        address[] memory empty = new address[](0);
        vm.expectRevert(VaultAccessControl.EmptyArray.selector);
        ac.addToWhitelist(empty);
    }

    function test_whitelist_removeEmpty_revert() public {
        address[] memory empty = new address[](0);
        vm.expectRevert(VaultAccessControl.EmptyArray.selector);
        ac.removeFromWhitelist(empty);
    }

    function test_whitelist_canDeposit_allowed() public {
        ac.setWhitelistEnabled(true);
        address[] memory accounts = new address[](1);
        accounts[0] = user1;
        ac.addToWhitelist(accounts);

        assertTrue(ac.canDeposit(user1, 100 ether));
    }

    function test_whitelist_canDeposit_blocked() public {
        ac.setWhitelistEnabled(true);
        assertFalse(ac.canDeposit(user1, 100 ether));
    }

    function test_whitelist_disabled_allAllowed() public {
        // Whitelist disabled — anyone can deposit
        assertTrue(ac.canDeposit(user1, 100 ether));
        assertTrue(ac.canDeposit(user2, 100 ether));
    }

    function test_whitelist_onlyOwner_setEnabled() public {
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.setWhitelistEnabled(true);
    }

    function test_whitelist_onlyOwner_add() public {
        address[] memory accounts = new address[](1);
        accounts[0] = user1;
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.addToWhitelist(accounts);
    }

    function test_whitelist_onlyOwner_remove() public {
        address[] memory accounts = new address[](1);
        accounts[0] = user1;
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.removeFromWhitelist(accounts);
    }

    // ============ Deposit Cap Tests ============

    function test_depositCap_setDefault() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);
        assertEq(ac.defaultDepositCap(), 1000 ether);
    }

    function test_depositCap_setPerAddress() public {
        ac.setDepositCap(user1, 500 ether);
        assertEq(ac.depositCaps(user1), 500 ether);
    }

    function test_depositCap_canDeposit_underCap() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        assertTrue(ac.canDeposit(user1, 500 ether));
    }

    function test_depositCap_canDeposit_atCap() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        assertTrue(ac.canDeposit(user1, 1000 ether));
    }

    function test_depositCap_canDeposit_overCap() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        assertFalse(ac.canDeposit(user1, 1001 ether));
    }

    function test_depositCap_perAddress_overridesDefault() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);
        ac.setDepositCap(user1, 500 ether);

        assertTrue(ac.canDeposit(user1, 500 ether));
        assertFalse(ac.canDeposit(user1, 501 ether));
        // user2 still uses default
        assertTrue(ac.canDeposit(user2, 1000 ether));
    }

    function test_depositCap_tracksDeposits() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        // Record a deposit of 600 ether
        vm.prank(vault);
        ac.recordDeposit(user1, 600 ether);

        // Now user can only deposit 400 more
        assertTrue(ac.canDeposit(user1, 400 ether));
        assertFalse(ac.canDeposit(user1, 401 ether));
    }

    function test_depositCap_disabled_noCap() public {
        // Cap mode disabled
        assertTrue(ac.canDeposit(user1, type(uint256).max));
    }

    function test_depositCap_noCap_noLimit() public {
        ac.setDepositCapEnabled(true);
        // Default cap is 0, per-address cap is 0 → no limit
        assertTrue(ac.canDeposit(user1, type(uint256).max));
    }

    function test_depositCap_onlyOwner_setEnabled() public {
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.setDepositCapEnabled(true);
    }

    function test_depositCap_onlyOwner_setDefault() public {
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.setDefaultDepositCap(1000 ether);
    }

    function test_depositCap_onlyOwner_setPerAddress() public {
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.setDepositCap(user1, 500 ether);
    }

    // ============ KYC Verifier Tests ============

    function test_kyc_setVerifier() public {
        ac.setKycVerifier(address(kyc));
        assertEq(address(ac.kycVerifier()), address(kyc));
    }

    function test_kyc_revert_zeroAddress() public {
        vm.expectRevert(VaultAccessControl.ZeroAddress.selector);
        ac.setKycVerifier(address(0));
    }

    function test_kyc_revert_notContract() public {
        vm.expectRevert(abi.encodeWithSelector(VaultAccessControl.NotAContract.selector, user1));
        ac.setKycVerifier(user1);
    }

    function test_kyc_canDeposit_verified() public {
        ac.setKycVerifierEnabled(true);
        ac.setKycVerifier(address(kyc));
        kyc.setVerified(user1, true);

        assertTrue(ac.canDeposit(user1, 100 ether));
    }

    function test_kyc_canDeposit_notVerified() public {
        ac.setKycVerifierEnabled(true);
        ac.setKycVerifier(address(kyc));
        // user1 is not verified by default

        assertFalse(ac.canDeposit(user1, 100 ether));
    }

    function test_kyc_canDeposit_noVerifierSet() public {
        ac.setKycVerifierEnabled(true);
        // No verifier set → should block all
        assertFalse(ac.canDeposit(user1, 100 ether));
    }

    function test_kyc_disabled_allAllowed() public {
        // KYC disabled — anyone can deposit
        assertTrue(ac.canDeposit(user1, 100 ether));
    }

    function test_kyc_onlyOwner_setEnabled() public {
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.setKycVerifierEnabled(true);
    }

    function test_kyc_onlyOwner_setVerifier() public {
        vm.prank(unauthorized);
        vm.expectRevert(VaultAccessControl.NotOwner.selector);
        ac.setKycVerifier(address(kyc));
    }

    // ============ Combined Mode Tests ============

    function test_combined_whitelist_and_cap() public {
        ac.setWhitelistEnabled(true);
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        address[] memory accounts = new address[](1);
        accounts[0] = user1;
        ac.addToWhitelist(accounts);

        // Whitelisted and under cap
        assertTrue(ac.canDeposit(user1, 500 ether));
        // Whitelisted but over cap
        assertFalse(ac.canDeposit(user1, 1001 ether));
        // Not whitelisted
        assertFalse(ac.canDeposit(user2, 500 ether));
    }

    function test_combined_whitelist_and_kyc() public {
        ac.setWhitelistEnabled(true);
        ac.setKycVerifierEnabled(true);
        ac.setKycVerifier(address(kyc));

        address[] memory accounts = new address[](1);
        accounts[0] = user1;
        ac.addToWhitelist(accounts);
        kyc.setVerified(user1, true);

        // Whitelisted and KYC'd
        assertTrue(ac.canDeposit(user1, 100 ether));

        // Whitelisted but NOT KYC'd
        address[] memory accounts2 = new address[](1);
        accounts2[0] = user2;
        ac.addToWhitelist(accounts2);
        assertFalse(ac.canDeposit(user2, 100 ether));
    }

    function test_combined_all_three_gates() public {
        ac.setWhitelistEnabled(true);
        ac.setDepositCapEnabled(true);
        ac.setKycVerifierEnabled(true);
        ac.setDefaultDepositCap(1000 ether);
        ac.setKycVerifier(address(kyc));

        address[] memory accounts = new address[](1);
        accounts[0] = user1;
        ac.addToWhitelist(accounts);
        kyc.setVerified(user1, true);

        // All gates pass
        assertTrue(ac.canDeposit(user1, 500 ether));

        // Over cap
        assertFalse(ac.canDeposit(user1, 1001 ether));

        // Remove KYC
        kyc.setVerified(user1, false);
        assertFalse(ac.canDeposit(user1, 500 ether));
    }

    function test_combined_cap_tracks_across_deposits() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        // First deposit of 400
        vm.prank(vault);
        ac.recordDeposit(user1, 400 ether);
        assertTrue(ac.canDeposit(user1, 600 ether));

        // Second deposit of 400
        vm.prank(vault);
        ac.recordDeposit(user1, 400 ether);
        assertTrue(ac.canDeposit(user1, 200 ether));
        assertFalse(ac.canDeposit(user1, 201 ether));
    }

    // ============ Record Deposit Tests ============

    function test_recordDeposit_fromVault() public {
        vm.prank(vault);
        ac.recordDeposit(user1, 500 ether);
        assertEq(ac.deposited(user1), 500 ether);
    }

    function test_recordDeposit_fromOwner() public {
        ac.recordDeposit(user1, 500 ether);
        assertEq(ac.deposited(user1), 500 ether);
    }

    function test_recordDeposit_revert_unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert("not vault or owner");
        ac.recordDeposit(user1, 500 ether);
    }

    // ============ View Function Tests ============

    function test_getEffectiveCap_default() public {
        ac.setDefaultDepositCap(1000 ether);
        assertEq(ac.getEffectiveCap(user1), 1000 ether);
    }

    function test_getEffectiveCap_perAddress() public {
        ac.setDefaultDepositCap(1000 ether);
        ac.setDepositCap(user1, 500 ether);
        assertEq(ac.getEffectiveCap(user1), 500 ether);
        assertEq(ac.getEffectiveCap(user2), 1000 ether);
    }

    function test_getRemainingAllowance_noCap() public {
        assertEq(ac.getRemainingAllowance(user1), type(uint256).max);
    }

    function test_getRemainingAllowance_withCap() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        assertEq(ac.getRemainingAllowance(user1), 1000 ether);

        vm.prank(vault);
        ac.recordDeposit(user1, 600 ether);

        assertEq(ac.getRemainingAllowance(user1), 400 ether);
    }

    function test_getRemainingAllowance_exhausted() public {
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000 ether);

        vm.prank(vault);
        ac.recordDeposit(user1, 1000 ether);

        assertEq(ac.getRemainingAllowance(user1), 0);
    }

    // ============ Event Tests ============

    function test_event_whitelistEnabled() public {
        vm.expectEmit(false, false, false, true);
        emit VaultAccessControl.WhitelistEnabledUpdated(true);
        ac.setWhitelistEnabled(true);
    }

    function test_event_whitelistAdded() public {
        address[] memory accounts = new address[](2);
        accounts[0] = user1;
        accounts[1] = user2;

        vm.expectEmit(false, false, false, true);
        emit VaultAccessControl.WhitelistAdded(accounts);
        ac.addToWhitelist(accounts);
    }

    function test_event_depositCapSet() public {
        vm.expectEmit(true, false, false, true);
        emit VaultAccessControl.DepositCapSet(user1, 500 ether);
        ac.setDepositCap(user1, 500 ether);
    }

    function test_event_kycVerifierSet() public {
        vm.expectEmit(true, false, false, true);
        emit VaultAccessControl.KycVerifierSet(address(kyc));
        ac.setKycVerifier(address(kyc));
    }
}
