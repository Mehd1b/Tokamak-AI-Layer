// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IPriceFeedAttestation
/// @notice Interface for on-chain attestation of price feed data used by zkVM agents.
///         Attestors submit Merkle roots over raw price candle arrays. The Merkle root
///         is used as `input_root` in KernelInputV1, binding the zkVM proof to verified
///         price data and closing the trust gap between "proven execution" and "proven inputs".
///
/// @dev Attestation flow:
///      1. Host fetches candles from Hyperliquid API
///      2. Host builds Merkle tree: leaf[i] = keccak256(abi.encodePacked(timestamp, open, high, low, close, volume))
///      3. Host calls submitAttestation(root, metadata) — root is stored on-chain
///      4. Host uses the same root as `input_root` when building KernelInputV1
///      5. zkVM proof commits `input_root` into the journal
///      6. On-chain verifier checks: journal.input_root exists in PriceFeedAttestation
interface IPriceFeedAttestation {
    // ============ Structs ============

    /// @notice Metadata for a price feed attestation
    /// @param asset The Hyperliquid perp asset index (BTC=0, ETH=1, etc.)
    /// @param timeframe Candle timeframe in seconds (e.g., 14400 for 4h candles)
    /// @param candleCount Number of candles in the Merkle tree
    /// @param startTimestamp Timestamp of the first candle
    /// @param endTimestamp Timestamp of the last candle
    /// @param attestor Address of the attestor who submitted the root
    /// @param blockTimestamp Block timestamp when attestation was submitted
    struct Attestation {
        uint32 asset;
        uint32 timeframe;
        uint32 candleCount;
        uint64 startTimestamp;
        uint64 endTimestamp;
        address attestor;
        uint64 blockTimestamp;
    }

    // ============ Events ============

    /// @notice Emitted when a new price feed attestation is submitted
    event AttestationSubmitted(
        bytes32 indexed merkleRoot,
        uint32 indexed asset,
        uint32 timeframe,
        uint32 candleCount,
        uint64 startTimestamp,
        uint64 endTimestamp,
        address indexed attestor
    );

    /// @notice Emitted when an attestor is authorized
    event AttestorAuthorized(address indexed attestor);

    /// @notice Emitted when an attestor is revoked
    event AttestorRevoked(address indexed attestor);

    // ============ Errors ============

    /// @notice Caller is not an authorized attestor
    error UnauthorizedAttestor();

    /// @notice Caller is not the owner
    error NotOwner();

    /// @notice Merkle root is zero
    error ZeroMerkleRoot();

    /// @notice Invalid candle count (must be > 0)
    error InvalidCandleCount();

    /// @notice Invalid time range (end must be > start)
    error InvalidTimeRange();

    /// @notice Attestation already exists for this root
    error AttestationAlreadyExists();

    /// @notice Zero address provided
    error ZeroAddress();

    // ============ Write Functions ============

    /// @notice Submit a price feed attestation
    /// @param merkleRoot Merkle root over the candle data array
    /// @param asset Hyperliquid perp asset index
    /// @param timeframe Candle timeframe in seconds
    /// @param candleCount Number of candles in the tree
    /// @param startTimestamp First candle timestamp
    /// @param endTimestamp Last candle timestamp
    function submitAttestation(
        bytes32 merkleRoot,
        uint32 asset,
        uint32 timeframe,
        uint32 candleCount,
        uint64 startTimestamp,
        uint64 endTimestamp
    ) external;

    /// @notice Authorize an address to submit attestations
    /// @param attestor The address to authorize
    function authorizeAttestor(address attestor) external;

    /// @notice Revoke an attestor's authorization
    /// @param attestor The address to revoke
    function revokeAttestor(address attestor) external;

    // ============ View Functions ============

    /// @notice Check if a Merkle root has been attested
    /// @param merkleRoot The root to check
    /// @return True if the root has a valid attestation
    function isAttested(bytes32 merkleRoot) external view returns (bool);

    /// @notice Get the full attestation for a Merkle root
    /// @param merkleRoot The root to query
    /// @return The attestation metadata
    function getAttestation(bytes32 merkleRoot) external view returns (Attestation memory);

    /// @notice Check if an address is an authorized attestor
    /// @param attestor The address to check
    /// @return True if authorized
    function isAuthorizedAttestor(address attestor) external view returns (bool);

    /// @notice Verify that an input_root from a zkVM journal is attested
    /// @dev Convenience function for KernelVault or verifier integration
    /// @param inputRoot The input_root from KernelJournalV1
    /// @param expectedAsset The expected asset index
    /// @return True if the root is attested for the expected asset
    function verifyInputRoot(bytes32 inputRoot, uint32 expectedAsset) external view returns (bool);
}
