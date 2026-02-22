// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { PriceFeedAttestation } from "../src/PriceFeedAttestation.sol";
import { IPriceFeedAttestation } from "../src/interfaces/IPriceFeedAttestation.sol";

contract PriceFeedAttestationTest is Test {
    PriceFeedAttestation public attestation;

    address public owner;
    address public attestor;
    address public nonAttestor;

    uint32 public constant ASSET_BTC = 0;
    uint32 public constant ASSET_ETH = 1;
    uint32 public constant TIMEFRAME_4H = 14400;

    function setUp() public {
        owner = address(0xA001);
        attestor = address(0xB001);
        nonAttestor = address(0xDEAD);

        vm.prank(owner);
        attestation = new PriceFeedAttestation(owner);

        vm.prank(owner);
        attestation.authorizeAttestor(attestor);
    }

    // ============ Constructor ============

    function test_constructorSetsOwner() public view {
        assertEq(attestation.owner(), owner);
    }

    function test_constructorRevertsZeroOwner() public {
        vm.expectRevert(IPriceFeedAttestation.ZeroAddress.selector);
        new PriceFeedAttestation(address(0));
    }

    // ============ Attestor Management ============

    function test_authorizeAttestor() public {
        address newAttestor = address(0xC001);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit IPriceFeedAttestation.AttestorAuthorized(newAttestor);
        attestation.authorizeAttestor(newAttestor);

        assertTrue(attestation.isAuthorizedAttestor(newAttestor));
    }

    function test_authorizeAttestor_revertsIfNotOwner() public {
        vm.prank(nonAttestor);
        vm.expectRevert(IPriceFeedAttestation.NotOwner.selector);
        attestation.authorizeAttestor(nonAttestor);
    }

    function test_authorizeAttestor_revertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IPriceFeedAttestation.ZeroAddress.selector);
        attestation.authorizeAttestor(address(0));
    }

    function test_revokeAttestor() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit IPriceFeedAttestation.AttestorRevoked(attestor);
        attestation.revokeAttestor(attestor);

        assertFalse(attestation.isAuthorizedAttestor(attestor));
    }

    function test_revokeAttestor_revertsIfNotOwner() public {
        vm.prank(nonAttestor);
        vm.expectRevert(IPriceFeedAttestation.NotOwner.selector);
        attestation.revokeAttestor(attestor);
    }

    // ============ Submit Attestation ============

    function _makeMerkleRoot(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("candle_root", seed));
    }

    function test_submitAttestation_stores() public {
        bytes32 root = _makeMerkleRoot(1);
        uint64 start = 1700000000;
        uint64 end = 1700057600; // 16 hours later (4 candles of 4h)

        vm.prank(attestor);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, start, end);

        assertTrue(attestation.isAttested(root));

        IPriceFeedAttestation.Attestation memory att = attestation.getAttestation(root);
        assertEq(att.asset, ASSET_BTC);
        assertEq(att.timeframe, TIMEFRAME_4H);
        assertEq(att.candleCount, 4);
        assertEq(att.startTimestamp, start);
        assertEq(att.endTimestamp, end);
        assertEq(att.attestor, attestor);
    }

    function test_submitAttestation_emitsEvent() public {
        bytes32 root = _makeMerkleRoot(2);
        uint64 start = 1700000000;
        uint64 end = 1700057600;

        vm.prank(attestor);
        vm.expectEmit(true, true, true, true);
        emit IPriceFeedAttestation.AttestationSubmitted(
            root, ASSET_BTC, TIMEFRAME_4H, 4, start, end, attestor
        );
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, start, end);
    }

    function test_submitAttestation_revertsIfNotAttestor() public {
        bytes32 root = _makeMerkleRoot(3);

        vm.prank(nonAttestor);
        vm.expectRevert(IPriceFeedAttestation.UnauthorizedAttestor.selector);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700057600);
    }

    function test_submitAttestation_revertsOnZeroRoot() public {
        vm.prank(attestor);
        vm.expectRevert(IPriceFeedAttestation.ZeroMerkleRoot.selector);
        attestation.submitAttestation(bytes32(0), ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700057600);
    }

    function test_submitAttestation_revertsOnZeroCandleCount() public {
        bytes32 root = _makeMerkleRoot(4);

        vm.prank(attestor);
        vm.expectRevert(IPriceFeedAttestation.InvalidCandleCount.selector);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 0, 1700000000, 1700057600);
    }

    function test_submitAttestation_revertsOnInvalidTimeRange() public {
        bytes32 root = _makeMerkleRoot(5);

        vm.prank(attestor);
        vm.expectRevert(IPriceFeedAttestation.InvalidTimeRange.selector);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700057600, 1700000000);
    }

    function test_submitAttestation_revertsOnEqualTimestamps() public {
        bytes32 root = _makeMerkleRoot(6);

        vm.prank(attestor);
        vm.expectRevert(IPriceFeedAttestation.InvalidTimeRange.selector);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700000000);
    }

    function test_submitAttestation_revertsOnDuplicate() public {
        bytes32 root = _makeMerkleRoot(7);

        vm.prank(attestor);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700057600);

        vm.prank(attestor);
        vm.expectRevert(IPriceFeedAttestation.AttestationAlreadyExists.selector);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700057600);
    }

    // ============ View Functions ============

    function test_isAttested_falseForUnknown() public view {
        assertFalse(attestation.isAttested(bytes32(uint256(999))));
    }

    function test_verifyInputRoot_matchesAsset() public {
        bytes32 root = _makeMerkleRoot(10);

        vm.prank(attestor);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700057600);

        assertTrue(attestation.verifyInputRoot(root, ASSET_BTC));
        assertFalse(attestation.verifyInputRoot(root, ASSET_ETH));
    }

    function test_verifyInputRoot_falseForUnattestedRoot() public view {
        assertFalse(attestation.verifyInputRoot(bytes32(uint256(42)), ASSET_BTC));
    }

    // ============ Multiple Attestations ============

    function test_multipleAttestations_different_assets() public {
        bytes32 rootBTC = _makeMerkleRoot(20);
        bytes32 rootETH = _makeMerkleRoot(21);

        vm.startPrank(attestor);
        attestation.submitAttestation(rootBTC, ASSET_BTC, TIMEFRAME_4H, 50, 1700000000, 1700720000);
        attestation.submitAttestation(rootETH, ASSET_ETH, TIMEFRAME_4H, 50, 1700000000, 1700720000);
        vm.stopPrank();

        assertTrue(attestation.verifyInputRoot(rootBTC, ASSET_BTC));
        assertTrue(attestation.verifyInputRoot(rootETH, ASSET_ETH));
        assertFalse(attestation.verifyInputRoot(rootBTC, ASSET_ETH));
        assertFalse(attestation.verifyInputRoot(rootETH, ASSET_BTC));
    }

    function test_multipleAttestors_independent() public {
        address attestor2 = address(0xC002);
        vm.prank(owner);
        attestation.authorizeAttestor(attestor2);

        bytes32 root1 = _makeMerkleRoot(30);
        bytes32 root2 = _makeMerkleRoot(31);

        vm.prank(attestor);
        attestation.submitAttestation(root1, ASSET_BTC, TIMEFRAME_4H, 10, 1700000000, 1700144000);

        vm.prank(attestor2);
        attestation.submitAttestation(root2, ASSET_BTC, TIMEFRAME_4H, 10, 1700144000, 1700288000);

        IPriceFeedAttestation.Attestation memory att1 = attestation.getAttestation(root1);
        IPriceFeedAttestation.Attestation memory att2 = attestation.getAttestation(root2);

        assertEq(att1.attestor, attestor);
        assertEq(att2.attestor, attestor2);
    }

    // ============ Revoked Attestor Cannot Submit ============

    function test_revokedAttestor_cannotSubmit() public {
        vm.prank(owner);
        attestation.revokeAttestor(attestor);

        bytes32 root = _makeMerkleRoot(40);

        vm.prank(attestor);
        vm.expectRevert(IPriceFeedAttestation.UnauthorizedAttestor.selector);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700057600);
    }

    function test_revokedAttestor_existingAttestationsRemain() public {
        bytes32 root = _makeMerkleRoot(41);

        vm.prank(attestor);
        attestation.submitAttestation(root, ASSET_BTC, TIMEFRAME_4H, 4, 1700000000, 1700057600);

        vm.prank(owner);
        attestation.revokeAttestor(attestor);

        // Existing attestation remains valid
        assertTrue(attestation.isAttested(root));
        assertTrue(attestation.verifyInputRoot(root, ASSET_BTC));
    }
}
