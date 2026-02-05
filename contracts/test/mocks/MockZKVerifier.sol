// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockZKVerifier
 * @notice Mock contract for testing ZK proof verification
 * @dev Provides simulated zero-knowledge proof verification for testing without actual cryptographic operations
 */
contract MockZKVerifier {
    bool public defaultVerifyResult = true;
    mapping(bytes32 => bool) public proofResults;

    event ProofVerified(bytes32 indexed proofHash, bool result);

    /**
     * @notice Verify an identity commitment proof
     * @param commitment The identity commitment
     * @param proof The proof data
     * @param publicInputs The public inputs for the proof
     * @return True if the proof is valid
     */
    function verifyIdentityCommitment(
        bytes32 commitment,
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        bytes32 proofHash = keccak256(abi.encodePacked(commitment, proof, publicInputs));
        if (proofResults[proofHash]) return true;
        return defaultVerifyResult;
    }

    /**
     * @notice Verify a capability proof
     * @param commitment The identity commitment
     * @param capabilityHash The hash of the capability being proven
     * @param proof The proof data
     * @return True if the proof is valid
     */
    function verifyCapabilityProof(
        bytes32 commitment,
        bytes32 capabilityHash,
        bytes calldata proof
    ) external view returns (bool) {
        bytes32 proofHash = keccak256(abi.encodePacked(commitment, capabilityHash, proof));
        if (proofResults[proofHash]) return true;
        return defaultVerifyResult;
    }

    /**
     * @notice Verify a reputation threshold proof
     * @param merkleRoot The merkle root of the reputation tree
     * @param threshold The reputation threshold being proven
     * @param proof The proof data
     * @return True if the proof is valid
     */
    function verifyReputationThreshold(
        bytes32 merkleRoot,
        uint256 threshold,
        bytes calldata proof
    ) external view returns (bool) {
        bytes32 proofHash = keccak256(abi.encodePacked(merkleRoot, threshold, proof));
        if (proofResults[proofHash]) return true;
        return defaultVerifyResult;
    }

    /**
     * @notice Test helper to set the default verification result
     * @param result The result to return by default
     */
    function setDefaultVerifyResult(bool result) external {
        defaultVerifyResult = result;
    }

    /**
     * @notice Test helper to set a specific proof result
     * @param proofHash The hash of the proof
     * @param result The result to return for this proof
     */
    function setProofResult(bytes32 proofHash, bool result) external {
        proofResults[proofHash] = result;
    }
}
