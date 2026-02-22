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

    /// @notice ecrecover returned address(0)
    error ECRecoverFailed();

    /// @notice Recovered signer does not match expected oracle signer
    error SignerMismatch(address recovered, address expected);

    // ============ Functions ============

    /// @notice Verify an ECDSA signature over a feed hash (view, does not revert)
    /// @param feedHash SHA-256 hash of the oracle price feed body
    /// @param signature 65-byte ECDSA signature (r[32] || s[32] || v[1])
    /// @param expectedSigner The trusted oracle signer address
    /// @return True if the signature is valid and matches expectedSigner
    function verifyOracleSignature(
        bytes32 feedHash,
        bytes memory signature,
        address expectedSigner
    ) internal pure returns (bool) {
        if (signature.length != 65) return false;

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v != 27 && v != 28) return false;

        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", feedHash)
        );

        address recovered = ecrecover(ethSignedHash, v, r, s);
        if (recovered == address(0)) return false;

        return recovered == expectedSigner;
    }

    /// @notice Verify an ECDSA signature over a feed hash (reverts on failure)
    /// @param feedHash SHA-256 hash of the oracle price feed body
    /// @param signature 65-byte ECDSA signature (r[32] || s[32] || v[1])
    /// @param expectedSigner The trusted oracle signer address
    function requireValidOracleSignature(
        bytes32 feedHash,
        bytes memory signature,
        address expectedSigner
    ) internal pure {
        if (signature.length != 65) {
            revert InvalidSignatureLength(signature.length);
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

        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", feedHash)
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
