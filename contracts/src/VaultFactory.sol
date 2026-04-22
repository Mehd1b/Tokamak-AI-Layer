// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IVaultFactory } from "./interfaces/IVaultFactory.sol";
import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @title VaultFactory
/// @notice Factory for deploying KernelVault and OptimisticKernelVault instances with CREATE2
/// @dev Deploys vaults with imageId pinned from AgentRegistry at deployment time.
///      Registry updates do NOT affect already-deployed vaults.
///      Uses UUPS proxy pattern for upgradeability.
contract VaultFactory is IVaultFactory, Initializable, UUPSUpgradeable {
    // ============ State ============

    /// @notice The AgentRegistry contract
    IAgentRegistry public _registry;

    /// @notice The KernelExecutionVerifier contract address
    address public _verifier;

    /// @notice Mapping of deployed vault addresses
    mapping(address => bool) public isDeployedVault;

    /// @notice Ordered list of all deployed vault addresses
    address[] private _deployedVaults;

    /// @notice Contract owner (authorized to upgrade)
    address private _owner;

    /// @notice Contract whose runtime bytecode is KernelVault creation code
    address public _vaultCreationCodeStore;

    /// @notice Mapping from agentId to all vault addresses deployed for that agent
    mapping(bytes32 => address[]) internal _agentVaults;

    /// @notice Contract whose runtime bytecode is OptimisticKernelVault creation code
    address public _optimisticVaultCreationCodeStore;

    /// @notice Protocol type for each vault (0=Generic, 1=Hyperliquid, 2=Polymarket)
    mapping(address => uint8) public _vaultProtocolType;

    /// @notice Protocol treasury address for fee collection
    address public protocolTreasury;

    /// @notice Default protocol fee split in basis points (e.g., 1000 = 10%)
    uint256 public defaultProtocolFeeSplitBps;

    // ─────────────────────────────────────────────────────────────────────
    // UUPS implementation-upgrade timelock state
    // ─────────────────────────────────────────────────────────────────────
    // The factory proxy is upgradable by its owner. The previous
    // `_authorizeUpgrade` implementation was an `onlyOwner` no-op, meaning
    // a single compromised deployer key could swap the whole factory
    // implementation in one block. The new pattern requires a candidate
    // implementation to be scheduled via `scheduleImplementation` and to
    // sit for at least `UPGRADE_DELAY` before the upgrade transaction can
    // take effect. This gives depositors and monitoring tooling a visible
    // window to react to a pending upgrade.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Mandatory delay between scheduling and activating a UUPS upgrade.
    uint256 public constant UPGRADE_DELAY = 48 hours;

    /// @notice Implementation contract currently scheduled for upgrade.
    address public pendingImplementation;

    /// @notice Earliest `block.timestamp` at which the pending implementation
    ///         may be activated.
    uint256 public pendingImplementationActivatesAt;

    /// @notice Proposed owner awaiting acceptance (two-step ownership transfer).
    address public pendingOwner;

    // ─────────────────────────────────────────────────────────────────────
    // Code store swap timelock state
    // ─────────────────────────────────────────────────────────────────────
    // setVaultCreationCodeStore and setOptimisticVaultCreationCodeStore were
    // simple onlyOwner setters with no timelock. A compromised owner key could
    // swap the bytecode and deploy malicious vaults instantly. These now use
    // the same schedule-then-activate pattern as UUPS upgrades.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Pending new vault creation code store awaiting timelock.
    address public pendingVaultCodeStore;
    uint256 public pendingVaultCodeStoreActivatesAt;

    /// @notice Pending new optimistic vault creation code store awaiting timelock.
    address public pendingOptimisticVaultCodeStore;
    uint256 public pendingOptimisticVaultCodeStoreActivatesAt;

    /// @notice Storage gap for future upgrades. Reduced from 40 → 33 slots
    ///         to accommodate the new state above.
    uint256[33] private __gap;

    // ============ Errors ============

    /// @notice Caller is not the owner
    error OwnableUnauthorizedAccount(address account);

    /// @notice Upgrade attempted without a matching scheduled proposal
    error UpgradeNotScheduled(address attempted);

    /// @notice Upgrade attempted before the scheduling timelock elapsed
    error UpgradeTimelockNotElapsed(uint256 currentTime, uint256 activatesAt);

    /// @notice No implementation upgrade is currently pending
    error NoPendingImplementation();

    /// @notice Ownership acceptance attempted by the wrong caller
    error NotPendingOwner(address caller, address expected);

    /// @notice No pending ownership transfer exists
    error NoPendingOwner();

    /// @notice Zero implementation address
    error ZeroImplementation();

    // ============ Events ============

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when protocol treasury is updated
    event ProtocolTreasuryUpdated(address indexed treasury);

    /// @notice Emitted when default protocol fee split is updated
    event DefaultProtocolFeeSplitUpdated(uint256 splitBps);

    /// @notice Emitted when a UUPS implementation upgrade is scheduled.
    event ImplementationScheduled(address indexed implementation, uint256 activatesAt);

    /// @notice Emitted when a scheduled UUPS upgrade is cancelled.
    event ImplementationCancelled(address indexed implementation);

    /// @notice Emitted when an ownership transfer is proposed.
    event OwnershipTransferProposed(address indexed currentOwner, address indexed proposedOwner);

    // ============ Modifiers ============

    /// @notice Restricts function access to the contract owner
    modifier onlyOwner() {
        if (msg.sender != _owner) revert OwnableUnauthorizedAccount(msg.sender);
        _;
    }

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Initializer ============

    /// @notice Initialize the factory (called once via proxy)
    /// @param registry_ The AgentRegistry contract address
    /// @param verifier_ The KernelExecutionVerifier contract address
    /// @param initialOwner The address that will own this contract
    /// @param vaultCodeStore_ The VaultCreationCodeStore contract address
    function initialize(
        address registry_,
        address verifier_,
        address initialOwner,
        address vaultCodeStore_
    ) external initializer {
        require(registry_ != address(0), "zero registry");
        require(verifier_ != address(0), "zero verifier");
        require(initialOwner != address(0), "zero owner");
        require(vaultCodeStore_ != address(0), "zero vaultCodeStore");
        _registry = IAgentRegistry(registry_);
        _verifier = verifier_;
        _owner = initialOwner;
        _vaultCreationCodeStore = vaultCodeStore_;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ============ Owner Functions ============

    /// @notice Returns the current owner
    function owner() external view returns (address) {
        return _owner;
    }

    /// @notice Propose a new owner. Completes only when the proposed
    ///         owner explicitly calls `acceptOwnership`. Pass address(0)
    ///         to cancel a pending proposal.
    /// @param newOwner The proposed owner address
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(_owner, newOwner);
    }

    /// @notice Accept a pending ownership transfer. Callable only by the
    ///         proposed owner. Proves they control the key before
    ///         completing the transfer.
    function acceptOwnership() external {
        address proposed = pendingOwner;
        if (proposed == address(0)) revert NoPendingOwner();
        if (msg.sender != proposed) revert NotPendingOwner(msg.sender, proposed);
        address previous = _owner;
        _owner = proposed;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, proposed);
    }

    // ============ UUPS Implementation Upgrade Scheduling ============
    //
    // Two-step UUPS upgrades: the owner schedules a candidate
    // implementation, waits `UPGRADE_DELAY`, then calls `upgradeTo` (or
    // `upgradeToAndCall`). The upgrade entry points call `_authorizeUpgrade`
    // which enforces that the exact candidate was scheduled and the
    // timelock has elapsed. Unscheduled upgrades revert.

    /// @notice Schedule a UUPS implementation upgrade. Overwrites any
    ///         previously pending upgrade.
    /// @param newImplementation Implementation contract to schedule.
    function scheduleImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroImplementation();
        pendingImplementation = newImplementation;
        pendingImplementationActivatesAt = block.timestamp + UPGRADE_DELAY;
        emit ImplementationScheduled(newImplementation, pendingImplementationActivatesAt);
    }

    /// @notice Cancel a scheduled UUPS upgrade before activation.
    function cancelImplementation() external onlyOwner {
        if (pendingImplementation == address(0)) revert NoPendingImplementation();
        emit ImplementationCancelled(pendingImplementation);
        pendingImplementation = address(0);
        pendingImplementationActivatesAt = 0;
    }

    /// @notice Authorize upgrade (only owner, scheduled, timelocked).
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // The implementation MUST have been scheduled at least
        // UPGRADE_DELAY ago. This prevents a single-transaction swap.
        if (newImplementation != pendingImplementation || newImplementation == address(0)) {
            revert UpgradeNotScheduled(newImplementation);
        }
        if (block.timestamp < pendingImplementationActivatesAt) {
            revert UpgradeTimelockNotElapsed(block.timestamp, pendingImplementationActivatesAt);
        }
        // Clear the pending slot; any subsequent upgrade requires a fresh
        // schedule + wait.
        pendingImplementation = address(0);
        pendingImplementationActivatesAt = 0;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Code store swap with timelock (schedule → wait → activate)
    // ──────────────────��─────────────────────────────────────��────────────

    /// @notice Set vault creation code store directly (only works for initial setup when current is zero).
    /// @dev For subsequent changes, use schedule + activate with timelock.
    function setVaultCreationCodeStore(address newStore) external onlyOwner {
        require(_vaultCreationCodeStore == address(0), "use schedule/activate");
        require(newStore != address(0), "zero vaultCodeStore");
        require(newStore.code.length > 0, "no code at store");
        _vaultCreationCodeStore = newStore;
        emit VaultCreationCodeStoreUpdated(newStore);
    }

    /// @notice Set optimistic vault creation code store directly (only works for initial setup when current is zero).
    function setOptimisticVaultCreationCodeStore(address newStore) external onlyOwner {
        require(_optimisticVaultCreationCodeStore == address(0), "use schedule/activate");
        require(newStore != address(0), "zero optimisticVaultCodeStore");
        require(newStore.code.length > 0, "no code at store");
        _optimisticVaultCreationCodeStore = newStore;
        emit OptimisticVaultCreationCodeStoreUpdated(newStore);
    }

    /// @notice Schedule a new VaultCreationCodeStore (begins timelock).
    function scheduleVaultCreationCodeStore(address newStore) external onlyOwner {
        require(newStore != address(0), "zero vaultCodeStore");
        require(newStore.code.length > 0, "no code at store");
        pendingVaultCodeStore = newStore;
        pendingVaultCodeStoreActivatesAt = block.timestamp + UPGRADE_DELAY;
        emit VaultCodeStoreScheduled(newStore, pendingVaultCodeStoreActivatesAt);
    }

    /// @notice Activate a previously scheduled VaultCreationCodeStore after timelock.
    function activateVaultCreationCodeStore() external onlyOwner {
        require(pendingVaultCodeStore != address(0), "no pending code store");
        require(block.timestamp >= pendingVaultCodeStoreActivatesAt, "timelock not elapsed");
        _vaultCreationCodeStore = pendingVaultCodeStore;
        emit VaultCreationCodeStoreUpdated(pendingVaultCodeStore);
        pendingVaultCodeStore = address(0);
        pendingVaultCodeStoreActivatesAt = 0;
    }

    /// @notice Schedule a new OptimisticVaultCreationCodeStore (begins timelock).
    function scheduleOptimisticVaultCreationCodeStore(address newStore) external onlyOwner {
        require(newStore != address(0), "zero optimisticVaultCodeStore");
        require(newStore.code.length > 0, "no code at store");
        pendingOptimisticVaultCodeStore = newStore;
        pendingOptimisticVaultCodeStoreActivatesAt = block.timestamp + UPGRADE_DELAY;
        emit OptimisticVaultCodeStoreScheduled(newStore, pendingOptimisticVaultCodeStoreActivatesAt);
    }

    /// @notice Activate a previously scheduled OptimisticVaultCreationCodeStore after timelock.
    function activateOptimisticVaultCreationCodeStore() external onlyOwner {
        require(pendingOptimisticVaultCodeStore != address(0), "no pending code store");
        require(block.timestamp >= pendingOptimisticVaultCodeStoreActivatesAt, "timelock not elapsed");
        _optimisticVaultCreationCodeStore = pendingOptimisticVaultCodeStore;
        emit OptimisticVaultCreationCodeStoreUpdated(pendingOptimisticVaultCodeStore);
        pendingOptimisticVaultCodeStore = address(0);
        pendingOptimisticVaultCodeStoreActivatesAt = 0;
    }

    event VaultCodeStoreScheduled(address indexed newStore, uint256 activatesAt);
    event OptimisticVaultCodeStoreScheduled(address indexed newStore, uint256 activatesAt);

    /// @notice Emitted when the vault creation code store is updated (I-06)
    event VaultCreationCodeStoreUpdated(address indexed newStore);

    /// @notice Emitted when the optimistic vault creation code store is updated (I-06)
    event OptimisticVaultCreationCodeStoreUpdated(address indexed newStore);

    /// @notice Set the protocol treasury address (owner only)
    /// @param treasury The new protocol treasury address
    /// @dev L-13: reject zero address — factory-deployed vaults inherit this
    ///      value and sending fees to address(0) burns them permanently.
    function setProtocolTreasury(address treasury) external onlyOwner {
        require(treasury != address(0), "zero treasury");
        protocolTreasury = treasury;
        emit ProtocolTreasuryUpdated(treasury);
    }

    /// @notice Set the default protocol fee split for new vaults (owner only)
    /// @param splitBps Default fee split in basis points (max 5000 = 50%)
    function setDefaultProtocolFeeSplitBps(uint256 splitBps) external onlyOwner {
        require(splitBps <= 5000, "split too high");
        defaultProtocolFeeSplitBps = splitBps;
        emit DefaultProtocolFeeSplitUpdated(splitBps);
    }

    // ============ External Functions ============

    /// @inheritdoc IVaultFactory
    function registry() external view returns (address) {
        return address(_registry);
    }

    /// @inheritdoc IVaultFactory
    function verifier() external view returns (address) {
        return _verifier;
    }

    /// @inheritdoc IVaultFactory
    function vaultCreationCodeStore() external view returns (address) {
        return _vaultCreationCodeStore;
    }

    /// @inheritdoc IVaultFactory
    function optimisticVaultCreationCodeStore() external view returns (address) {
        return _optimisticVaultCreationCodeStore;
    }

    /// @inheritdoc IVaultFactory
    function computeVaultAddress(address owner_, bytes32 agentId, address asset, bytes32 userSalt)
        external
        view
        returns (address vault, bytes32 salt)
    {
        // Compute CREATE2 salt
        salt = _computeSalt(owner_, agentId, asset, userSalt);

        // Get agent info to include imageId in bytecode
        IAgentRegistry.AgentInfo memory agentInfo = _registry.get(agentId);
        if (!agentInfo.exists) {
            revert AgentNotRegistered(agentId);
        }

        // Compute CREATE2 address
        bytes memory bytecode = _getCreationBytecode(asset, agentId, agentInfo.imageId, owner_);
        bytes32 bytecodeHash = keccak256(bytecode);

        vault = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash))
                )
            )
        );

        return (vault, salt);
    }

    /// @inheritdoc IVaultFactory
    function deployVault(bytes32 agentId, address asset, bytes32 userSalt, bytes32 expectedImageId)
        external
        returns (address vault)
    {
        // Get agent info from registry
        IAgentRegistry.AgentInfo memory agentInfo = _registry.get(agentId);
        if (!agentInfo.exists) {
            revert AgentNotRegistered(agentId);
        }

        // Only the agent author can deploy vaults for their agent
        if (msg.sender != agentInfo.author) {
            revert NotAgentAuthor(agentId, msg.sender, agentInfo.author);
        }

        // Verify imageId hasn't changed since computeVaultAddress was called
        if (agentInfo.imageId != expectedImageId) {
            revert ImageIdChanged(expectedImageId, agentInfo.imageId);
        }

        // Compute CREATE2 salt
        bytes32 salt = _computeSalt(msg.sender, agentId, asset, userSalt);

        // Get creation bytecode with constructor args (owner = agent author = msg.sender)
        bytes memory bytecode = _getCreationBytecode(asset, agentId, agentInfo.imageId, msg.sender);

        // Deploy with CREATE2
        assembly {
            vault := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        // Verify deployment succeeded (L-23: proper error, not VaultAlreadyExists)
        if (vault == address(0)) {
            revert Create2DeploymentFailed();
        }

        // Track deployment
        isDeployedVault[vault] = true;
        _deployedVaults.push(vault);
        _agentVaults[agentId].push(vault);

        emit VaultDeployed(vault, msg.sender, agentId, asset, agentInfo.imageId, salt);

        return vault;
    }

    /// @inheritdoc IVaultFactory
    function deployOptimisticVault(
        bytes32 agentId,
        address asset,
        bytes32 userSalt,
        bytes32 expectedImageId,
        uint256 bondChainId,
        uint256 challengeWindow
    ) external returns (address vault) {
        // Get agent info from registry
        IAgentRegistry.AgentInfo memory agentInfo = _registry.get(agentId);
        if (!agentInfo.exists) {
            revert AgentNotRegistered(agentId);
        }

        // Only the agent author can deploy vaults for their agent
        if (msg.sender != agentInfo.author) {
            revert NotAgentAuthor(agentId, msg.sender, agentInfo.author);
        }

        // Verify imageId hasn't changed since computeVaultAddress was called
        if (agentInfo.imageId != expectedImageId) {
            revert ImageIdChanged(expectedImageId, agentInfo.imageId);
        }

        // Compute CREATE2 salt
        bytes32 salt = _computeSalt(msg.sender, agentId, asset, userSalt);

        // Get creation bytecode with constructor args (owner = agent author = msg.sender)
        bytes memory bytecode = _getOptimisticCreationBytecode(
            asset, agentId, agentInfo.imageId, msg.sender, bondChainId, challengeWindow
        );

        // Deploy with CREATE2
        assembly {
            vault := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        // Verify deployment succeeded (L-23: proper error, not VaultAlreadyExists)
        if (vault == address(0)) {
            revert Create2DeploymentFailed();
        }

        // Track deployment (shared tracking with regular vaults)
        isDeployedVault[vault] = true;
        _deployedVaults.push(vault);
        _agentVaults[agentId].push(vault);

        emit OptimisticVaultDeployed(vault, agentId, msg.sender, bondChainId);
        emit VaultDeployed(vault, msg.sender, agentId, asset, agentInfo.imageId, salt);

        return vault;
    }

    /// @inheritdoc IVaultFactory
    function computeOptimisticVaultAddress(
        address owner_,
        bytes32 agentId,
        address asset,
        bytes32 userSalt,
        uint256 bondChainId,
        uint256 challengeWindow
    ) external view returns (address vault, bytes32 salt) {
        // Compute CREATE2 salt
        salt = _computeSalt(owner_, agentId, asset, userSalt);

        // Get agent info to include imageId in bytecode
        IAgentRegistry.AgentInfo memory agentInfo = _registry.get(agentId);
        if (!agentInfo.exists) {
            revert AgentNotRegistered(agentId);
        }

        // Compute CREATE2 address — include challengeWindow
        bytes memory bytecode = _getOptimisticCreationBytecode(
            asset, agentId, agentInfo.imageId, owner_, bondChainId, challengeWindow
        );
        bytes32 bytecodeHash = keccak256(bytecode);

        vault = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash))
                )
            )
        );

        return (vault, salt);
    }

    /// @inheritdoc IVaultFactory
    function vaultProtocolType(address vault) external view returns (uint8) {
        return _vaultProtocolType[vault];
    }

    /// @inheritdoc IVaultFactory
    function setVaultProtocolType(address vault, uint8 protocolType) external {
        require(isDeployedVault[vault], "vault not deployed");
        // Allow factory owner or vault owner to set protocol type
        if (msg.sender != _owner) {
            // Check if caller is the vault owner
            (bool success, bytes memory data) = vault.staticcall(abi.encodeWithSignature("owner()"));
            require(success && data.length >= 32, "cannot read vault owner");
            address vaultOwner = abi.decode(data, (address));
            require(msg.sender == vaultOwner, "not vault or factory owner");
        }
        _vaultProtocolType[vault] = protocolType;
        emit VaultProtocolTypeSet(vault, protocolType);
    }

    /// @inheritdoc IVaultFactory
    function registerExternalVault(address vault, bytes32 agentId) external onlyOwner {
        require(vault != address(0), "zero vault");
        require(vault.code.length > 0, "no code at vault");
        require(!isDeployedVault[vault], "already registered");

        isDeployedVault[vault] = true;
        _deployedVaults.push(vault);
        _agentVaults[agentId].push(vault);

        emit ExternalVaultRegistered(vault, agentId);
    }

    /// @inheritdoc IVaultFactory
    function vaultCount() external view returns (uint256) {
        return _deployedVaults.length;
    }

    /// @inheritdoc IVaultFactory
    function vaultAt(uint256 index) external view returns (address) {
        return _deployedVaults[index];
    }

    /// @inheritdoc IVaultFactory
    function getAllVaults() external view returns (address[] memory) {
        return _deployedVaults;
    }

    /// @inheritdoc IVaultFactory
    function getAgentVaults(bytes32 agentIdQuery) external view returns (address[] memory) {
        return _agentVaults[agentIdQuery];
    }

    // ============ Internal Functions ============

    /// @notice Compute CREATE2 salt from deployment parameters
    /// @param owner_ The vault owner
    /// @param agentId The agent ID
    /// @param asset The asset address
    /// @param userSalt User-provided salt for uniqueness
    /// @return The CREATE2 salt
    function _computeSalt(address owner_, bytes32 agentId, address asset, bytes32 userSalt)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(owner_, agentId, asset, userSalt));
    }

    /// @notice Get the creation bytecode for KernelVault with constructor arguments
    /// @param asset The asset address
    /// @param agentId The agent ID
    /// @param imageId The trusted image ID
    /// @param vaultOwner The vault owner (agent author)
    /// @return The creation bytecode
    function _getCreationBytecode(
        address asset,
        bytes32 agentId,
        bytes32 imageId,
        address vaultOwner
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            _vaultCreationCodeStore.code, abi.encode(asset, _verifier, agentId, imageId, vaultOwner)
        );
    }

    /// @notice Get the creation bytecode for OptimisticKernelVault with constructor arguments
    /// @param asset The asset address
    /// @param agentId The agent ID
    /// @param imageId The trusted image ID
    /// @param vaultOwner The vault owner (agent author)
    /// @param bondChainId The L1 chain ID where bonds are locked
    /// @return The creation bytecode
    function _getOptimisticCreationBytecode(
        address asset,
        bytes32 agentId,
        bytes32 imageId,
        address vaultOwner,
        uint256 bondChainId,
        uint256 challengeWindow
    ) internal view returns (bytes memory) {
        require(_optimisticVaultCreationCodeStore != address(0), "optimistic code store not set");
        return abi.encodePacked(
            _optimisticVaultCreationCodeStore.code,
            abi.encode(
                asset, _verifier, agentId, imageId, vaultOwner, bondChainId, challengeWindow
            )
        );
    }

    // ============ Tokagent vault stubs (filled by task B4) ============

    function deployTokagentVault(
        address,
        IVaultFactory.TokagentEntry[] calldata,
        IVaultFactory.TokagentApprovalSpec[] calldata,
        bytes32
    ) external returns (address) {
        revert("not implemented");
    }

    function computeTokagentVaultAddress(
        address,
        address,
        IVaultFactory.TokagentEntry[] calldata,
        IVaultFactory.TokagentApprovalSpec[] calldata,
        bytes32
    ) external view returns (address, bytes32) {
        revert("not implemented");
    }

    function setTokagentVaultCreationCodeStoreOnce(address) external {
        revert("not implemented");
    }

    function tokagentVaultCreationCodeStore() external view returns (address) {
        revert("not implemented");
    }
}
