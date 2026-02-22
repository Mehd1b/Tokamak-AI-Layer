// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { OracleVerifier } from "../src/libraries/OracleVerifier.sol";

/// @title OracleVerifierWrapper
/// @notice External wrapper to test library revert behavior via vm.expectRevert
contract OracleVerifierWrapper {
    function requireValid(
        bytes32 feedHash,
        bytes memory signature,
        address expectedSigner
    ) external pure {
        OracleVerifier.requireValidOracleSignature(feedHash, signature, expectedSigner);
    }

    function verify(
        bytes32 feedHash,
        bytes memory signature,
        address expectedSigner
    ) external pure returns (bool) {
        return OracleVerifier.verifyOracleSignature(feedHash, signature, expectedSigner);
    }
}

/// @title OracleVerifierTest
/// @notice Tests for the OracleVerifier library
contract OracleVerifierTest is Test {
    // Use a deterministic test private key
    uint256 constant ORACLE_PK = 0xA11CE;
    address oracleSigner;
    OracleVerifierWrapper wrapper;

    function setUp() public {
        oracleSigner = vm.addr(ORACLE_PK);
        wrapper = new OracleVerifierWrapper();
    }

    // ============ Helpers ============

    /// @notice Sign a feed hash using EIP-191 personal sign
    function _signFeedHash(bytes32 feedHash, uint256 pk) internal pure returns (bytes memory) {
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", feedHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    // ============ verifyOracleSignature Tests ============

    function test_validSignature() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);

        assertTrue(wrapper.verify(feedHash, sig, oracleSigner), "Valid signature should verify");
    }

    function test_wrongSigner() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);

        address wrongSigner = address(0xDEAD);
        assertFalse(wrapper.verify(feedHash, sig, wrongSigner), "Wrong signer should fail");
    }

    function test_wrongFeedHash() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);

        bytes32 differentHash = sha256("different data");
        assertFalse(wrapper.verify(differentHash, sig, oracleSigner), "Wrong feed hash should fail");
    }

    function test_invalidSignatureLength_short() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory shortSig = new bytes(64);

        assertFalse(wrapper.verify(feedHash, shortSig, oracleSigner), "Short signature should fail");
    }

    function test_invalidSignatureLength_long() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory longSig = new bytes(66);

        assertFalse(wrapper.verify(feedHash, longSig, oracleSigner), "Long signature should fail");
    }

    function test_invalidRecoveryId() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);
        sig[64] = 0x00; // invalid v

        assertFalse(wrapper.verify(feedHash, sig, oracleSigner), "Invalid recovery ID should fail");
    }

    function test_emptySignature() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory emptySig = new bytes(0);

        assertFalse(wrapper.verify(feedHash, emptySig, oracleSigner), "Empty signature should fail");
    }

    function test_differentKeys() public view {
        uint256 otherPk = 0xB0B;
        address otherSigner = vm.addr(otherPk);

        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, otherPk);

        assertTrue(
            wrapper.verify(feedHash, sig, otherSigner),
            "Should verify with matching signer"
        );
        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner),
            "Should fail with non-matching signer"
        );
    }

    // ============ requireValidOracleSignature Tests ============

    function test_requireValid_succeeds() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);

        // Should not revert
        wrapper.requireValid(feedHash, sig, oracleSigner);
    }

    function test_requireValid_revertsOnBadLength() public {
        bytes32 feedHash = sha256("test feed data");
        bytes memory shortSig = new bytes(10);

        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.InvalidSignatureLength.selector, 10)
        );
        wrapper.requireValid(feedHash, shortSig, oracleSigner);
    }

    function test_requireValid_revertsOnBadRecoveryId() public {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);
        sig[64] = 0x00; // invalid v

        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.InvalidRecoveryId.selector, 0)
        );
        wrapper.requireValid(feedHash, sig, oracleSigner);
    }

    function test_requireValid_revertsOnSignerMismatch() public {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);

        address wrongSigner = address(0xDEAD);
        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.SignerMismatch.selector, oracleSigner, wrongSigner)
        );
        wrapper.requireValid(feedHash, sig, wrongSigner);
    }

    // ============ Edge Cases ============

    function test_zeroFeedHash() public view {
        bytes32 feedHash = bytes32(0);
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);

        assertTrue(wrapper.verify(feedHash, sig, oracleSigner), "Zero feed hash should verify");
    }

    function test_allBitsFeedHash() public view {
        bytes32 feedHash = bytes32(type(uint256).max);
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK);

        assertTrue(wrapper.verify(feedHash, sig, oracleSigner), "All-bits feed hash should verify");
    }
}
