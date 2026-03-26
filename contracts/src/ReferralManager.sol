// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title ReferralManager
/// @notice Standalone referral system for tracking deposit attributions and awarding points.
/// @dev Non-upgradeable. Referral codes are stored as keccak256 hashes of plaintext strings.
///      A depositor can only be referred once (first referral sticks). Points are awarded to
///      the referrer for each referred deposit.
contract ReferralManager {
    // ============ State ============

    /// @notice Contract owner (can update pointsPerDeposit)
    address public owner;

    /// @notice Points awarded to the referrer for each referred deposit
    uint256 public pointsPerDeposit;

    /// @notice Code hash → referrer address
    mapping(bytes32 => address) public referralCodes;

    /// @notice Referrer address → their code hash (one code per address)
    mapping(address => bytes32) public referrerCode;

    /// @notice Referrer address → accumulated referral points
    mapping(address => uint256) public referralPoints;

    /// @notice Depositor address → referrer address (first referral only)
    mapping(address => address) public referredBy;

    /// @notice Referrer address → total number of referred depositors
    mapping(address => uint256) public referralCount;

    /// @notice Referrer address → array of referred depositor addresses
    mapping(address => address[]) internal _referrals;

    // ============ Events ============

    /// @notice Emitted when a referral code is registered
    event CodeRegistered(address indexed referrer, bytes32 indexed codeHash);

    /// @notice Emitted when a referred deposit is recorded
    event ReferralRecorded(
        address indexed depositor,
        address indexed referrer,
        bytes32 indexed codeHash,
        uint256 points
    );

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when pointsPerDeposit is updated
    event PointsPerDepositUpdated(uint256 oldValue, uint256 newValue);

    // ============ Errors ============

    /// @notice Caller is not the owner
    error NotOwner();

    /// @notice Referral code already taken by another address
    error CodeAlreadyTaken();

    /// @notice Caller already has a registered code
    error AlreadyHasCode();

    /// @notice Referral code is empty
    error EmptyCode();

    /// @notice Code hash does not map to any referrer
    error InvalidCode();

    /// @notice Depositor cannot refer themselves
    error SelfReferral();

    /// @notice Depositor has already been referred
    error AlreadyReferred();

    // ============ Constructor ============

    /// @param _pointsPerDeposit Initial points awarded per referred deposit
    constructor(uint256 _pointsPerDeposit) {
        owner = msg.sender;
        pointsPerDeposit = _pointsPerDeposit;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ============ Owner Functions ============

    /// @notice Transfer ownership to a new address
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Update points awarded per referred deposit
    /// @param _pointsPerDeposit New points value
    function setPointsPerDeposit(uint256 _pointsPerDeposit) external onlyOwner {
        uint256 old = pointsPerDeposit;
        pointsPerDeposit = _pointsPerDeposit;
        emit PointsPerDepositUpdated(old, _pointsPerDeposit);
    }

    // ============ Public Functions ============

    /// @notice Register a referral code for the caller
    /// @param code The plaintext referral code (will be hashed with keccak256)
    function registerCode(string calldata code) external {
        if (bytes(code).length == 0) revert EmptyCode();
        if (referrerCode[msg.sender] != bytes32(0)) revert AlreadyHasCode();

        bytes32 codeHash = keccak256(abi.encodePacked(code));
        if (referralCodes[codeHash] != address(0)) revert CodeAlreadyTaken();

        referralCodes[codeHash] = msg.sender;
        referrerCode[msg.sender] = codeHash;

        emit CodeRegistered(msg.sender, codeHash);
    }

    /// @notice Record a referred deposit. Can be called by anyone (typically the depositor or the
    ///         frontend relayer after a vault deposit).
    /// @param depositor The address that made the deposit
    /// @param codeHash The keccak256 hash of the referral code used
    function recordReferral(address depositor, bytes32 codeHash) external {
        address referrer = referralCodes[codeHash];
        if (referrer == address(0)) revert InvalidCode();
        if (depositor == referrer) revert SelfReferral();
        if (referredBy[depositor] != address(0)) revert AlreadyReferred();

        referredBy[depositor] = referrer;
        referralCount[referrer] += 1;
        referralPoints[referrer] += pointsPerDeposit;
        _referrals[referrer].push(depositor);

        emit ReferralRecorded(depositor, referrer, codeHash, pointsPerDeposit);
    }

    // ============ View Functions ============

    /// @notice Get referral points for a referrer
    /// @param referrer The referrer address
    /// @return points The total accumulated referral points
    function getPoints(address referrer) external view returns (uint256 points) {
        return referralPoints[referrer];
    }

    /// @notice Get who referred a depositor
    /// @param depositor The depositor address
    /// @return referrer The referrer address (address(0) if not referred)
    function getReferrer(address depositor) external view returns (address referrer) {
        return referredBy[depositor];
    }

    /// @notice Resolve a plaintext referral code to the referrer address
    /// @param code The plaintext referral code
    /// @return referrer The referrer address (address(0) if code not registered)
    function resolveCode(string calldata code) external view returns (address referrer) {
        bytes32 codeHash = keccak256(abi.encodePacked(code));
        return referralCodes[codeHash];
    }

    /// @notice Get all depositor addresses referred by a referrer
    /// @param referrer The referrer address
    /// @return depositors Array of depositor addresses
    function getReferrals(address referrer) external view returns (address[] memory depositors) {
        return _referrals[referrer];
    }

    /// @notice Compute the keccak256 hash of a referral code (helper for frontends)
    /// @param code The plaintext referral code
    /// @return codeHash The keccak256 hash
    function hashCode(string calldata code) external pure returns (bytes32 codeHash) {
        return keccak256(abi.encodePacked(code));
    }
}
