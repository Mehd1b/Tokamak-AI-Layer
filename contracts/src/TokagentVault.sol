// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TokagentVault
/// @notice Non-upgradeable custody vault for the Tokagent chat-agent product.
/// @dev Allowlist-gated hot-wallet vault. Owner curates a per-(target, selector)
///      allowlist; operator (the agent's hot wallet) can only call allowlisted
///      functions. Owner can emergency-withdraw at any time, bypassing the
///      allowlist. This contract coexists with KernelVault/OptimisticKernelVault
///      but is not verifiable — actions execute without zkp.
contract TokagentVault is IERC721Receiver, IERC1155Receiver, ReentrancyGuard {
    // ============ Types ============

    struct Call {
        address target;
        bytes data;
        uint256 value;
    }

    struct Entry {
        address target;
        bytes4 selector;
    }

    struct ApprovalSpec {
        address token;
        address spender;
        uint256 amount;
    }

    // ============ State ============

    address public owner;
    address public pendingOwner;
    address public operator;
    mapping(bytes32 => bool) public allowlisted;

    /// @dev Tracks which target addresses have at least one allowlisted selector.
    ///      Used by approveToken to validate that spender is "known" to this vault
    ///      without iterating the allowlist. Counts are incremented/decremented
    ///      atomically with allowlist mutations.
    mapping(address => uint256) public allowlistedSelectorCount;

    bytes32 public constant VAULT_KIND = keccak256("TokagentVault:v1");

    // ============ Errors ============

    error NotOwner(address caller);
    error NotOperator(address caller);
    error NotPendingOwner(address caller, address expected);
    error NoPendingOwner();
    error ZeroAddress();
    error CallNotAllowlisted(address target, bytes4 selector);
    error SpenderNotAllowlisted(address spender);
    error CallFailed(uint256 callIndex, bytes returndata);
    error DataTooShort();

    // ============ Events ============

    event OwnershipTransferProposed(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event OperatorSet(address indexed previous, address indexed current);
    event AllowlistSet(address indexed target, bytes4 indexed selector, bool allowed);
    event Executed(address indexed operator, uint256 numCalls);
    event TokenApproved(address indexed token, address indexed spender, uint256 amount);
    event OwnerWithdrawERC20(address indexed token, address indexed to, uint256 amount);
    event OwnerWithdrawERC721(address indexed token, address indexed to, uint256 tokenId);
    event OwnerWithdrawERC1155(address indexed token, address indexed to, uint256 id, uint256 amount);
    event OwnerWithdrawNative(address indexed to, uint256 amount);

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator(msg.sender);
        _;
    }

    // ============ Constructor ============

    /// @notice Deploys and seeds the vault atomically.
    /// @param owner_ Vault owner (has emergency withdraw + allowlist authority).
    /// @param operator_ Vault operator (can only call allowlisted functions).
    /// @param initialAllowlist Initial (target, selector) pairs to allow.
    /// @param initialApprovals Initial ERC20 approvals; each `spender` must appear in `initialAllowlist`.
    constructor(
        address owner_,
        address operator_,
        Entry[] memory initialAllowlist,
        ApprovalSpec[] memory initialApprovals
    ) {
        if (owner_ == address(0) || operator_ == address(0)) revert ZeroAddress();
        owner = owner_;
        operator = operator_;
        emit OwnershipTransferred(address(0), owner_);
        emit OperatorSet(address(0), operator_);

        // Seed allowlist first — approvals depend on it.
        for (uint256 i = 0; i < initialAllowlist.length; i++) {
            Entry memory e = initialAllowlist[i];
            bytes32 k = _key(e.target, e.selector);
            if (!allowlisted[k]) {
                allowlisted[k] = true;
                allowlistedSelectorCount[e.target] += 1;
                emit AllowlistSet(e.target, e.selector, true);
            }
        }

        // Seed approvals — require spender to have at least one allowlisted selector.
        for (uint256 i = 0; i < initialApprovals.length; i++) {
            ApprovalSpec memory a = initialApprovals[i];
            if (allowlistedSelectorCount[a.spender] == 0) revert SpenderNotAllowlisted(a.spender);
            _approveRaw(a.token, a.spender, a.amount);
            emit TokenApproved(a.token, a.spender, a.amount);
        }
    }

    // ============ Operator Functions ============

    /// @notice Execute a batch of calls. All calls must be allowlisted; any revert reverts the whole batch.
    function executeBatch(Call[] calldata calls) external nonReentrant onlyOperator {
        for (uint256 i = 0; i < calls.length; i++) {
            Call calldata c = calls[i];
            if (c.data.length < 4) revert DataTooShort();
            bytes4 selector = bytes4(c.data[0:4]);
            if (!allowlisted[_key(c.target, selector)]) revert CallNotAllowlisted(c.target, selector);
            (bool ok, bytes memory ret) = c.target.call{ value: c.value }(c.data);
            if (!ok) revert CallFailed(i, ret);
        }
        emit Executed(msg.sender, calls.length);
    }

    /// @notice Approve an ERC20 spender. Spender must have at least one allowlisted selector.
    function approveToken(address token, address spender, uint256 amount) external nonReentrant onlyOperator {
        if (allowlistedSelectorCount[spender] == 0) revert SpenderNotAllowlisted(spender);
        _approveRaw(token, spender, amount);
        emit TokenApproved(token, spender, amount);
    }

    // ============ Owner Functions ============

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(owner, newOwner);
    }

    function acceptOwnership() external {
        address proposed = pendingOwner;
        if (proposed == address(0)) revert NoPendingOwner();
        if (msg.sender != proposed) revert NotPendingOwner(msg.sender, proposed);
        address previous = owner;
        owner = proposed;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, proposed);
    }

    function ownerSetOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = newOperator;
        emit OperatorSet(previous, newOperator);
    }

    function ownerSetAllowlist(address target, bytes4 selector, bool allowed) external onlyOwner {
        bytes32 k = _key(target, selector);
        bool current = allowlisted[k];
        if (current == allowed) return;
        allowlisted[k] = allowed;
        if (allowed) {
            allowlistedSelectorCount[target] += 1;
        } else {
            allowlistedSelectorCount[target] -= 1;
        }
        emit AllowlistSet(target, selector, allowed);
    }

    function ownerSetAllowlistBatch(Entry[] calldata entries, bool[] calldata allowed) external onlyOwner {
        require(entries.length == allowed.length, "length mismatch");
        for (uint256 i = 0; i < entries.length; i++) {
            Entry calldata e = entries[i];
            bytes32 k = _key(e.target, e.selector);
            bool current = allowlisted[k];
            if (current == allowed[i]) continue;
            allowlisted[k] = allowed[i];
            if (allowed[i]) {
                allowlistedSelectorCount[e.target] += 1;
            } else {
                allowlistedSelectorCount[e.target] -= 1;
            }
            emit AllowlistSet(e.target, e.selector, allowed[i]);
        }
    }

    function ownerWithdrawERC20(address token, uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "transfer failed");
        emit OwnerWithdrawERC20(token, to, amount);
    }

    function ownerWithdrawERC721(address token, uint256 tokenId, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = token.call(
            abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", address(this), to, tokenId)
        );
        require(ok, "erc721 transfer failed");
        emit OwnerWithdrawERC721(token, to, tokenId);
    }

    function ownerWithdrawERC1155(address token, uint256 id, uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = token.call(
            abi.encodeWithSignature(
                "safeTransferFrom(address,address,uint256,uint256,bytes)",
                address(this),
                to,
                id,
                amount,
                ""
            )
        );
        require(ok, "erc1155 transfer failed");
        emit OwnerWithdrawERC1155(token, to, id, amount);
    }

    function ownerWithdrawNative(uint256 amount, address payable to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{ value: amount }("");
        require(ok, "native transfer failed");
        emit OwnerWithdrawNative(to, amount);
    }

    // ============ Views ============

    function isAllowlisted(address target, bytes4 selector) external view returns (bool) {
        return allowlisted[_key(target, selector)];
    }

    function vaultKind() external pure returns (bytes32) {
        return VAULT_KIND;
    }

    // ============ Receiver hooks ============

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId;
    }

    // ============ Internals ============

    function _key(address target, bytes4 selector) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(target, selector));
    }

    function _approveRaw(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "approve failed");
    }

    // ============ Native receive ============

    receive() external payable {}
}
