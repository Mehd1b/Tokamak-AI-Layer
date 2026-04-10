// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IKycVerifier
/// @notice Interface for external KYC verification contracts
interface IKycVerifier {
    /// @notice Check if a user has been KYC-verified
    /// @param user The address to check
    /// @return True if the user is verified
    function isVerified(address user) external view returns (bool);
}

/// @title VaultAccessControl
/// @notice Optional extension that vault deployers attach to a vault to enforce
///         whitelist, per-address deposit caps, and external KYC verification.
/// @dev    Deploy this contract with the vault address, then configure the desired
///         gates. Call `canDeposit(user, amount)` before accepting a deposit.
contract VaultAccessControl {
    // ============ State ============

    /// @notice The vault this access control is bound to
    address public immutable vault;

    /// @notice Contract owner (typically the vault deployer / agent author)
    address public owner;

    // --- Whitelist ---

    /// @notice Whether whitelist mode is enabled
    bool public whitelistEnabled;

    /// @notice Whitelisted addresses
    mapping(address => bool) public whitelisted;

    // --- Deposit Caps ---

    /// @notice Whether deposit cap mode is enabled
    bool public depositCapEnabled;

    /// @notice Default per-address deposit cap (0 = no default cap)
    uint256 public defaultDepositCap;

    /// @notice Per-address deposit cap overrides (0 = use default)
    mapping(address => uint256) public depositCaps;

    /// @notice Cumulative deposited amount per address (for cap tracking)
    mapping(address => uint256) public deposited;

    // --- KYC Verifier ---

    /// @notice Whether KYC verifier mode is enabled
    bool public kycVerifierEnabled;

    /// @notice External KYC verifier contract
    IKycVerifier public kycVerifier;

    // ============ Events ============

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when whitelist mode is toggled
    event WhitelistEnabledUpdated(bool enabled);

    /// @notice Emitted when addresses are added to the whitelist
    event WhitelistAdded(address[] accounts);

    /// @notice Emitted when addresses are removed from the whitelist
    event WhitelistRemoved(address[] accounts);

    /// @notice Emitted when deposit cap mode is toggled
    event DepositCapEnabledUpdated(bool enabled);

    /// @notice Emitted when a per-address deposit cap is set
    event DepositCapSet(address indexed account, uint256 maxAssets);

    /// @notice Emitted when the default deposit cap is set
    event DefaultDepositCapSet(uint256 maxAssets);

    /// @notice Emitted when the KYC verifier mode is toggled
    event KycVerifierEnabledUpdated(bool enabled);

    /// @notice Emitted when the KYC verifier contract is updated
    event KycVerifierSet(address indexed verifier);

    /// @notice Emitted when deposited amount is recorded for a user
    event DepositRecorded(address indexed user, uint256 amount, uint256 totalDeposited);

    // ============ Errors ============

    /// @notice Caller is not the owner
    error NotOwner();

    /// @notice Zero address is not allowed
    error ZeroAddress();

    /// @notice Empty array provided
    error EmptyArray();

    /// @notice Verifier address has no code (not a contract)
    error NotAContract(address addr);

    // ============ Modifiers ============

    /// @notice Restricts function access to the contract owner
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the access control extension for a vault
    /// @param vault_ The vault address this access control is bound to
    constructor(address vault_) {
        if (vault_ == address(0)) revert ZeroAddress();
        vault = vault_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============ Owner Functions ============

    /// @notice Transfer ownership to a new address
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // --- Whitelist Management ---

    /// @notice Enable or disable whitelist mode
    /// @param enabled Whether whitelist mode should be enabled
    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistEnabledUpdated(enabled);
    }

    /// @notice Add addresses to the whitelist
    /// @param accounts The addresses to whitelist
    function addToWhitelist(address[] calldata accounts) external onlyOwner {
        if (accounts.length == 0) revert EmptyArray();
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelisted[accounts[i]] = true;
        }
        emit WhitelistAdded(accounts);
    }

    /// @notice Remove addresses from the whitelist
    /// @param accounts The addresses to remove
    function removeFromWhitelist(address[] calldata accounts) external onlyOwner {
        if (accounts.length == 0) revert EmptyArray();
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelisted[accounts[i]] = false;
        }
        emit WhitelistRemoved(accounts);
    }

    // --- Deposit Cap Management ---

    /// @notice Enable or disable deposit cap mode
    /// @param enabled Whether deposit cap mode should be enabled
    function setDepositCapEnabled(bool enabled) external onlyOwner {
        depositCapEnabled = enabled;
        emit DepositCapEnabledUpdated(enabled);
    }

    /// @notice Set a per-address deposit cap override
    /// @param account The address to set the cap for
    /// @param maxAssets The maximum deposit amount (0 = use default cap)
    function setDepositCap(address account, uint256 maxAssets) external onlyOwner {
        depositCaps[account] = maxAssets;
        emit DepositCapSet(account, maxAssets);
    }

    /// @notice Set the default per-address deposit cap
    /// @param maxAssets The default maximum deposit amount
    function setDefaultDepositCap(uint256 maxAssets) external onlyOwner {
        defaultDepositCap = maxAssets;
        emit DefaultDepositCapSet(maxAssets);
    }

    // --- KYC Verifier Management ---

    /// @notice Enable or disable KYC verifier mode
    /// @param enabled Whether KYC verifier mode should be enabled
    function setKycVerifierEnabled(bool enabled) external onlyOwner {
        kycVerifierEnabled = enabled;
        emit KycVerifierEnabledUpdated(enabled);
    }

    /// @notice Set the external KYC verifier contract
    /// @param verifier The KYC verifier contract address (must implement isVerified)
    function setKycVerifier(address verifier) external onlyOwner {
        if (verifier == address(0)) revert ZeroAddress();
        if (verifier.code.length == 0) revert NotAContract(verifier);
        kycVerifier = IKycVerifier(verifier);
        emit KycVerifierSet(verifier);
    }

    // ============ Deposit Recording ============

    /// @notice Record a deposit for cap tracking. Can be called by the vault or owner.
    /// @param user The depositor address
    /// @param amount The deposit amount
    function recordDeposit(address user, uint256 amount) external {
        require(msg.sender == vault || msg.sender == owner, "not vault or owner");
        deposited[user] += amount;
        emit DepositRecorded(user, amount, deposited[user]);
    }

    /// @notice Record a withdrawal to release deposit-cap capacity (M-22 fix).
    /// @dev Previously, the `deposited` counter monotonically increased — a user
    ///      who deposited up to their cap could never re-deposit even after a
    ///      full withdrawal. This function lets the vault (or owner) mirror
    ///      withdrawals back into the counter so the cap behaves as
    ///      "current balance" rather than "lifetime total".
    /// @param user The depositor address
    /// @param amount The withdrawal amount
    function recordWithdrawal(address user, uint256 amount) external {
        require(msg.sender == vault || msg.sender == owner, "not vault or owner");
        uint256 current = deposited[user];
        if (amount >= current) {
            deposited[user] = 0;
        } else {
            deposited[user] = current - amount;
        }
        emit DepositRecorded(user, 0, deposited[user]);
    }

    // ============ View Functions ============

    /// @notice Check if a user can deposit a given amount, considering all enabled gates
    /// @param user The user address
    /// @param amount The deposit amount
    /// @return True if the deposit should be allowed
    function canDeposit(address user, uint256 amount) external view returns (bool) {
        // Gate 1: Whitelist
        if (whitelistEnabled) {
            if (!whitelisted[user]) return false;
        }

        // Gate 2: Deposit cap
        if (depositCapEnabled) {
            uint256 cap = depositCaps[user];
            if (cap == 0) cap = defaultDepositCap;
            // If cap is still 0, no cap is enforced for this user
            if (cap > 0) {
                if (deposited[user] + amount > cap) return false;
            }
        }

        // Gate 3: KYC verifier
        if (kycVerifierEnabled) {
            if (address(kycVerifier) == address(0)) return false;
            if (!kycVerifier.isVerified(user)) return false;
        }

        return true;
    }

    /// @notice Get the effective deposit cap for a user
    /// @param user The user address
    /// @return The effective cap (0 = no cap)
    function getEffectiveCap(address user) external view returns (uint256) {
        uint256 cap = depositCaps[user];
        if (cap == 0) cap = defaultDepositCap;
        return cap;
    }

    /// @notice Get remaining deposit allowance for a user
    /// @param user The user address
    /// @return The remaining amount the user can deposit (type(uint256).max if no cap)
    function getRemainingAllowance(address user) external view returns (uint256) {
        if (!depositCapEnabled) return type(uint256).max;
        uint256 cap = depositCaps[user];
        if (cap == 0) cap = defaultDepositCap;
        if (cap == 0) return type(uint256).max;
        if (deposited[user] >= cap) return 0;
        return cap - deposited[user];
    }
}
