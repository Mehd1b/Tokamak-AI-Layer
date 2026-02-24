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
        address expectedSigner,
        uint64 oracleTimestamp,
        uint256 chainId,
        address vaultAddress,
        uint64 maxOracleAge
    ) external view {
        OracleVerifier.requireValidOracleSignature(
            feedHash, signature, expectedSigner, oracleTimestamp, chainId, vaultAddress, maxOracleAge
        );
    }

    function verify(
        bytes32 feedHash,
        bytes memory signature,
        address expectedSigner,
        uint64 oracleTimestamp,
        uint256 chainId,
        address vaultAddress,
        uint64 maxOracleAge
    ) external view returns (bool) {
        return OracleVerifier.verifyOracleSignature(
            feedHash, signature, expectedSigner, oracleTimestamp, chainId, vaultAddress, maxOracleAge
        );
    }
}

/// @title OracleVerifierTest
/// @notice Tests for the OracleVerifier library
contract OracleVerifierTest is Test {
    // Use a deterministic test private key
    uint256 constant ORACLE_PK = 0xA11CE;
    address oracleSigner;
    OracleVerifierWrapper wrapper;

    // Default domain binding values
    uint64 constant DEFAULT_TIMESTAMP = 1000;
    uint256 constant DEFAULT_CHAIN_ID = 31337;
    address constant DEFAULT_VAULT = address(0xA0A1);

    function setUp() public {
        oracleSigner = vm.addr(ORACLE_PK);
        wrapper = new OracleVerifierWrapper();
        vm.warp(1100); // Set block.timestamp to 1100 (100s after DEFAULT_TIMESTAMP)
    }

    // ============ Helpers ============

    /// @notice Sign a feed hash using domain-bound EIP-191 personal sign
    function _signFeedHash(
        bytes32 feedHash,
        uint256 pk,
        uint64 oracleTimestamp,
        uint256 chainId,
        address vaultAddress
    ) internal pure returns (bytes memory) {
        bytes32 domainFeedHash = keccak256(abi.encodePacked(feedHash, oracleTimestamp, chainId, vaultAddress));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", domainFeedHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    /// @notice Convenience: sign with default domain values
    function _signFeedHashDefault(bytes32 feedHash, uint256 pk) internal pure returns (bytes memory) {
        return _signFeedHash(feedHash, pk, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT);
    }

    // ============ verifyOracleSignature Tests ============

    function test_validSignature() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        assertTrue(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Valid signature should verify"
        );
    }

    function test_wrongSigner() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        address wrongSigner = address(0xDEAD);
        assertFalse(
            wrapper.verify(feedHash, sig, wrongSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Wrong signer should fail"
        );
    }

    function test_wrongFeedHash() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        bytes32 differentHash = sha256("different data");
        assertFalse(
            wrapper.verify(differentHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Wrong feed hash should fail"
        );
    }

    function test_invalidSignatureLength_short() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory shortSig = new bytes(64);

        assertFalse(
            wrapper.verify(feedHash, shortSig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Short signature should fail"
        );
    }

    function test_invalidSignatureLength_long() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory longSig = new bytes(66);

        assertFalse(
            wrapper.verify(feedHash, longSig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Long signature should fail"
        );
    }

    function test_invalidRecoveryId() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);
        sig[64] = 0x00; // invalid v

        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Invalid recovery ID should fail"
        );
    }

    function test_emptySignature() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory emptySig = new bytes(0);

        assertFalse(
            wrapper.verify(feedHash, emptySig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Empty signature should fail"
        );
    }

    function test_differentKeys() public view {
        uint256 otherPk = 0xB0B;
        address otherSigner = vm.addr(otherPk);

        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, otherPk);

        assertTrue(
            wrapper.verify(feedHash, sig, otherSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Should verify with matching signer"
        );
        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Should fail with non-matching signer"
        );
    }

    // ============ Domain Binding Tests ============

    function test_wrongChainId_fails() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        // Verify with different chainId
        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, 999, DEFAULT_VAULT, 0),
            "Wrong chainId should fail"
        );
    }

    function test_wrongVaultAddress_fails() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        // Verify with different vault address
        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, address(0xBEEF), 0),
            "Wrong vault address should fail"
        );
    }

    function test_wrongTimestamp_fails() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        // Verify with different timestamp
        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP + 1, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Wrong timestamp should fail"
        );
    }

    // ============ Staleness Tests ============

    function test_staleness_withinAge_succeeds() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        // block.timestamp=1100, oracleTimestamp=1000, maxAge=200 → age=100 ≤ 200 → OK
        assertTrue(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 200),
            "Within max age should succeed"
        );
    }

    function test_staleness_expired_fails() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        // block.timestamp=1100, oracleTimestamp=1000, maxAge=50 → age=100 > 50 → stale
        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 50),
            "Expired oracle data should fail"
        );
    }

    function test_staleness_zeroMaxAge_noCheck() public view {
        bytes32 feedHash = sha256("test feed data");
        // Sign with very old timestamp
        uint64 oldTimestamp = 1;
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK, oldTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT);

        // maxOracleAge=0 means no age check
        assertTrue(
            wrapper.verify(feedHash, sig, oracleSigner, oldTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Zero maxAge should skip staleness check"
        );
    }

    // ============ requireValidOracleSignature Tests ============

    function test_requireValid_succeeds() public view {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        // Should not revert
        wrapper.requireValid(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0);
    }

    function test_requireValid_revertsOnBadLength() public {
        bytes32 feedHash = sha256("test feed data");
        bytes memory shortSig = new bytes(10);

        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.InvalidSignatureLength.selector, 10)
        );
        wrapper.requireValid(feedHash, shortSig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0);
    }

    function test_requireValid_revertsOnBadRecoveryId() public {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);
        sig[64] = 0x00; // invalid v

        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.InvalidRecoveryId.selector, 0)
        );
        wrapper.requireValid(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0);
    }

    function test_requireValid_revertsOnSignerMismatch() public {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        address wrongSigner = address(0xDEAD);
        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.SignerMismatch.selector, oracleSigner, wrongSigner)
        );
        wrapper.requireValid(feedHash, sig, wrongSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0);
    }

    function test_requireValid_revertsOnStaleData() public {
        bytes32 feedHash = sha256("test feed data");
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        // block.timestamp=1100, oracleTimestamp=1000, maxAge=50 → stale
        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.OracleDataStale.selector, DEFAULT_TIMESTAMP, 50, 1100)
        );
        wrapper.requireValid(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 50);
    }

    // ============ Edge Cases ============

    function test_zeroFeedHash() public view {
        bytes32 feedHash = bytes32(0);
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        assertTrue(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Zero feed hash should verify"
        );
    }

    // ============ Future Timestamp Tests ============

    function test_futureTimestamp_verify_returnsFalse() public view {
        bytes32 feedHash = sha256("test feed data");
        // Sign with a future timestamp (2000 > block.timestamp 1100)
        uint64 futureTimestamp = 2000;
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK, futureTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT);

        // With maxOracleAge > 0, future timestamp should return false (not underflow)
        assertFalse(
            wrapper.verify(feedHash, sig, oracleSigner, futureTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 200),
            "Future timestamp should fail verification (not underflow)"
        );
    }

    function test_futureTimestamp_requireValid_reverts() public {
        bytes32 feedHash = sha256("test feed data");
        uint64 futureTimestamp = 2000;
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK, futureTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT);

        // Should revert with OracleDataStale, not underflow panic
        vm.expectRevert(
            abi.encodeWithSelector(OracleVerifier.OracleDataStale.selector, futureTimestamp, 200, 1100)
        );
        wrapper.requireValid(feedHash, sig, oracleSigner, futureTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 200);
    }

    function test_futureTimestamp_zeroMaxAge_succeeds() public view {
        bytes32 feedHash = sha256("test feed data");
        uint64 futureTimestamp = 2000;
        bytes memory sig = _signFeedHash(feedHash, ORACLE_PK, futureTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT);

        // maxOracleAge=0 means no age check, so future timestamp should pass
        assertTrue(
            wrapper.verify(feedHash, sig, oracleSigner, futureTimestamp, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "Zero maxAge should skip staleness check even with future timestamp"
        );
    }

    function test_allBitsFeedHash() public view {
        bytes32 feedHash = bytes32(type(uint256).max);
        bytes memory sig = _signFeedHashDefault(feedHash, ORACLE_PK);

        assertTrue(
            wrapper.verify(feedHash, sig, oracleSigner, DEFAULT_TIMESTAMP, DEFAULT_CHAIN_ID, DEFAULT_VAULT, 0),
            "All-bits feed hash should verify"
        );
    }
}
