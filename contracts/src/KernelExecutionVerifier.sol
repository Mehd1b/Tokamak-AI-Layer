// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IRiscZeroVerifier } from "./interfaces/IRiscZeroVerifier.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @title KernelExecutionVerifier
/// @notice Verifies RISC Zero proofs of zkVM kernel execution and parses KernelJournalV1
/// @dev This contract:
///      1. Verifies RISC Zero proofs using an external verifier
///      2. Parses and validates the KernelJournalV1 binary format (209 bytes)
///      3. Enforces protocol invariants (version checks, execution status)
///      Uses UUPS proxy pattern for upgradeability.
contract KernelExecutionVerifier is Initializable, UUPSUpgradeable {
    // ============ Constants ============

    /// @notice Expected protocol version in the journal
    uint32 public constant EXPECTED_PROTOCOL_VERSION = 1;

    /// @notice Expected kernel version in the journal
    uint32 public constant EXPECTED_KERNEL_VERSION = 1;

    /// @notice Execution status code indicating success
    uint8 public constant EXECUTION_STATUS_SUCCESS = 0x01;

    /// @notice Expected length of KernelJournalV1 in bytes
    uint256 public constant JOURNAL_LENGTH = 209;

    // ============ State ============

    /// @notice RISC Zero verifier contract
    IRiscZeroVerifier public verifier;

    /// @notice Contract owner (authorized to upgrade)
    address private _owner;

    // ─────────────────────────────────────────────────────────────────────
    // RISC Zero verifier rotation with allowlist + timelock
    // ─────────────────────────────────────────────────────────────────────
    // Three-step governance-controlled rotation:
    //   Step 1: Governance calls `approveVerifier(candidate)` to add a
    //           vetted verifier contract to the allowlist. This is the
    //           off-chain-vetted "pre-flight" step — candidates should be
    //           reviewed for bytecode match, audit status, and version
    //           before being approved.
    //   Step 2: Governance calls `proposeVerifier(candidate)`. This
    //           checks the allowlist and starts a VERIFIER_ROTATION_DELAY
    //           timelock. Only one proposal can be pending at a time.
    //   Step 3: After the timelock elapses, ANYONE can call
    //           `activateVerifier()` to commit the rotation. The
    //           activation re-checks the allowlist so that a revocation
    //           during the timelock will prevent an activated rotation.
    //
    // WHY THIS DESIGN vs. the RISC Zero Router:
    //   The RISC Zero Router auto-upgrades but delegates trust to the
    //   RISC Zero governance. A protocol operator may not want to
    //   delegate this trust — e.g., if they require their own audit of
    //   each verifier before accepting it. This allowlist + timelock
    //   pattern keeps the decision in-protocol while still providing
    //   an on-chain remediation path for CVE-style bugs.
    //
    // WHY PERMISSIONLESS ACTIVATION:
    //   `activateVerifier()` is callable by anyone after the timelock
    //   elapses so that an absent or compromised owner cannot
    //   indefinitely stall a queued rotation. The timelock is the only
    //   safety window; once it elapses, the allowlisted candidate can
    //   always be committed.
    //
    // STORAGE LAYOUT (UUPS proxy compatibility):
    //   This contract is deployed via UUPS proxy, so storage layout is
    //   load-bearing. The three new state slots (approvedVerifiers,
    //   pendingVerifier, pendingVerifierActivatesAt) are inserted
    //   immediately before the existing __gap, and __gap is reduced
    //   from 48 → 45 slots to keep the total contract storage footprint
    //   unchanged. `verifier` and `_owner` slot positions are preserved.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Allowlist of verifier addresses approved by governance.
    ///         Only addresses on this list may be proposed / activated.
    mapping(address => bool) public approvedVerifiers;

    /// @notice Currently proposed (pending) verifier awaiting timelock expiry.
    ///         address(0) means no rotation is pending.
    address public pendingVerifier;

    /// @notice Timestamp at which `pendingVerifier` may be activated.
    uint256 public pendingVerifierActivatesAt;

    /// @notice Timelock delay between proposing and activating a
    ///         verifier rotation. 48 hours gives depositors time to react
    ///         to a governance decision they disagree with.
    uint256 public constant VERIFIER_ROTATION_DELAY = 48 hours;

    // ─────────────────────────────────────────────────────────────────────
    // UUPS implementation-upgrade timelock state
    // ─────────────────────────────────────────────────────────────────────
    // The RISC Zero verifier contract itself is a UUPS proxy. The existing
    // `_authorizeUpgrade` hook only enforced `onlyOwner` + journal-constant
    // compatibility — meaning a single compromised deployer key could
    // upgrade the implementation in one transaction and ship a malicious
    // replacement that accepts any proof. To give depositors (and
    // monitoring) a window to react, all implementation upgrades are now
    // routed through a propose → wait → activate pattern gated by
    // `UPGRADE_DELAY`. The active upgrade entry points (`upgradeTo` /
    // `upgradeToAndCall`) still call `_authorizeUpgrade`, but that hook
    // now requires the exact implementation to have been scheduled at
    // least `UPGRADE_DELAY` seconds earlier and not cancelled.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Mandatory delay between scheduling and activating an
    ///         implementation-level (UUPS) upgrade.
    uint256 public constant UPGRADE_DELAY = 48 hours;

    /// @notice Currently scheduled implementation awaiting the timelock.
    ///         address(0) means no upgrade is pending.
    address public pendingImplementation;

    /// @notice Earliest `block.timestamp` at which `pendingImplementation`
    ///         may be activated by `upgradeTo`.
    uint256 public pendingImplementationActivatesAt;

    // ─────────────────────────────────────────────────────────────────────
    // Emergency verification pause state
    // ─────────────────────────────────────────────────────────────────────
    // A vulnerability discovered in the ACTIVE RISC Zero verifier cannot
    // be closed faster than the UPGRADE_DELAY unless the contract can be
    // halted independently. `verificationPaused` provides an immediate
    // off-switch: while set, `verifyAndParseWithImageId` and `verify`
    // revert, and every downstream vault execution that depends on proof
    // verification becomes unavailable. This is a per-contract circuit
    // breaker, not an upgrade — setting it does NOT require the timelock.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Global pause flag for proof verification. When true,
    ///         verify() and verifyAndParseWithImageId() both revert.
    bool public verificationPaused;

    /// @notice Timestamp when verification was paused. Used to
    ///         auto-expire the pause after MAX_PAUSE_DURATION so a single
    ///         compromised/absent owner key cannot permanently halt all
    ///         vault executions across the ecosystem.
    uint256 public pausedSince;

    /// @notice Maximum pause duration (7 days). After this,
    ///         verification automatically resumes without owner action.
    uint256 public constant MAX_PAUSE_DURATION = 7 days;

    // ─────────────────────────────────────────────────────────────────────
    // Two-step ownership transfer state
    // ─────────────────────────────────────────────────────────────────────
    // `transferOwnership` previously applied a new owner in a single call.
    // A typo or stale address could permanently lose control of the
    // contract. The new pattern requires the incoming owner to explicitly
    // call `acceptOwnership`, proving they control the key.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Proposed owner awaiting acceptance.
    address public pendingOwner;

    /// @notice Storage gap for future upgrades. Reduced from 45 → 41 slots
    ///         to accommodate the new state above:
    ///           - pendingImplementation (1)
    ///           - pendingImplementationActivatesAt (1)
    ///           - verificationPaused (1)
    ///           - pendingOwner (1)
    uint256[41] private __gap;

    // ============ Errors ============

    /// @notice Journal length does not match expected 209 bytes
    error InvalidJournalLength(uint256 actual, uint256 expected);

    /// @notice Protocol version in journal does not match expected
    error InvalidProtocolVersion(uint32 actual, uint32 expected);

    /// @notice Kernel version in journal does not match expected
    error InvalidKernelVersion(uint32 actual, uint32 expected);

    /// @notice Execution status indicates failure
    error ExecutionFailed(uint8 status);

    /// @notice Zero imageId provided to verifyAndParseWithImageId
    error ZeroImageId();

    /// @notice Caller is not the owner
    error OwnableUnauthorizedAccount(address account);

    /// @notice Zero address passed where a verifier contract is required
    error ZeroVerifier();

    /// @notice Verifier candidate is not on the governance allowlist
    error VerifierNotApproved(address candidate);

    /// @notice No verifier rotation is pending
    error NoPendingVerifier();

    /// @notice Timelock has not elapsed
    error VerifierTimelockNotElapsed(uint256 currentTime, uint256 activatesAt);

    /// @notice UUPS upgrade attempted without a matching scheduled proposal
    error UpgradeNotScheduled(address attempted);

    /// @notice UUPS upgrade attempted before the scheduling timelock elapsed
    error UpgradeTimelockNotElapsed(uint256 currentTime, uint256 activatesAt);

    /// @notice No implementation upgrade is currently pending
    error NoPendingImplementation();

    /// @notice Verification is currently halted by the emergency pause
    error VerificationPaused();

    /// @notice Ownership acceptance attempted by the wrong caller
    error NotPendingOwner(address caller, address expected);

    /// @notice No pending ownership transfer exists
    error NoPendingOwner();

    // ============ Events ============

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when a verifier is added to the governance allowlist
    event VerifierApproved(address indexed verifier);

    /// @notice Emitted when a verifier is removed from the allowlist
    event VerifierRevoked(address indexed verifier);

    /// @notice Emitted when a verifier rotation is proposed (timelock started)
    event VerifierProposed(address indexed verifier, uint256 activatesAt);

    /// @notice Emitted when a verifier rotation is cancelled
    event VerifierProposalCancelled(address indexed verifier);

    /// @notice Emitted when a new verifier is committed
    event VerifierActivated(address indexed oldVerifier, address indexed newVerifier);

    /// @notice Emitted when a UUPS implementation upgrade is scheduled.
    event ImplementationScheduled(address indexed implementation, uint256 activatesAt);

    /// @notice Emitted when a scheduled UUPS upgrade is cancelled.
    event ImplementationCancelled(address indexed implementation);

    /// @notice Emitted when an ownership transfer is proposed.
    event OwnershipTransferProposed(address indexed currentOwner, address indexed proposedOwner);

    /// @notice Emitted when the global verification pause flag changes.
    event VerificationPauseSet(bool paused);

    // ============ Structs ============

    /// @notice Parsed fields from KernelJournalV1
    struct ParsedJournal {
        bytes32 agentId;
        bytes32 agentCodeHash;
        bytes32 constraintSetHash;
        bytes32 inputRoot;
        uint64 executionNonce;
        bytes32 inputCommitment;
        bytes32 actionCommitment;
    }

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

    /// @notice Initialize the verifier (called once via proxy)
    /// @param _verifier Address of the RISC Zero verifier contract
    /// @param initialOwner The address that will own this contract
    function initialize(address _verifier, address initialOwner) external initializer {
        require(_verifier != address(0), "zero verifier");
        require(initialOwner != address(0), "zero owner");
        verifier = IRiscZeroVerifier(_verifier);
        _owner = initialOwner;
        // Seed the allowlist with the initial verifier so introspection
        // tooling can confirm it is on the approved set. Does NOT make the
        // initial verifier special — it is still the one currently in use.
        approvedVerifiers[_verifier] = true;
        emit OwnershipTransferred(address(0), initialOwner);
        emit VerifierApproved(_verifier);
    }

    // ============ Owner Functions ============

    /// @notice Returns the current owner
    function owner() external view returns (address) {
        return _owner;
    }

    /// @notice Propose a new owner. The transfer only completes when the
    ///         proposed owner explicitly calls `acceptOwnership`, proving
    ///         they control the key. Pass address(0) to cancel a pending
    ///         proposal.
    /// @param newOwner The proposed owner address
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(_owner, newOwner);
    }

    /// @notice Accept a pending ownership transfer. Callable only by the
    ///         proposed owner.
    function acceptOwnership() external {
        address proposed = pendingOwner;
        if (proposed == address(0)) revert NoPendingOwner();
        if (msg.sender != proposed) revert NotPendingOwner(msg.sender, proposed);
        address previous = _owner;
        _owner = proposed;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, proposed);
    }

    /// @notice Emergency toggle for the global verification pause. When
    ///         set, the proof-verification entry points revert without
    ///         requiring a UUPS upgrade. Used to shut down verification
    ///         immediately upon discovering a vulnerability in the
    ///         active RISC Zero verifier; the upgrade path still requires
    ///         the full `UPGRADE_DELAY` but the exploit window is closed
    ///         by the pause.
    /// @param paused New pause state
    function setVerificationPaused(bool paused) external onlyOwner {
        verificationPaused = paused;
        // Record pause start time for auto-expiry. Only set pausedSince
        // on the FIRST pause; subsequent calls while already paused do NOT
        // refresh the timer — this prevents the owner from cycling
        // setVerificationPaused(true) every 6.9 days to indefinitely
        // extend the pause beyond MAX_PAUSE_DURATION (H-05).
        if (paused && pausedSince == 0) {
            pausedSince = block.timestamp;
        } else if (!paused) {
            pausedSince = 0;
        }
        emit VerificationPauseSet(paused);
    }

    // ============ Verifier Rotation (governance-timelocked) ============
    //
    // Full rationale in the block comment next to `approvedVerifiers` above.
    // The rotation flow is: approve → propose → (wait timelock) → activate.

    /// @notice STEP 1 — add a RISC Zero verifier address to the
    ///         governance allowlist. Only allowlisted addresses may be
    ///         proposed for rotation.
    /// @dev Intended to be called ahead of any planned rotation so that the
    ///      candidate is vetted by governance before the timelock starts.
    ///      Calling approveVerifier alone does NOT change the active verifier.
    /// @param candidate The verifier contract to approve
    function approveVerifier(address candidate) external onlyOwner {
        if (candidate == address(0)) revert ZeroVerifier();
        approvedVerifiers[candidate] = true;
        emit VerifierApproved(candidate);
    }

    /// @notice Remove a verifier from the governance allowlist.
    /// @dev Does NOT affect the currently-active `verifier` — it only
    ///      prevents future rotations TO this address. If the revoked
    ///      candidate is ALSO the currently-pending verifier, the pending
    ///      rotation is cancelled inline to avoid activating a now-
    ///      disapproved candidate once the timelock elapses.
    /// @param candidate The verifier contract to revoke
    function revokeVerifier(address candidate) external onlyOwner {
        approvedVerifiers[candidate] = false;
        // If the revoked candidate is mid-flight through a rotation,
        // cancel the pending proposal so the permissionless `activateVerifier`
        // cannot commit a now-disapproved verifier after the timelock.
        if (pendingVerifier == candidate) {
            emit VerifierProposalCancelled(candidate);
            pendingVerifier = address(0);
            pendingVerifierActivatesAt = 0;
        }
        emit VerifierRevoked(candidate);
    }

    /// @notice STEP 2 — propose rotating to a new verifier. Starts a
    ///         `VERIFIER_ROTATION_DELAY` timelock before the rotation can
    ///         take effect. The candidate must already be on the allowlist.
    /// @dev Overwrites any previous pending proposal. Useful if governance
    ///      needs to replace a pending candidate before activation.
    /// @param candidate The approved verifier to promote to pending
    function proposeVerifier(address candidate) external onlyOwner {
        if (candidate == address(0)) revert ZeroVerifier();
        // Allowlist gate: only vetted candidates may become pending.
        // This is the primary defense against a compromised owner key
        // flash-rotating to a malicious verifier in one block.
        if (!approvedVerifiers[candidate]) revert VerifierNotApproved(candidate);
        pendingVerifier = candidate;
        pendingVerifierActivatesAt = block.timestamp + VERIFIER_ROTATION_DELAY;
        emit VerifierProposed(candidate, pendingVerifierActivatesAt);
    }

    /// @notice Cancel a pending verifier rotation before activation.
    /// @dev Only the owner can cancel. After cancellation the pending slot
    ///      is cleared and the previously-active verifier remains active.
    function cancelVerifierProposal() external onlyOwner {
        if (pendingVerifier == address(0)) revert NoPendingVerifier();
        emit VerifierProposalCancelled(pendingVerifier);
        pendingVerifier = address(0);
        pendingVerifierActivatesAt = 0;
    }

    /// @notice STEP 3 — commit a pending verifier rotation once the
    ///         timelock has elapsed.
    /// @dev PERMISSIONLESS by design — anyone may call once the timelock
    ///      has expired, so an absent or compromised owner cannot
    ///      indefinitely stall a queued rotation. The timelock is the
    ///      only safety window.
    ///
    ///      The allowlist is RE-CHECKED at activation time so that a
    ///      `revokeVerifier` call during the timelock will cause this
    ///      function to revert, preventing a previously-queued but
    ///      now-disapproved candidate from being committed.
    function activateVerifier() external {
        address candidate = pendingVerifier;
        if (candidate == address(0)) revert NoPendingVerifier();
        // Timelock gate: earliest activation is `pendingVerifierActivatesAt`.
        if (block.timestamp < pendingVerifierActivatesAt) {
            revert VerifierTimelockNotElapsed(block.timestamp, pendingVerifierActivatesAt);
        }
        // Re-check the allowlist in case governance revoked the
        // candidate during the timelock (see `revokeVerifier`).
        if (!approvedVerifiers[candidate]) revert VerifierNotApproved(candidate);

        address old = address(verifier);
        verifier = IRiscZeroVerifier(candidate);
        pendingVerifier = address(0);
        pendingVerifierActivatesAt = 0;
        emit VerifierActivated(old, candidate);
    }

    // ============ UUPS Implementation Upgrade Scheduling ============
    //
    // The UUPS upgrade flow is now a two-step schedule:
    //   1. Owner calls `scheduleImplementation(impl)`. This records the
    //      candidate and starts an `UPGRADE_DELAY` timer.
    //   2. After the timer elapses, the owner calls the standard
    //      `upgradeTo(impl)` or `upgradeToAndCall(impl, data)`. These
    //      eventually invoke `_authorizeUpgrade`, which now enforces that
    //      the exact candidate was scheduled and that the timelock
    //      has elapsed.
    // The propose step is gated by `onlyOwner`; cancellation is also
    // owner-gated. The implementation-compatibility checks remain and
    // are applied at activation time.

    /// @notice Schedule a UUPS implementation upgrade. Starts the
    ///         `UPGRADE_DELAY` timelock. Overwrites any previously
    ///         scheduled upgrade.
    /// @param newImplementation Implementation contract to schedule.
    function scheduleImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroVerifier();
        pendingImplementation = newImplementation;
        pendingImplementationActivatesAt = block.timestamp + UPGRADE_DELAY;
        emit ImplementationScheduled(newImplementation, pendingImplementationActivatesAt);
    }

    /// @notice Cancel a scheduled UUPS upgrade before it is activated.
    function cancelImplementation() external onlyOwner {
        if (pendingImplementation == address(0)) revert NoPendingImplementation();
        emit ImplementationCancelled(pendingImplementation);
        pendingImplementation = address(0);
        pendingImplementationActivatesAt = 0;
    }

    /// @notice Authorize upgrade (only owner). The upgrade must have been
    ///         scheduled via `scheduleImplementation` at least
    ///         `UPGRADE_DELAY` seconds earlier, and it must match the
    ///         currently pending candidate. Existing implementation-
    ///         compatibility checks (protocol/kernel version, journal
    ///         length) are retained.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Enforce that the implementation was scheduled. This closes the
        // path where an owner key could push a malicious implementation
        // in a single transaction.
        if (newImplementation != pendingImplementation || newImplementation == address(0)) {
            revert UpgradeNotScheduled(newImplementation);
        }
        if (block.timestamp < pendingImplementationActivatesAt) {
            revert UpgradeTimelockNotElapsed(block.timestamp, pendingImplementationActivatesAt);
        }

        // Read the new implementation's constants and require they match the
        // current contract's values. Static calls are safe because the constants
        // live in the new impl's code section (pure functions / constants).
        (bool ok1, bytes memory ret1) = newImplementation.staticcall(
            abi.encodeWithSignature("EXPECTED_PROTOCOL_VERSION()")
        );
        require(ok1 && ret1.length == 32, "upgrade: missing proto version");
        uint32 newProtoVersion = abi.decode(ret1, (uint32));
        require(
            newProtoVersion == EXPECTED_PROTOCOL_VERSION,
            "upgrade: incompatible protocol version"
        );

        (bool ok2, bytes memory ret2) = newImplementation.staticcall(
            abi.encodeWithSignature("JOURNAL_LENGTH()")
        );
        require(ok2 && ret2.length == 32, "upgrade: missing journal length");
        uint256 newJournalLength = abi.decode(ret2, (uint256));
        require(
            newJournalLength == JOURNAL_LENGTH,
            "upgrade: incompatible journal length"
        );

        // Kernel version compatibility — a mismatched kernel version would
        // accept proofs from a different zkVM image, breaking the guarantee
        // that the vault's pinned trustedImageId binds the agent binary to
        // this verifier's parsing rules.
        (bool ok3, bytes memory ret3) = newImplementation.staticcall(
            abi.encodeWithSignature("EXPECTED_KERNEL_VERSION()")
        );
        require(ok3 && ret3.length == 32, "upgrade: missing kernel version");
        uint32 newKernelVersion = abi.decode(ret3, (uint32));
        require(
            newKernelVersion == EXPECTED_KERNEL_VERSION,
            "upgrade: incompatible kernel version"
        );

        // Ensure the current active verifier is on the approved list.
        // After a UUPS upgrade, storage is preserved but if the new
        // implementation changes layout or the upgrade process neglects
        // to re-populate approvedVerifiers, the mapping could be empty.
        // This check ensures the active verifier remains approved (H-06).
        address activeVerifier = address(verifier);
        require(
            activeVerifier != address(0) && approvedVerifiers[activeVerifier],
            "upgrade: active verifier must be approved"
        );

        // Clear the pending slot once the activation has been authorised.
        // Any subsequent upgrade requires a fresh schedule + wait.
        pendingImplementation = address(0);
        pendingImplementationActivatesAt = 0;
    }

    // ============ Core Verification ============

    /// @notice Verify a RISC Zero proof with a caller-provided imageId and parse the KernelJournalV1
    /// @dev The vault provides its pinned trustedImageId, enabling permissionless verification.
    /// @param expectedImageId The imageId to verify the proof against (pinned at vault deployment)
    /// @param journal The raw journal bytes (209 bytes expected)
    /// @param seal The RISC Zero proof seal
    /// @return parsed The parsed and validated journal fields
    function verifyAndParseWithImageId(
        bytes32 expectedImageId,
        bytes calldata journal,
        bytes calldata seal
    ) external view returns (ParsedJournal memory parsed) {
        // Emergency halt: if the active RISC Zero verifier contains a known
        // vulnerability, the owner can set `verificationPaused = true` to
        // immediately stop accepting any proof. This does NOT require
        // the UUPS upgrade timelock; it provides an instantaneous
        // circuit breaker while a scheduled upgrade proceeds separately.
        // Auto-expire after MAX_PAUSE_DURATION to prevent indefinite
        // execution halt from a single key.
        if (verificationPaused && block.timestamp < pausedSince + MAX_PAUSE_DURATION) {
            revert VerificationPaused();
        }

        // Validate expectedImageId is not zero
        if (expectedImageId == bytes32(0)) revert ZeroImageId();

        // Parse journal
        parsed = _parseJournal(journal);

        // Compute journal digest and verify proof via RISC Zero verifier
        bytes32 journalDigest = sha256(journal);
        verifier.verify(seal, expectedImageId, journalDigest);

        return parsed;
    }

    /// @notice Verify a RISC Zero proof without parsing the journal
    /// @dev Used by OptimisticKernelVault to verify proofs for pending executions
    ///      where the journal hash was stored at submission time.
    /// @param seal The RISC Zero proof seal
    /// @param imageId The expected image ID
    /// @param journalDigest The SHA256 digest of the journal
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view {
        // Emergency halt — see `verifyAndParseWithImageId` for rationale.
        // Auto-expire after MAX_PAUSE_DURATION.
        if (verificationPaused && block.timestamp < pausedSince + MAX_PAUSE_DURATION) {
            revert VerificationPaused();
        }
        if (imageId == bytes32(0)) revert ZeroImageId();
        verifier.verify(seal, imageId, journalDigest);
    }

    /// @notice Parse journal without proof verification (for testing/viewing)
    /// @param journal The raw journal bytes
    /// @return parsed The parsed journal fields
    function parseJournal(bytes calldata journal) external pure returns (ParsedJournal memory) {
        return _parseJournal(journal);
    }

    // ============ Internal Functions ============

    /// @notice Parse and validate a KernelJournalV1 binary blob
    /// @dev Layout (209 bytes total):
    ///      - [0:4]     protocol_version (u32 LE)
    ///      - [4:8]     kernel_version (u32 LE)
    ///      - [8:40]    agent_id (bytes32)
    ///      - [40:72]   agent_code_hash (bytes32)
    ///      - [72:104]  constraint_set_hash (bytes32)
    ///      - [104:136] input_root (bytes32)
    ///      - [136:144] execution_nonce (u64 LE)
    ///      - [144:176] input_commitment (bytes32)
    ///      - [176:208] action_commitment (bytes32)
    ///      - [208]     execution_status (u8)
    function _parseJournal(bytes calldata journal) internal pure returns (ParsedJournal memory) {
        // Validate length
        if (journal.length != JOURNAL_LENGTH) {
            revert InvalidJournalLength(journal.length, JOURNAL_LENGTH);
        }

        // Parse and validate protocol_version (LE u32 at offset 0)
        uint32 protocolVersion = _readU32LE(journal, 0);
        if (protocolVersion != EXPECTED_PROTOCOL_VERSION) {
            revert InvalidProtocolVersion(protocolVersion, EXPECTED_PROTOCOL_VERSION);
        }

        // Parse and validate kernel_version (LE u32 at offset 4)
        uint32 kernelVersion = _readU32LE(journal, 4);
        if (kernelVersion != EXPECTED_KERNEL_VERSION) {
            revert InvalidKernelVersion(kernelVersion, EXPECTED_KERNEL_VERSION);
        }

        // Parse and validate execution_status (u8 at offset 208)
        uint8 executionStatus = uint8(journal[208]);
        if (executionStatus != EXECUTION_STATUS_SUCCESS) {
            revert ExecutionFailed(executionStatus);
        }

        // Parse remaining fields
        return ParsedJournal({
            agentId: bytes32(journal[8:40]),
            agentCodeHash: bytes32(journal[40:72]),
            constraintSetHash: bytes32(journal[72:104]),
            inputRoot: bytes32(journal[104:136]),
            executionNonce: _readU64LE(journal, 136),
            inputCommitment: bytes32(journal[144:176]),
            actionCommitment: bytes32(journal[176:208])
        });
    }

    /// @notice Read a little-endian u32 from calldata
    /// @param data The calldata bytes
    /// @param offset The byte offset to read from
    /// @return The decoded uint32 value
    function _readU32LE(bytes calldata data, uint256 offset) internal pure returns (uint32) {
        return uint32(uint8(data[offset])) | (uint32(uint8(data[offset + 1])) << 8)
            | (uint32(uint8(data[offset + 2])) << 16) | (uint32(uint8(data[offset + 3])) << 24);
    }

    /// @notice Read a little-endian u64 from calldata
    /// @param data The calldata bytes
    /// @param offset The byte offset to read from
    /// @return The decoded uint64 value
    function _readU64LE(bytes calldata data, uint256 offset) internal pure returns (uint64) {
        return uint64(uint8(data[offset])) | (uint64(uint8(data[offset + 1])) << 8)
            | (uint64(uint8(data[offset + 2])) << 16) | (uint64(uint8(data[offset + 3])) << 24)
            | (uint64(uint8(data[offset + 4])) << 32) | (uint64(uint8(data[offset + 5])) << 40)
            | (uint64(uint8(data[offset + 6])) << 48) | (uint64(uint8(data[offset + 7])) << 56);
    }
}
