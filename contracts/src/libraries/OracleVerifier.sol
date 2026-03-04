// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title OracleVerifier
/// @notice Library for verifying ECDSA oracle signatures over price feed hashes.
/// @dev The oracle signs `keccak256("\x19Ethereum Signed Message:\n32" || feedHash)` (EIP-191).
///      On-chain cost: ~5k gas via ecrecover precompile.
library OracleVerifier {
    // ============ Errors ============

    /// @notice Signature length is not 65 bytes
    error InvalidSignatureLength(uint256 length);

    /// @notice Recovery ID (v) is not 27 or 28
    error InvalidRecoveryId(uint8 v);

    /// @notice Signature s value is in the upper half (EIP-2 malleability protection)
    error InvalidSValue();

    /// @notice ecrecover returned address(0)
    error ECRecoverFailed();

    /// @notice Recovered signer does not match expected oracle signer
    error SignerMismatch(address recovered, address expected);

    /// @notice Oracle data is stale (too old)
    error OracleDataStale(uint64 oracleTimestamp, uint64 maxAge, uint256 blockTimestamp);

    // ============ Functions ============

    /// @notice Verify an ECDSA signature over a feed hash (view, does not revert)
    /// @param feedHash SHA-256 hash of the oracle price feed body
    /// @param signature 65-byte ECDSA signature (r[32] || s[32] || v[1])
    /// @param expectedSigner The trusted oracle signer address
    /// @param oracleTimestamp Timestamp of the oracle data
    /// @param chainId Chain ID to bind the signature to
    /// @param vaultAddress Vault address to bind the signature to
    /// @param maxOracleAge Maximum age of oracle data in seconds (0 = no age check)
    /// @return True if the signature is valid and matches expectedSigner
    function verifyOracleSignature(
        bytes32 feedHash,
        bytes memory signature,
        address expectedSigner,
        uint64 oracleTimestamp,
        uint256 chainId,
        address vaultAddress,
        uint64 maxOracleAge
    ) internal view returns (bool) {
        if (signature.length != 65) return false;

        // Check freshness (guard against future timestamps to prevent underflow)
        if (maxOracleAge > 0 && (oracleTimestamp > block.timestamp || block.timestamp - oracleTimestamp > maxOracleAge)) return false;

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v != 27 && v != 28) return false;

        // EIP-2: reject upper-range s values to prevent signature malleability
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return false;

        // Include timestamp, chainId, and vaultAddress in signed message to prevent replay
        bytes32 domainFeedHash = keccak256(abi.encodePacked(feedHash, oracleTimestamp, chainId, vaultAddress));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", domainFeedHash)
        );

        address recovered = ecrecover(ethSignedHash, v, r, s);
        if (recovered == address(0)) return false;

        return recovered == expectedSigner;
    }

    /// @notice Verify an ECDSA signature over a feed hash (reverts on failure)
    /// @param feedHash SHA-256 hash of the oracle price feed body
    /// @param signature 65-byte ECDSA signature (r[32] || s[32] || v[1])
    /// @param expectedSigner The trusted oracle signer address
    /// @param oracleTimestamp Timestamp of the oracle data
    /// @param chainId Chain ID to bind the signature to
    /// @param vaultAddress Vault address to bind the signature to
    /// @param maxOracleAge Maximum age of oracle data in seconds (0 = no age check)
    function requireValidOracleSignature(
        bytes32 feedHash,
        bytes memory signature,
        address expectedSigner,
        uint64 oracleTimestamp,
        uint256 chainId,
        address vaultAddress,
        uint64 maxOracleAge
    ) internal view {
        if (signature.length != 65) {
            revert InvalidSignatureLength(signature.length);
        }

        // Check freshness (guard against future timestamps to prevent underflow)
        if (maxOracleAge > 0 && (oracleTimestamp > block.timestamp || block.timestamp - oracleTimestamp > maxOracleAge)) {
            revert OracleDataStale(oracleTimestamp, maxOracleAge, block.timestamp);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v != 27 && v != 28) {
            revert InvalidRecoveryId(v);
        }

        // EIP-2: reject upper-range s values to prevent signature malleability
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert InvalidSValue();
        }

        // Include timestamp, chainId, and vaultAddress in signed message to prevent replay
        bytes32 domainFeedHash = keccak256(abi.encodePacked(feedHash, oracleTimestamp, chainId, vaultAddress));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", domainFeedHash)
        );

        address recovered = ecrecover(ethSignedHash, v, r, s);
        if (recovered == address(0)) {
            revert ECRecoverFailed();
        }

        if (recovered != expectedSigner) {
            revert SignerMismatch(recovered, expectedSigner);
        }
    }
}
