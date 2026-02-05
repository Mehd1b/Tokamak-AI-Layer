// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockTEEProvider
 * @notice Mock contract for testing TEE attestation verification
 * @dev Simulates TEE attestation validation for deterministic testing
 */
contract MockTEEProvider {
    mapping(address => bool) public trustedSigners;
    mapping(address => bytes32) public enclaveHashes;
    bool public shouldVerify;

    event AttestationVerified(address indexed teeSigner, bytes32 enclaveHash);
    event SignerAdded(address indexed signer, bytes32 enclaveHash);
    event SignerRemoved(address indexed signer);

    constructor() {
        shouldVerify = true;
    }

    /// @notice Verify a TEE attestation
    function verifyAttestation(
        bytes32 enclaveHash,
        bytes32 inputHash,
        bytes32 outputHash,
        bytes32 requestHash,
        uint256 timestamp,
        address teeSigner,
        bytes calldata signature
    ) external view returns (bool) {
        if (!shouldVerify) return false;
        if (!trustedSigners[teeSigner]) return false;
        if (enclaveHashes[teeSigner] != enclaveHash) return false;

        // In a real implementation, verify the signature
        // For testing, we just check trust status
        // Suppress unused variable warnings
        inputHash; outputHash; requestHash; timestamp; signature;

        return true;
    }

    /// @notice Check if a TEE signer is trusted
    function isTrustedSigner(address teeSigner) external view returns (bool) {
        return trustedSigners[teeSigner];
    }

    /// @notice Get enclave hash for a provider
    function getEnclaveHash(address provider) external view returns (bytes32) {
        return enclaveHashes[provider];
    }

    // ============ Test Helpers ============

    /// @notice Add a trusted TEE signer
    function addTrustedSigner(address signer, bytes32 enclaveHash) external {
        trustedSigners[signer] = true;
        enclaveHashes[signer] = enclaveHash;
        emit SignerAdded(signer, enclaveHash);
    }

    /// @notice Remove a trusted TEE signer
    function removeTrustedSigner(address signer) external {
        trustedSigners[signer] = false;
        delete enclaveHashes[signer];
        emit SignerRemoved(signer);
    }

    /// @notice Set whether verification should pass or fail
    function setShouldVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }
}
