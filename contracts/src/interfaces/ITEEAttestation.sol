// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITEEAttestation
 * @notice Interface for verifying Trusted Execution Environment attestations
 * @dev Supports Intel SGX, AWS Nitro Enclaves, and ARM TrustZone
 */
interface ITEEAttestation {
    /// @notice TEE provider types
    enum TEEType { SGX, NITRO, TRUSTZONE }

    /// @notice Attestation data structure
    struct Attestation {
        TEEType teeType;
        bytes32 enclaveHash;       // Measurement of the enclave code
        bytes32 inputHash;         // Hash of task inputs
        bytes32 outputHash;        // Hash of task outputs
        uint256 timestamp;         // When attestation was generated
        address teeSigner;         // Address derived from TEE key
        bytes signature;           // Signature over attestation data
    }

    /// @notice Verify a TEE attestation
    /// @param attestation The attestation data to verify
    /// @return valid True if the attestation is valid
    function verifyAttestation(Attestation calldata attestation) external view returns (bool valid);

    /// @notice Check if a TEE signer is from a trusted provider
    /// @param teeSigner The TEE signer address
    /// @return True if the signer is trusted
    function isTrustedSigner(address teeSigner) external view returns (bool);

    /// @notice Get the enclave hash for a trusted provider
    /// @param provider The provider address
    /// @return The expected enclave measurement hash
    function getEnclaveHash(address provider) external view returns (bytes32);
}
