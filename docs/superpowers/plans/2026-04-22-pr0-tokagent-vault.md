# PR 0 — TokagentVault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a non-upgradeable custody contract (`TokagentVault`) and a factory extension (`VaultFactory` v4 with `deployTokagentVault`) that coexist with the existing zkp-verified vaults and serve the Tokagent chat-agent product.

**Architecture:** Allowlist-gated hot-wallet vault with per-`(target, selector)` granularity. Batched `executeBatch` for atomic approve+action flows. Dedicated `approveToken` that enforces spender-must-be-allowlisted. Constructor-based seeding of initial allowlist + approvals. Deployed via existing CREATE2 factory upgraded to v4 — single on-chain list of all vault kinds, discriminated by `vaultKind()` view.

**Tech Stack:** Solidity 0.8.24, Foundry (forge/cast), OpenZeppelin Contracts (non-upgradeable, already in `lib/risc0-ethereum/lib/openzeppelin-contracts/`), Rust (clap, alloy, for tal-cli), TypeScript (ek-sdk).

**Spec:** `docs/superpowers/specs/2026-04-22-pr0-tokagent-vault-design.md`

---

## File Structure

**New files:**
- `contracts/src/TokagentVault.sol` — the vault contract itself
- `contracts/src/TokagentVaultCreationCodeStore.sol` — runtime-bytecode store (new file, not extension of `VaultCreationCodeStore.sol` to keep HyperEVM deploy gas bounded)
- `contracts/test/TokagentVault.t.sol` — unit tests (constructor, executeBatch, approveToken, owner paths, receivers, emergency exit)
- `contracts/test/VaultFactoryTokagent.t.sol` — factory integration tests
- `contracts/test/TokagentVaultFuzz.t.sol` — fuzz + invariant tests
- `contracts/test/TokagentVaultFork.t.sol` — Polygon fork tests (Aave v3, Polymarket)
- `contracts/script/deploy/DeployTokagentCodeStore.s.sol` — step 1 of deploy: deploy the code store
- `contracts/script/deploy/DeployTokagentFactoryUpgrade.s.sol` — step 2 of deploy: deploy v4 impl + schedule upgrade
- `contracts/script/deploy/ActivateTokagentFactoryUpgrade.s.sol` — step 3 of deploy (48h later): activate the scheduled upgrade
- `contracts/script/deploy/SetTokagentCodeStore.s.sol` — step 4 of deploy: wire the code store into the upgraded factory
- `contracts/script/deploy/DeployTokagentVaultTest.s.sol` — step 5 of deploy: smoke-test a vault
- `sdk/src/abi/TokagentVault.ts` — generated TS ABI for the vault
- `sdk/src/clients/TokagentVaultClient.ts` — viem-based client for vault operations
- `sdk/src/__tests__/TokagentVaultClient.test.ts` — client unit tests
- `crates/tal-cli/src/tokagent_packs.rs` — protocol pack registry for CLI (Rust const)

**Modified files:**
- `contracts/src/VaultFactory.sol` — add `_tokagentVaultCreationCodeStore` storage slot, one-time setter, `deployTokagentVault` + `computeTokagentVaultAddress` + `_getTokagentCreationBytecode` internals, `TokagentVaultDeployed` event. Storage gap `__gap` shrinks 33 → 32.
- `contracts/src/interfaces/IVaultFactory.sol` — add `deployTokagentVault` / `computeTokagentVaultAddress` / `setTokagentVaultCreationCodeStoreOnce` signatures, `TokagentVaultDeployed` event, `Entry` and `ApprovalSpec` structs
- `sdk/src/abi/VaultFactory.ts` — regenerate with new function signatures
- `sdk/src/addresses.ts` — no address changes yet (these come post-deployment); just import path updates if needed
- `sdk/src/index.ts` — export `TokagentVaultClient`
- `crates/tal-cli/src/main.rs` — add `--kind` flag (enum `zkp` | `optimistic` | `tokagent`) to the `Deploy` command; branch on it
- `crates/tal-cli/src/deploy.rs` — add `deploy_tokagent_vault()` function

**Unchanged:**
- `KernelVault.sol`, `OptimisticKernelVault.sol`, `VaultCreationCodeStore.sol` — existing vault contracts untouched
- `AgentRegistry.sol` — Tokagent vaults do not touch the registry
- Existing frontend hooks — read `vaultKind()` with try/catch; no new hooks required for PR 0

---

## Phase A: TokagentVault Contract

### Task A1: Scaffold the contract file (no logic, compiles)

**Files:**
- Create: `contracts/src/TokagentVault.sol`

- [ ] **Step 1: Create the file with signatures only**

```solidity
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
            // Call approve directly — modifier guards bypassed OK here since we're in constructor.
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
        // Use safeTransferFrom with empty data; recipient is the owner, so safe transfer semantics apply.
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
```

- [ ] **Step 2: Compile to verify it builds**

Run: `cd contracts && forge build --force 2>&1 | tail -10`
Expected: `Compiler run successful` with zero errors.

- [ ] **Step 3: Commit**

```bash
git add contracts/src/TokagentVault.sol
git commit -m "contracts: scaffold TokagentVault non-zkp custody contract"
```

---

### Task A2: Unit test — constructor seeding

**Files:**
- Create: `contracts/test/TokagentVault.t.sol`

- [ ] **Step 1: Write the scaffold test file with the first test**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { IERC20 } from "../src/interfaces/IERC20.sol";

// Minimal ERC20 for vault tests
contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// Minimal target contract for allowlist tests
contract MockTarget {
    uint256 public value;
    uint256 public lastValueSent;

    function setValue(uint256 v) external payable {
        value = v;
        lastValueSent = msg.value;
    }

    function willRevert() external pure {
        revert("boom");
    }

    function payable_noop() external payable {}
}

contract TokagentVaultTest is Test {
    TokagentVault internal vault;
    MockERC20 internal token;
    MockTarget internal target;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");
    address internal bob = makeAddr("bob");

    bytes4 internal constant SET_VALUE = bytes4(keccak256("setValue(uint256)"));
    bytes4 internal constant WILL_REVERT = bytes4(keccak256("willRevert()"));
    bytes4 internal constant PAYABLE_NOOP = bytes4(keccak256("payable_noop()"));

    function setUp() public {
        token = new MockERC20();
        target = new MockTarget();
    }

    function _deployEmptyVault() internal returns (TokagentVault) {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        return new TokagentVault(owner, operator, entries, approvals);
    }

    function _deployWithTargetAllowlisted() internal returns (TokagentVault) {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: PAYABLE_NOOP });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        return new TokagentVault(owner, operator, entries, approvals);
    }

    // ============ Constructor tests ============

    function test_constructor_setsOwnerAndOperator() public {
        vault = _deployEmptyVault();
        assertEq(vault.owner(), owner);
        assertEq(vault.operator(), operator);
        assertEq(vault.vaultKind(), keccak256("TokagentVault:v1"));
    }

    function test_constructor_rejectsZeroOwner() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vm.expectRevert(TokagentVault.ZeroAddress.selector);
        new TokagentVault(address(0), operator, entries, approvals);
    }

    function test_constructor_rejectsZeroOperator() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vm.expectRevert(TokagentVault.ZeroAddress.selector);
        new TokagentVault(owner, address(0), entries, approvals);
    }

    function test_constructor_seedsAllowlist() public {
        vault = _deployWithTargetAllowlisted();
        assertTrue(vault.isAllowlisted(address(target), SET_VALUE));
        assertTrue(vault.isAllowlisted(address(target), PAYABLE_NOOP));
        assertFalse(vault.isAllowlisted(address(target), WILL_REVERT));
        assertEq(vault.allowlistedSelectorCount(address(target)), 2);
    }

    function test_constructor_seedsApprovals() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](1);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](1);
        approvals[0] = TokagentVault.ApprovalSpec({ token: address(token), spender: address(target), amount: 1e18 });
        vault = new TokagentVault(owner, operator, entries, approvals);
        assertEq(token.allowance(address(vault), address(target)), 1e18);
    }

    function test_constructor_rejectsApprovalForNonAllowlistedSpender() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](1);
        approvals[0] = TokagentVault.ApprovalSpec({ token: address(token), spender: address(target), amount: 1e18 });
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, address(target)));
        new TokagentVault(owner, operator, entries, approvals);
    }

    function test_constructor_dedupesAllowlistEntries() public {
        // Two identical entries should only count once.
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vault = new TokagentVault(owner, operator, entries, approvals);
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }
}
```

- [ ] **Step 2: Run the tests, verify they pass**

Run: `cd contracts && forge test --match-contract TokagentVaultTest --match-test test_constructor -vv 2>&1 | tail -30`
Expected: 6 passing tests. If any fails, the contract has a bug — fix and re-run before proceeding.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/TokagentVault.t.sol
git commit -m "test: TokagentVault constructor and initial seeding"
```

---

### Task A3: Unit test — executeBatch allowlist enforcement

**Files:**
- Modify: `contracts/test/TokagentVault.t.sol` (append tests)

- [ ] **Step 1: Append tests to the file**

Append inside the `TokagentVaultTest` contract, before the closing brace:

```solidity
    // ============ executeBatch allowlist tests ============

    function test_executeBatch_allowlistedCallSucceeds() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 42),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);
        assertEq(target.value(), 42);
    }

    function test_executeBatch_unallowlistedCallReverts() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(WILL_REVERT),
            value: 0
        });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.CallNotAllowlisted.selector, address(target), WILL_REVERT)
        );
        vault.executeBatch(calls);
    }

    function test_executeBatch_notOperatorReverts() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 42),
            value: 0
        });
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, bob));
        vault.executeBatch(calls);
    }

    function test_executeBatch_ownerCannotCallAsOperator() public {
        // Owner has emergency withdraw authority, but cannot use the operator path.
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 42),
            value: 0
        });
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, owner));
        vault.executeBatch(calls);
    }

    function test_executeBatch_oneCallRevertsWholeBatch() public {
        vault = _deployWithTargetAllowlisted();
        // First call sets value=1, second reverts via target.willRevert which is NOT allowlisted.
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](2);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 1),
            value: 0
        });
        calls[1] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(WILL_REVERT),
            value: 0
        });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.CallNotAllowlisted.selector, address(target), WILL_REVERT)
        );
        vault.executeBatch(calls);
        // Verify first call was also reverted — value remains unchanged.
        assertEq(target.value(), 0);
    }

    function test_executeBatch_passesValueToCall() public {
        vault = _deployWithTargetAllowlisted();
        vm.deal(address(vault), 1 ether);
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(PAYABLE_NOOP),
            value: 0.5 ether
        });
        vm.prank(operator);
        vault.executeBatch(calls);
        assertEq(address(target).balance, 0.5 ether);
    }

    function test_executeBatch_rejectsShortData() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        // Only 3 bytes — not enough for a selector.
        calls[0] = TokagentVault.Call({ target: address(target), data: hex"010203", value: 0 });
        vm.prank(operator);
        vm.expectRevert(TokagentVault.DataTooShort.selector);
        vault.executeBatch(calls);
    }

    function test_executeBatch_targetRevertBubbles() public {
        // Allowlist willRevert, then call it — targets's revert should surface as CallFailed.
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](1);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: WILL_REVERT });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vault = new TokagentVault(owner, operator, entries, approvals);
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(WILL_REVERT),
            value: 0
        });
        vm.prank(operator);
        vm.expectPartialRevert(TokagentVault.CallFailed.selector);
        vault.executeBatch(calls);
    }
```

- [ ] **Step 2: Run the new tests**

Run: `cd contracts && forge test --match-contract TokagentVaultTest --match-test test_executeBatch -vv 2>&1 | tail -30`
Expected: 8 passing tests.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/TokagentVault.t.sol
git commit -m "test: TokagentVault executeBatch allowlist enforcement"
```

---

### Task A4: Unit test — approveToken

**Files:**
- Modify: `contracts/test/TokagentVault.t.sol`

- [ ] **Step 1: Append approveToken tests before the closing brace**

```solidity
    // ============ approveToken tests ============

    function test_approveToken_succeedsWhenSpenderAllowlisted() public {
        vault = _deployWithTargetAllowlisted();
        vm.prank(operator);
        vault.approveToken(address(token), address(target), 1e18);
        assertEq(token.allowance(address(vault), address(target)), 1e18);
    }

    function test_approveToken_revertsWhenSpenderNotAllowlisted() public {
        vault = _deployEmptyVault();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, address(target))
        );
        vault.approveToken(address(token), address(target), 1e18);
    }

    function test_approveToken_notOperatorReverts() public {
        vault = _deployWithTargetAllowlisted();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, bob));
        vault.approveToken(address(token), address(target), 1e18);
    }

    function test_approveToken_revertsAfterAllowlistRevoked() public {
        // Deploy with target allowlisted, then owner revokes all entries; approveToken must then revert.
        vault = _deployWithTargetAllowlisted();
        vm.prank(operator);
        vault.approveToken(address(token), address(target), 1e18);

        vm.startPrank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, false);
        vault.ownerSetAllowlist(address(target), PAYABLE_NOOP, false);
        vm.stopPrank();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, address(target))
        );
        vault.approveToken(address(token), address(target), 2e18);
    }
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract TokagentVaultTest --match-test test_approveToken -vv 2>&1 | tail -20`
Expected: 4 passing tests.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/TokagentVault.t.sol
git commit -m "test: TokagentVault approveToken spender validation"
```

---

### Task A5: Unit test — owner functions (operator, allowlist, ownership)

**Files:**
- Modify: `contracts/test/TokagentVault.t.sol`

- [ ] **Step 1: Append owner-function tests**

```solidity
    // ============ Owner function tests ============

    function test_ownerSetOperator_rotates() public {
        vault = _deployEmptyVault();
        address newOp = makeAddr("newOp");
        vm.prank(owner);
        vault.ownerSetOperator(newOp);
        assertEq(vault.operator(), newOp);
        // Old operator can no longer call.
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](0);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, operator));
        vault.executeBatch(calls);
    }

    function test_ownerSetOperator_rejectsZero() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vm.expectRevert(TokagentVault.ZeroAddress.selector);
        vault.ownerSetOperator(address(0));
    }

    function test_ownerSetOperator_notOwnerReverts() public {
        vault = _deployEmptyVault();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOwner.selector, bob));
        vault.ownerSetOperator(bob);
    }

    function test_ownerSetAllowlist_addsEntry() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        assertTrue(vault.isAllowlisted(address(target), SET_VALUE));
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }

    function test_ownerSetAllowlist_removesEntry() public {
        vault = _deployWithTargetAllowlisted();
        vm.prank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, false);
        assertFalse(vault.isAllowlisted(address(target), SET_VALUE));
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }

    function test_ownerSetAllowlist_idempotent() public {
        vault = _deployEmptyVault();
        vm.startPrank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        vm.stopPrank();
        // Count should be 1, not 3.
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }

    function test_ownerSetAllowlistBatch_multipleEntries() public {
        vault = _deployEmptyVault();
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](3);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: PAYABLE_NOOP });
        entries[2] = TokagentVault.Entry({ target: address(token), selector: IERC20.transfer.selector });
        bool[] memory allowed = new bool[](3);
        allowed[0] = true;
        allowed[1] = true;
        allowed[2] = true;
        vm.prank(owner);
        vault.ownerSetAllowlistBatch(entries, allowed);
        assertTrue(vault.isAllowlisted(address(target), SET_VALUE));
        assertTrue(vault.isAllowlisted(address(target), PAYABLE_NOOP));
        assertTrue(vault.isAllowlisted(address(token), IERC20.transfer.selector));
        assertEq(vault.allowlistedSelectorCount(address(target)), 2);
        assertEq(vault.allowlistedSelectorCount(address(token)), 1);
    }

    function test_ownerSetAllowlistBatch_lengthMismatchReverts() public {
        vault = _deployEmptyVault();
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: PAYABLE_NOOP });
        bool[] memory allowed = new bool[](1);
        allowed[0] = true;
        vm.prank(owner);
        vm.expectRevert("length mismatch");
        vault.ownerSetAllowlistBatch(entries, allowed);
    }

    // ============ Ownership two-step tests ============

    function test_transferOwnership_proposesButDoesNotChange() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.transferOwnership(bob);
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), bob);
    }

    function test_acceptOwnership_completesTransfer() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(bob);
        vault.acceptOwnership();
        assertEq(vault.owner(), bob);
        assertEq(vault.pendingOwner(), address(0));
    }

    function test_acceptOwnership_notPendingOwnerReverts() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.transferOwnership(bob);
        address carol = makeAddr("carol");
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotPendingOwner.selector, carol, bob));
        vault.acceptOwnership();
    }

    function test_acceptOwnership_noProposalReverts() public {
        vault = _deployEmptyVault();
        vm.prank(bob);
        vm.expectRevert(TokagentVault.NoPendingOwner.selector);
        vault.acceptOwnership();
    }
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract TokagentVaultTest --match-test "test_ownerSet|test_transferOwnership|test_acceptOwnership" -vv 2>&1 | tail -30`
Expected: 12 passing tests.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/TokagentVault.t.sol
git commit -m "test: TokagentVault owner and ownership transfer paths"
```

---

### Task A6: Unit test — owner withdraw (all asset types)

**Files:**
- Modify: `contracts/test/TokagentVault.t.sol`

- [ ] **Step 1: Add ERC721 and ERC1155 mocks at the top of the file (above MockTarget)**

```solidity
// Minimal ERC721 for vault tests
contract MockERC721 {
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
        balanceOf[to] += 1;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "not owner");
        ownerOf[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
    }
}

// Minimal ERC1155 for vault tests
contract MockERC1155 {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function mint(address to, uint256 id, uint256 amount) external {
        balanceOf[to][id] += amount;
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(balanceOf[from][id] >= amount, "insufficient");
        balanceOf[from][id] -= amount;
        balanceOf[to][id] += amount;
    }
}
```

- [ ] **Step 2: Append withdraw tests to `TokagentVaultTest`**

```solidity
    // ============ Owner withdraw tests ============

    function test_ownerWithdrawERC20_movesFunds() public {
        vault = _deployEmptyVault();
        token.mint(address(vault), 100e18);
        vm.prank(owner);
        vault.ownerWithdrawERC20(address(token), 100e18, bob);
        assertEq(token.balanceOf(bob), 100e18);
    }

    function test_ownerWithdrawERC20_notOwnerReverts() public {
        vault = _deployEmptyVault();
        token.mint(address(vault), 100e18);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOwner.selector, bob));
        vault.ownerWithdrawERC20(address(token), 100e18, bob);
    }

    function test_ownerWithdrawERC20_zeroToReverts() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vm.expectRevert(TokagentVault.ZeroAddress.selector);
        vault.ownerWithdrawERC20(address(token), 0, address(0));
    }

    function test_ownerWithdrawERC721_movesNft() public {
        vault = _deployEmptyVault();
        MockERC721 nft = new MockERC721();
        nft.mint(address(vault), 42);
        vm.prank(owner);
        vault.ownerWithdrawERC721(address(nft), 42, bob);
        assertEq(nft.ownerOf(42), bob);
    }

    function test_ownerWithdrawERC1155_movesTokens() public {
        vault = _deployEmptyVault();
        MockERC1155 multi = new MockERC1155();
        multi.mint(address(vault), 7, 1000);
        vm.prank(owner);
        vault.ownerWithdrawERC1155(address(multi), 7, 400, bob);
        assertEq(multi.balanceOf(bob, 7), 400);
        assertEq(multi.balanceOf(address(vault), 7), 600);
    }

    function test_ownerWithdrawNative_movesEth() public {
        vault = _deployEmptyVault();
        vm.deal(address(vault), 5 ether);
        vm.prank(owner);
        vault.ownerWithdrawNative(3 ether, payable(bob));
        assertEq(bob.balance, 3 ether);
        assertEq(address(vault).balance, 2 ether);
    }

    // ============ ReceiverHook tests ============

    function test_receiveERC721() public {
        vault = _deployEmptyVault();
        MockERC721 nft = new MockERC721();
        nft.mint(address(vault), 99);
        assertEq(nft.ownerOf(99), address(vault));
    }

    function test_receiveERC1155() public {
        vault = _deployEmptyVault();
        MockERC1155 multi = new MockERC1155();
        multi.mint(address(vault), 1, 42);
        assertEq(multi.balanceOf(address(vault), 1), 42);
    }

    function test_receiveNative() public {
        vault = _deployEmptyVault();
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        (bool ok,) = address(vault).call{ value: 1 ether }("");
        assertTrue(ok);
        assertEq(address(vault).balance, 1 ether);
    }

    function test_supportsInterface() public {
        vault = _deployEmptyVault();
        // IERC165
        assertTrue(vault.supportsInterface(0x01ffc9a7));
        // IERC721Receiver (0x150b7a02)
        assertTrue(vault.supportsInterface(0x150b7a02));
        // IERC1155Receiver (0x4e2312e0)
        assertTrue(vault.supportsInterface(0x4e2312e0));
        // random
        assertFalse(vault.supportsInterface(0xdeadbeef));
    }
```

- [ ] **Step 3: Run**

Run: `cd contracts && forge test --match-contract TokagentVaultTest --match-test "test_ownerWithdraw|test_receive|test_supportsInterface" -vv 2>&1 | tail -30`
Expected: 9 passing tests.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/TokagentVault.t.sol
git commit -m "test: TokagentVault owner withdraw paths and asset receivers"
```

---

### Task A7: Unit test — emergency exit from compromised-operator state

**Files:**
- Modify: `contracts/test/TokagentVault.t.sol`

- [ ] **Step 1: Append the scenario test**

```solidity
    // ============ Emergency-exit scenario test ============

    function test_emergencyExit_ownerRecoversAfterOperatorCompromise() public {
        // Arrange: vault has funds and a fully-capable operator.
        vault = _deployWithTargetAllowlisted();
        token.mint(address(vault), 500e18);
        vm.deal(address(vault), 2 ether);

        // Act 1 — operator is compromised: attacker tries to drain via allowlisted path.
        // The attacker can only call allowlisted selectors. setValue doesn't move funds.
        TokagentVault.Call[] memory benign = new TokagentVault.Call[](1);
        benign[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 123),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(benign);
        // Funds unchanged.
        assertEq(token.balanceOf(address(vault)), 500e18);
        assertEq(address(vault).balance, 2 ether);

        // Act 2 — attacker tries to add a malicious entry. They can't, it's owner-only.
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOwner.selector, operator));
        vault.ownerSetAllowlist(address(token), IERC20.transfer.selector, true);

        // Act 3 — owner zeroes operator and withdraws all assets.
        vm.startPrank(owner);
        vault.ownerSetOperator(bob); // dummy rotate; could also just withdraw
        vault.ownerWithdrawERC20(address(token), 500e18, owner);
        vault.ownerWithdrawNative(2 ether, payable(owner));
        vm.stopPrank();

        // Assert — owner recovered all funds, former operator has no access.
        assertEq(token.balanceOf(owner), 500e18);
        assertEq(owner.balance, 2 ether);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(address(vault).balance, 0);
    }
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract TokagentVaultTest --match-test test_emergencyExit -vv 2>&1 | tail -15`
Expected: 1 passing test.

- [ ] **Step 3: Run ALL TokagentVault tests to confirm the full suite**

Run: `cd contracts && forge test --match-contract TokagentVaultTest -v 2>&1 | tail -10`
Expected: All 40+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/TokagentVault.t.sol
git commit -m "test: TokagentVault emergency exit scenario"
```

---

## Phase B: Factory Extension (VaultFactory v4)

### Task B1: Update IVaultFactory interface

**Files:**
- Modify: `contracts/src/interfaces/IVaultFactory.sol` (add types, signatures, event)

- [ ] **Step 1: Read the existing interface to understand its layout**

Run: `wc -l contracts/src/interfaces/IVaultFactory.sol`

- [ ] **Step 2: Append the new types, function signatures, and event**

Append the following BEFORE the closing `}` of the `IVaultFactory` interface (check the existing file for the exact structure; the additions are pure addition, no modifications):

```solidity
    // ============ Tokagent Vault additions (v4) ============

    /// @notice (target, selector) allowlist entry.
    struct TokagentEntry {
        address target;
        bytes4 selector;
    }

    /// @notice Initial ERC20 approval to seed into the vault at deploy time.
    /// @dev The spender MUST appear in the initialAllowlist passed to deployTokagentVault.
    struct TokagentApprovalSpec {
        address token;
        address spender;
        uint256 amount;
    }

    /// @notice Emitted when a Tokagent (non-zkp) vault is deployed.
    event TokagentVaultDeployed(
        address indexed vault,
        address indexed owner,
        address indexed operator,
        uint256 salt,
        bytes32 kind
    );

    /// @notice Deploy a Tokagent (non-zkp) vault via CREATE2, seeding the allowlist and approvals atomically.
    /// @param operator The operator address (the agent's hot wallet).
    /// @param initialAllowlist Initial (target, selector) pairs to seed.
    /// @param initialApprovals Initial ERC20 approvals; each `spender` must appear in `initialAllowlist`.
    /// @param userSalt User-provided salt for CREATE2 address derivation.
    function deployTokagentVault(
        address operator,
        TokagentEntry[] calldata initialAllowlist,
        TokagentApprovalSpec[] calldata initialApprovals,
        bytes32 userSalt
    ) external returns (address vault);

    /// @notice Compute the CREATE2 address for a Tokagent vault given the deploy parameters.
    function computeTokagentVaultAddress(
        address owner_,
        address operator,
        TokagentEntry[] calldata initialAllowlist,
        TokagentApprovalSpec[] calldata initialApprovals,
        bytes32 userSalt
    ) external view returns (address vault, bytes32 salt);

    /// @notice One-time setter for the TokagentVault creation code store.
    /// @dev Revert if already set. Owner-only.
    function setTokagentVaultCreationCodeStoreOnce(address store) external;

    /// @notice Read the configured TokagentVault creation code store.
    function tokagentVaultCreationCodeStore() external view returns (address);
```

- [ ] **Step 3: Compile**

Run: `cd contracts && forge build --force 2>&1 | tail -10`
Expected: `Compiler run successful` with zero errors. `VaultFactory.sol` will now fail to compile because it doesn't implement the new interface methods — that's fine, we fix it in the next task.

Actually — the factory uses `is IVaultFactory` so unimplemented methods are a compile error. To keep the staging clean: add `abstract` to the factory OR stub the new methods with `revert("not implemented")` in this task and fill them in the next.

Use the stub approach: in `VaultFactory.sol`, add these right above the closing brace. Use the `IVaultFactory.` prefix on the struct types — it's required when the struct is declared in a parent interface and the contract uses the type in a function parameter:

```solidity
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
```

- [ ] **Step 4: Compile to confirm stubs make it green**

Run: `cd contracts && forge build --force 2>&1 | tail -10`
Expected: success.

- [ ] **Step 5: Run the FULL existing factory test suite to verify no regression from interface changes**

Run: `cd contracts && forge test --match-path "test/VaultFactory*" -v 2>&1 | tail -15`
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/interfaces/IVaultFactory.sol contracts/src/VaultFactory.sol
git commit -m "contracts: add Tokagent vault signatures to IVaultFactory (stubs)"
```

---

### Task B2: Add TokagentVaultCreationCodeStore

**Files:**
- Create: `contracts/src/TokagentVaultCreationCodeStore.sol`

- [ ] **Step 1: Create the file**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TokagentVault } from "./TokagentVault.sol";

/// @title TokagentVaultCreationCodeStore
/// @notice Stores TokagentVault creation code as runtime bytecode.
/// @dev Deploy once. The contract's runtime code IS TokagentVault's initcode.
///      Read via `address(store).code` to avoid embedding TokagentVault bytecode
///      in VaultFactory, keeping VaultFactory under HyperEVM's 3M block gas limit.
contract TokagentVaultCreationCodeStore {
    constructor() {
        bytes memory code = type(TokagentVault).creationCode;
        assembly {
            return(add(code, 0x20), mload(code))
        }
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd contracts && forge build --force 2>&1 | tail -5`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add contracts/src/TokagentVaultCreationCodeStore.sol
git commit -m "contracts: add TokagentVaultCreationCodeStore for HyperEVM deploy gas"
```

---

### Task B3: Wire the factory — storage, one-time setter, internals

**Files:**
- Modify: `contracts/src/VaultFactory.sol`

- [ ] **Step 1: Add the new storage slot**

Locate the `__gap` declaration (currently `uint256[33] private __gap;`, near line 95). Add the new state variable JUST ABOVE it, and shrink the gap from 33 to 32:

```solidity
    /// @notice Contract whose runtime bytecode is TokagentVault creation code.
    ///         One-time settable via setTokagentVaultCreationCodeStoreOnce.
    address public _tokagentVaultCreationCodeStore;

    /// @notice Storage gap for future upgrades. Reduced from 33 → 32 slots
    ///         to accommodate the _tokagentVaultCreationCodeStore field.
    uint256[32] private __gap;
```

Remove the old `uint256[33] private __gap;` line.

- [ ] **Step 2: Replace the `setTokagentVaultCreationCodeStoreOnce` stub with its implementation**

Replace the stub:

```solidity
    function setTokagentVaultCreationCodeStoreOnce(address) external {
        revert("not implemented");
    }
```

with:

```solidity
    /// @inheritdoc IVaultFactory
    function setTokagentVaultCreationCodeStoreOnce(address store) external onlyOwner {
        require(store != address(0), "zero store");
        require(_tokagentVaultCreationCodeStore == address(0), "already set");
        require(store.code.length > 0, "no code at store");
        _tokagentVaultCreationCodeStore = store;
        emit TokagentVaultCodeStoreSet(store);
    }
```

- [ ] **Step 3: Replace the `tokagentVaultCreationCodeStore` stub**

Replace the stub with:

```solidity
    /// @inheritdoc IVaultFactory
    function tokagentVaultCreationCodeStore() external view returns (address) {
        return _tokagentVaultCreationCodeStore;
    }
```

- [ ] **Step 4: Add the new event declaration**

Find the `// ============ Events ============` section in VaultFactory.sol and append:

```solidity
    /// @notice Emitted when the Tokagent vault creation code store is set.
    event TokagentVaultCodeStoreSet(address indexed store);
```

- [ ] **Step 5: Compile**

Run: `cd contracts && forge build --force 2>&1 | tail -5`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/VaultFactory.sol
git commit -m "contracts: VaultFactory storage + one-time setter for Tokagent code store"
```

---

### Task B4: Implement deployTokagentVault and computeTokagentVaultAddress

**Files:**
- Modify: `contracts/src/VaultFactory.sol`

- [ ] **Step 1: Add the internal bytecode helper**

Find the existing `_getOptimisticCreationBytecode` internal function. Append this one right after it:

```solidity
    /// @notice Get the creation bytecode for TokagentVault with constructor arguments.
    function _getTokagentCreationBytecode(
        address owner_,
        address operator,
        IVaultFactory.TokagentEntry[] calldata initialAllowlist,
        IVaultFactory.TokagentApprovalSpec[] calldata initialApprovals
    ) internal view returns (bytes memory) {
        require(_tokagentVaultCreationCodeStore != address(0), "tokagent code store not set");
        return abi.encodePacked(
            _tokagentVaultCreationCodeStore.code,
            abi.encode(owner_, operator, initialAllowlist, initialApprovals)
        );
    }

    /// @notice Compute CREATE2 salt specifically for Tokagent vaults.
    /// @dev Distinct salt derivation from zkp vaults so the same (owner, userSalt)
    ///      can coexist as a Tokagent vault and a KernelVault without address collision.
    function _computeTokagentSalt(
        address owner_,
        address operator,
        bytes32 userSalt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("TOKAGENT", owner_, operator, userSalt));
    }
```

- [ ] **Step 2: Replace the `deployTokagentVault` stub with its implementation**

```solidity
    /// @inheritdoc IVaultFactory
    function deployTokagentVault(
        address operator,
        IVaultFactory.TokagentEntry[] calldata initialAllowlist,
        IVaultFactory.TokagentApprovalSpec[] calldata initialApprovals,
        bytes32 userSalt
    ) external returns (address vault) {
        require(operator != address(0), "zero operator");

        bytes32 salt = _computeTokagentSalt(msg.sender, operator, userSalt);
        bytes memory bytecode = _getTokagentCreationBytecode(
            msg.sender, operator, initialAllowlist, initialApprovals
        );

        assembly {
            vault := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        if (vault == address(0)) {
            revert Create2DeploymentFailed();
        }

        isDeployedVault[vault] = true;
        _deployedVaults.push(vault);

        emit TokagentVaultDeployed(
            vault,
            msg.sender,
            operator,
            uint256(userSalt),
            keccak256("TokagentVault:v1")
        );

        return vault;
    }
```

- [ ] **Step 3: Replace the `computeTokagentVaultAddress` stub**

```solidity
    /// @inheritdoc IVaultFactory
    function computeTokagentVaultAddress(
        address owner_,
        address operator,
        IVaultFactory.TokagentEntry[] calldata initialAllowlist,
        IVaultFactory.TokagentApprovalSpec[] calldata initialApprovals,
        bytes32 userSalt
    ) external view returns (address vault, bytes32 salt) {
        salt = _computeTokagentSalt(owner_, operator, userSalt);
        bytes memory bytecode = _getTokagentCreationBytecode(
            owner_, operator, initialAllowlist, initialApprovals
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        vault = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash))
                )
            )
        );
    }
```

- [ ] **Step 4: Compile**

Run: `cd contracts && forge build --force 2>&1 | tail -10`
Expected: success.

- [ ] **Step 5: Run existing factory tests to confirm no regression**

Run: `cd contracts && forge test --match-path "test/VaultFactory*" -v 2>&1 | tail -15`
Expected: all existing tests still pass (the stubs are replaced but new tests aren't written yet).

- [ ] **Step 6: Commit**

```bash
git add contracts/src/VaultFactory.sol
git commit -m "contracts: implement VaultFactory.deployTokagentVault + computeTokagentVaultAddress"
```

---

### Task B5: Factory integration tests

**Files:**
- Create: `contracts/test/VaultFactoryTokagent.t.sol`

- [ ] **Step 1: Write the test file**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { TokagentVaultCreationCodeStore } from "../src/TokagentVaultCreationCodeStore.sol";
import { VaultCreationCodeStore } from "../src/VaultCreationCodeStore.sol";
import { IVaultFactory } from "../src/interfaces/IVaultFactory.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Dummy minimal registry for factory initialization — we never call it for Tokagent vaults.
contract DummyRegistry {
    function get(bytes32) external pure returns (bytes memory) {
        return "";
    }
}

// Minimal target used by Tokagent vault tests
contract _MockTarget {
    function setValue(uint256) external {}
}

contract VaultFactoryTokagentTest is Test {
    VaultFactory internal factory;
    TokagentVaultCreationCodeStore internal store;
    _MockTarget internal target;

    address internal owner = makeAddr("factoryOwner");
    address internal user = makeAddr("user");
    address internal operator = makeAddr("operator");
    bytes4 internal constant SET_VALUE = bytes4(keccak256("setValue(uint256)"));

    function setUp() public {
        // Deploy factory impl + proxy
        VaultFactory impl = new VaultFactory();
        DummyRegistry reg = new DummyRegistry();
        VaultCreationCodeStore kernelStore = new VaultCreationCodeStore();
        bytes memory initData = abi.encodeWithSelector(
            VaultFactory.initialize.selector,
            address(reg),
            address(0xdead), // verifier placeholder — unused by Tokagent paths
            owner,
            address(kernelStore)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        factory = VaultFactory(address(proxy));

        // Deploy and register the Tokagent code store
        store = new TokagentVaultCreationCodeStore();
        vm.prank(owner);
        factory.setTokagentVaultCreationCodeStoreOnce(address(store));

        target = new _MockTarget();
    }

    function _emptyEntries() internal pure returns (IVaultFactory.TokagentEntry[] memory) {
        return new IVaultFactory.TokagentEntry[](0);
    }

    function _emptyApprovals() internal pure returns (IVaultFactory.TokagentApprovalSpec[] memory) {
        return new IVaultFactory.TokagentApprovalSpec[](0);
    }

    function _targetEntries() internal view returns (IVaultFactory.TokagentEntry[] memory entries) {
        entries = new IVaultFactory.TokagentEntry[](1);
        entries[0] = IVaultFactory.TokagentEntry({ target: address(target), selector: SET_VALUE });
    }

    // ============ setTokagentVaultCreationCodeStoreOnce ============

    function test_setTokagentStore_setsOnce() public {
        assertEq(factory.tokagentVaultCreationCodeStore(), address(store));
    }

    function test_setTokagentStore_rejectsSecondSet() public {
        TokagentVaultCreationCodeStore store2 = new TokagentVaultCreationCodeStore();
        vm.prank(owner);
        vm.expectRevert("already set");
        factory.setTokagentVaultCreationCodeStoreOnce(address(store2));
    }

    function test_setTokagentStore_rejectsNonOwner() public {
        TokagentVaultCreationCodeStore store2 = new TokagentVaultCreationCodeStore();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.OwnableUnauthorizedAccount.selector, user));
        factory.setTokagentVaultCreationCodeStoreOnce(address(store2));
    }

    function test_setTokagentStore_rejectsZero() public {
        // Deploy fresh factory so we can attempt setting to zero on unset state.
        VaultFactory impl = new VaultFactory();
        DummyRegistry reg = new DummyRegistry();
        VaultCreationCodeStore kernelStore = new VaultCreationCodeStore();
        bytes memory initData = abi.encodeWithSelector(
            VaultFactory.initialize.selector,
            address(reg),
            address(0xdead),
            owner,
            address(kernelStore)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        VaultFactory freshFactory = VaultFactory(address(proxy));
        vm.prank(owner);
        vm.expectRevert("zero store");
        freshFactory.setTokagentVaultCreationCodeStoreOnce(address(0));
    }

    // ============ deployTokagentVault ============

    function test_deployTokagent_happyPath() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();

        uint256 beforeCount = factory.vaultCount();
        vm.prank(user);
        address vaultAddr = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(1)));
        uint256 afterCount = factory.vaultCount();

        assertEq(afterCount, beforeCount + 1);
        assertTrue(factory.isDeployedVault(vaultAddr));

        TokagentVault v = TokagentVault(payable(vaultAddr));
        assertEq(v.owner(), user);
        assertEq(v.operator(), operator);
        assertTrue(v.isAllowlisted(address(target), SET_VALUE));
        assertEq(v.vaultKind(), keccak256("TokagentVault:v1"));
    }

    function test_deployTokagent_create2Deterministic() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();

        (address predicted, ) = factory.computeTokagentVaultAddress(
            user, operator, entries, approvals, bytes32(uint256(7))
        );

        vm.prank(user);
        address actual = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(7)));

        assertEq(actual, predicted);
    }

    function test_deployTokagent_sameSaltDifferentOperatorDifferentAddress() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();
        address op2 = makeAddr("op2");

        vm.prank(user);
        address v1 = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(1)));
        vm.prank(user);
        address v2 = factory.deployTokagentVault(op2, entries, approvals, bytes32(uint256(1)));

        assertTrue(v1 != v2);
    }

    function test_deployTokagent_rejectsZeroOperator() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();
        vm.prank(user);
        vm.expectRevert("zero operator");
        factory.deployTokagentVault(address(0), entries, approvals, bytes32(0));
    }

    function test_deployTokagent_beforeStoreSetReverts() public {
        // Fresh factory, store never set.
        VaultFactory impl = new VaultFactory();
        DummyRegistry reg = new DummyRegistry();
        VaultCreationCodeStore kernelStore = new VaultCreationCodeStore();
        bytes memory initData = abi.encodeWithSelector(
            VaultFactory.initialize.selector,
            address(reg),
            address(0xdead),
            owner,
            address(kernelStore)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        VaultFactory f = VaultFactory(address(proxy));
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();
        vm.prank(user);
        vm.expectRevert("tokagent code store not set");
        f.deployTokagentVault(operator, entries, approvals, bytes32(0));
    }

    function test_deployTokagent_vaultKindDistinguishesFromZkp() public {
        IVaultFactory.TokagentEntry[] memory entries = _targetEntries();
        IVaultFactory.TokagentApprovalSpec[] memory approvals = _emptyApprovals();

        vm.prank(user);
        address vaultAddr = factory.deployTokagentVault(operator, entries, approvals, bytes32(uint256(1)));
        TokagentVault v = TokagentVault(payable(vaultAddr));
        assertEq(v.vaultKind(), keccak256("TokagentVault:v1"));

        // Simulated zkp-vault-lacks-vaultKind behavior: calling vaultKind on a random address reverts.
        // The frontend uses try/catch; we just assert the Tokagent vault exposes it cleanly.
    }
}
```

- [ ] **Step 2: Compile and run**

Run: `cd contracts && forge test --match-contract VaultFactoryTokagentTest -vv 2>&1 | tail -40`
Expected: 8 passing tests.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/VaultFactoryTokagent.t.sol
git commit -m "test: VaultFactory deployTokagentVault + one-time code-store setter"
```

---

## Phase C: Fuzz + Fork Tests

### Task C1: Fuzz tests — invariants

**Files:**
- Create: `contracts/test/TokagentVaultFuzz.t.sol`

- [ ] **Step 1: Write the fuzz test file**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { IERC20 } from "../src/interfaces/IERC20.sol";

contract _FuzzMockERC20 {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function approve(address, uint256) external pure returns (bool) { return true; }
}

contract TokagentVaultFuzzTest is Test {
    TokagentVault internal vault;
    _FuzzMockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");

    function setUp() public {
        token = new _FuzzMockERC20();
        // Deploy an empty-allowlist vault.
        TokagentVault.Entry[] memory e = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory a = new TokagentVault.ApprovalSpec[](0);
        vault = new TokagentVault(owner, operator, e, a);
    }

    /// Fuzz: random (target, selector, data) triples passed through executeBatch must revert
    /// unless the specific (target, selector) pair was allowlisted.
    function testFuzz_executeBatch_unallowlistedAlwaysReverts(
        address target,
        bytes4 selector,
        bytes calldata trailer
    ) public {
        vm.assume(target != address(0) && target != address(vault) && target.code.length == 0);
        // Construct calldata: selector + random trailer.
        bytes memory data = abi.encodePacked(selector, trailer);
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({ target: target, data: data, value: 0 });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.CallNotAllowlisted.selector, target, selector)
        );
        vault.executeBatch(calls);
    }

    /// Fuzz: ownerWithdrawERC20 must always succeed regardless of allowlist state,
    /// provided the vault balance is sufficient.
    function testFuzz_ownerWithdrawERC20_alwaysWorks(uint96 deposited, uint96 amount, address to) public {
        vm.assume(to != address(0));
        vm.assume(to != address(token)); // token's internal accounting otherwise double-counts
        amount = uint96(bound(amount, 0, deposited));
        token.mint(address(vault), deposited);
        uint256 toBalanceBefore = token.balanceOf(to);
        vm.prank(owner);
        vault.ownerWithdrawERC20(address(token), amount, to);
        assertEq(token.balanceOf(to), toBalanceBefore + amount);
        assertEq(token.balanceOf(address(vault)), uint256(deposited) - uint256(amount));
    }

    /// Fuzz: ownerSetAllowlist followed by the inverse must leave state unchanged.
    function testFuzz_allowlistToggle_isInvolutive(address target, bytes4 selector) public {
        vm.assume(target != address(0));
        bool before = vault.isAllowlisted(target, selector);
        uint256 countBefore = vault.allowlistedSelectorCount(target);
        vm.startPrank(owner);
        vault.ownerSetAllowlist(target, selector, !before);
        vault.ownerSetAllowlist(target, selector, before);
        vm.stopPrank();
        assertEq(vault.isAllowlisted(target, selector), before);
        assertEq(vault.allowlistedSelectorCount(target), countBefore);
    }

    /// Fuzz: approveToken rejects any spender with zero allowlisted selectors,
    /// regardless of token/amount values.
    function testFuzz_approveToken_rejectsUnknownSpender(address spender, uint256 amount) public {
        vm.assume(vault.allowlistedSelectorCount(spender) == 0);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, spender));
        vault.approveToken(address(token), spender, amount);
    }
}
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract TokagentVaultFuzzTest -vv 2>&1 | tail -25`
Expected: 4 passing fuzz tests. Each runs Foundry's default 256 runs.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/TokagentVaultFuzz.t.sol
git commit -m "test: TokagentVault fuzz invariants (executeBatch, ownerWithdraw, allowlist)"
```

---

### Task C2: Fork tests — Polygon (Aave v3 + Polymarket)

**Files:**
- Create: `contracts/test/TokagentVaultFork.t.sol`

- [ ] **Step 1: Write the fork test file**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { IERC20 } from "../src/interfaces/IERC20.sol";

/// Minimal Aave v3 Pool interface (reproduced here to avoid pulling the full Aave SDK).
interface IAavePoolMinimal {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/// Polygon mainnet addresses for fork tests.
contract TokagentVaultForkTest is Test {
    // Polygon mainnet
    address internal constant POLYGON_AAVE_V3_POOL = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
    address internal constant POLYGON_USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    // Arbitrary USDC whale on Polygon used as a source of funds in the fork
    address internal constant USDC_WHALE = 0xF977814e90dA44bFA03b6295A0616a897441aceC;

    TokagentVault internal vault;
    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");

    bytes4 internal constant AAVE_SUPPLY_SELECTOR =
        bytes4(keccak256("supply(address,uint256,address,uint16)"));
    bytes4 internal constant AAVE_WITHDRAW_SELECTOR =
        bytes4(keccak256("withdraw(address,uint256,address)"));
    bytes4 internal constant ERC20_APPROVE_SELECTOR = bytes4(keccak256("approve(address,uint256)"));

    /// @dev Forks Polygon mainnet. Requires POLYGON_RPC_URL env var.
    function setUp() public {
        vm.createSelectFork(vm.envString("POLYGON_RPC_URL"));

        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({
            target: POLYGON_AAVE_V3_POOL,
            selector: AAVE_SUPPLY_SELECTOR
        });
        entries[1] = TokagentVault.Entry({
            target: POLYGON_AAVE_V3_POOL,
            selector: AAVE_WITHDRAW_SELECTOR
        });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](1);
        approvals[0] = TokagentVault.ApprovalSpec({
            token: POLYGON_USDC,
            spender: POLYGON_AAVE_V3_POOL,
            amount: type(uint256).max
        });
        vault = new TokagentVault(owner, operator, entries, approvals);

        // Fund the vault with USDC from the whale.
        vm.prank(USDC_WHALE);
        (bool ok,) = POLYGON_USDC.call(
            abi.encodeWithSelector(IERC20.transfer.selector, address(vault), 1_000 * 1e6)
        );
        require(ok, "whale transfer failed");
    }

    function test_fork_aaveSupplyAndWithdraw() public {
        // Pre-state: vault has 1000 USDC, 0 aUSDC.
        uint256 usdcBefore = IERC20(POLYGON_USDC).balanceOf(address(vault));
        assertEq(usdcBefore, 1_000 * 1e6);

        // Supply 500 USDC to Aave through the vault.
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(
                AAVE_SUPPLY_SELECTOR,
                POLYGON_USDC,
                500 * 1e6,
                address(vault),
                uint16(0)
            ),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);

        // Post-supply: vault has 500 USDC + aUSDC balance > 0.
        assertEq(IERC20(POLYGON_USDC).balanceOf(address(vault)), 500 * 1e6);

        // Withdraw 300 USDC back.
        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(
                AAVE_WITHDRAW_SELECTOR,
                POLYGON_USDC,
                300 * 1e6,
                address(vault)
            ),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);

        // Post-withdraw: vault has ~800 USDC (ignoring tiny Aave interest).
        uint256 usdcAfter = IERC20(POLYGON_USDC).balanceOf(address(vault));
        assertGe(usdcAfter, 800 * 1e6);
        assertLe(usdcAfter, 800 * 1e6 + 100); // tolerance for interest
    }

    function test_fork_unallowlistedAaveFunctionReverts() public {
        // flashLoanSimple is a real Aave function but was NOT added to the allowlist.
        bytes4 flashLoanSelector = bytes4(keccak256("flashLoanSimple(address,address,uint256,bytes,uint16)"));
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(flashLoanSelector, address(vault), POLYGON_USDC, 100 * 1e6, "", uint16(0)),
            value: 0
        });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                TokagentVault.CallNotAllowlisted.selector,
                POLYGON_AAVE_V3_POOL,
                flashLoanSelector
            )
        );
        vault.executeBatch(calls);
    }

    function test_fork_operatorCannotApproveUnknownSpender() public {
        address arbitrary = makeAddr("attacker-contract");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, arbitrary));
        vault.approveToken(POLYGON_USDC, arbitrary, type(uint256).max);
    }

    function test_fork_ownerCanRecoverAfterCompromise() public {
        // Even after operator supplies to Aave, owner can withdraw the remaining USDC directly.
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(
                AAVE_SUPPLY_SELECTOR,
                POLYGON_USDC,
                500 * 1e6,
                address(vault),
                uint16(0)
            ),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);

        uint256 ownerBefore = IERC20(POLYGON_USDC).balanceOf(owner);
        vm.prank(owner);
        vault.ownerWithdrawERC20(POLYGON_USDC, 500 * 1e6, owner);
        assertEq(IERC20(POLYGON_USDC).balanceOf(owner), ownerBefore + 500 * 1e6);
    }
}
```

- [ ] **Step 2: Set up RPC and run the fork tests**

Run:
```bash
export POLYGON_RPC_URL=https://polygon-rpc.com
cd contracts && forge test --match-contract TokagentVaultForkTest -vv 2>&1 | tail -30
```

Expected: 4 passing tests. If the public RPC is rate-limited, use Alchemy / Infura. If USDC_WHALE's Polygon balance has shifted since plan authoring, pick a different large-balance address from Polygonscan's USDC holder list and update `USDC_WHALE`.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/TokagentVaultFork.t.sol
git commit -m "test: TokagentVault Polygon fork tests against Aave v3 USDC pool"
```

---

## Phase D: SDK — TokagentVault ABI + Client

### Task D1: Regenerate ABIs

**Files:**
- Modify: `sdk/src/abi/VaultFactory.ts` (regenerated)
- Create: `sdk/src/abi/TokagentVault.ts`

- [ ] **Step 1: Check how existing ABIs are generated**

Run: `cat sdk/package.json | head -40` and look for an ABI gen script.
Expected: there's likely a script that reads forge output from `contracts/out/*/*.abi.json` and writes TS files. If not, ABIs are hand-copied.

- [ ] **Step 2: Compile contracts and grab the ABIs**

Run: `cd contracts && forge build --force && jq -c '.abi' out/VaultFactory.sol/VaultFactory.json > /tmp/factory.abi.json && jq -c '.abi' out/TokagentVault.sol/TokagentVault.json > /tmp/tokagent.abi.json`

- [ ] **Step 3: Write `sdk/src/abi/TokagentVault.ts`**

```typescript
// Auto-generated from contracts/out/TokagentVault.sol/TokagentVault.json
// Run `scripts/regenerate-abis.sh` to refresh (or manually replace this array).

export const TokagentVaultABI = [
  // PASTE THE CONTENTS OF /tmp/tokagent.abi.json HERE AS A JS ARRAY LITERAL
  // with `as const` appended on the closing bracket.
] as const;
```

Practical approach: `cat /tmp/tokagent.abi.json` and inline the JSON into the file, then add `as const` after the closing `]`.

- [ ] **Step 4: Update `sdk/src/abi/VaultFactory.ts`**

Same flow: replace the exported `VaultFactoryABI` array with the regenerated JSON from `/tmp/factory.abi.json` (add `as const`).

- [ ] **Step 5: Typecheck the SDK**

Run: `cd sdk && npm run typecheck 2>&1 | tail -10`
Expected: success. If failures, they're likely name changes — reconcile.

- [ ] **Step 6: Commit**

```bash
git add sdk/src/abi/TokagentVault.ts sdk/src/abi/VaultFactory.ts
git commit -m "sdk: regenerate VaultFactory ABI + add TokagentVault ABI"
```

---

### Task D2: TokagentVaultClient

**Files:**
- Create: `sdk/src/clients/TokagentVaultClient.ts`
- Create: `sdk/src/__tests__/TokagentVaultClient.test.ts`
- Modify: `sdk/src/index.ts` (export the new client)

- [ ] **Step 1: Write the client**

```typescript
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { TokagentVaultABI } from '../abi/TokagentVault';

export interface TokagentEntry {
  target: Address;
  selector: Hex;
}

export interface TokagentCall {
  target: Address;
  data: Hex;
  value: bigint;
}

/// Light-weight client that exposes the operator + view surface of a deployed TokagentVault.
/// Owner-only functions are intentionally separate (composed via transactions built by the frontend).
export class TokagentVaultClient {
  constructor(
    public readonly vault: Address,
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
  ) {}

  async owner(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'owner',
    })) as Address;
  }

  async operator(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'operator',
    })) as Address;
  }

  async vaultKind(): Promise<Hex> {
    return (await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'vaultKind',
    })) as Hex;
  }

  async isAllowlisted(target: Address, selector: Hex): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'isAllowlisted',
      args: [target, selector],
    })) as boolean;
  }

  async executeBatch(calls: TokagentCall[]): Promise<Hex> {
    if (!this.walletClient) throw new Error('walletClient required for writes');
    const account = this.walletClient.account;
    if (!account) throw new Error('walletClient has no account');
    const hash = await this.walletClient.writeContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'executeBatch',
      args: [calls],
      account,
      chain: null,
    });
    return hash;
  }

  async approveToken(token: Address, spender: Address, amount: bigint): Promise<Hex> {
    if (!this.walletClient) throw new Error('walletClient required for writes');
    const account = this.walletClient.account;
    if (!account) throw new Error('walletClient has no account');
    const hash = await this.walletClient.writeContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'approveToken',
      args: [token, spender, amount],
      account,
      chain: null,
    });
    return hash;
  }
}
```

- [ ] **Step 2: Write the client test**

```typescript
import { describe, expect, it } from 'vitest';
import { TokagentVaultClient } from '../clients/TokagentVaultClient';
import type { PublicClient } from 'viem';

describe('TokagentVaultClient', () => {
  it('delegates owner() to publicClient.readContract', async () => {
    const calls: unknown[] = [];
    const publicClient = {
      readContract: (args: unknown) => {
        calls.push(args);
        return Promise.resolve('0x1111111111111111111111111111111111111111');
      },
    } as unknown as PublicClient;
    const client = new TokagentVaultClient(
      '0x2222222222222222222222222222222222222222',
      publicClient,
    );
    const owner = await client.owner();
    expect(owner).toBe('0x1111111111111111111111111111111111111111');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { functionName: string }).functionName).toBe('owner');
  });

  it('executeBatch requires walletClient', async () => {
    const publicClient = {
      readContract: () => Promise.resolve('0x0'),
    } as unknown as PublicClient;
    const client = new TokagentVaultClient(
      '0x2222222222222222222222222222222222222222',
      publicClient,
    );
    await expect(
      client.executeBatch([
        { target: '0x3333333333333333333333333333333333333333', data: '0xdeadbeef', value: 0n },
      ]),
    ).rejects.toThrow(/walletClient required/);
  });
});
```

- [ ] **Step 3: Add the export**

Append to `sdk/src/index.ts`:

```typescript
export { TokagentVaultClient } from './clients/TokagentVaultClient';
export type { TokagentEntry, TokagentCall } from './clients/TokagentVaultClient';
```

- [ ] **Step 4: Run typecheck + tests**

Run: `cd sdk && npm run typecheck && npm test -- TokagentVaultClient 2>&1 | tail -15`
Expected: typecheck passes, 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sdk/src/clients/TokagentVaultClient.ts sdk/src/__tests__/TokagentVaultClient.test.ts sdk/src/index.ts
git commit -m "sdk: add TokagentVaultClient with operator + view surface"
```

---

## Phase E: Deploy Scripts

### Task E1: Code store deployment script

**Files:**
- Create: `contracts/script/deploy/DeployTokagentCodeStore.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { TokagentVaultCreationCodeStore } from "../../src/TokagentVaultCreationCodeStore.sol";

/// @notice Deploys the TokagentVaultCreationCodeStore on the target chain.
/// @dev Usage: forge script script/deploy/DeployTokagentCodeStore.s.sol --rpc-url $RPC --private-key $PK --broadcast --legacy
contract DeployTokagentCodeStore is Script {
    function run() external returns (address store) {
        vm.startBroadcast();
        store = address(new TokagentVaultCreationCodeStore());
        vm.stopBroadcast();
        console.log("TokagentVaultCreationCodeStore deployed to:", store);
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd contracts && forge build --force 2>&1 | tail -5`
Expected: success.

- [ ] **Step 3: Dry-run on local anvil to verify the script works**

```bash
anvil --port 8545 &
ANVIL_PID=$!
cd contracts && forge script script/deploy/DeployTokagentCodeStore.s.sol --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast 2>&1 | tail -10
kill $ANVIL_PID
```

Expected: `TokagentVaultCreationCodeStore deployed to: 0x...` in the output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add contracts/script/deploy/DeployTokagentCodeStore.s.sol
git commit -m "script: deploy TokagentVaultCreationCodeStore"
```

---

### Task E2: Factory upgrade scheduling script

**Files:**
- Create: `contracts/script/deploy/DeployTokagentFactoryUpgrade.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";

/// @notice Deploys a new VaultFactory implementation (v4, includes deployTokagentVault)
///         and schedules the UUPS upgrade via the 48h timelock.
/// @dev Required env vars:
///        - VAULT_FACTORY_PROXY: the existing factory proxy address on the target chain
/// @dev Usage: forge script script/deploy/DeployTokagentFactoryUpgrade.s.sol --rpc-url $RPC --private-key $OWNER_PK --broadcast --legacy
contract DeployTokagentFactoryUpgrade is Script {
    function run() external returns (address newImpl) {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        vm.startBroadcast();
        newImpl = address(new VaultFactory());
        VaultFactory(proxy).scheduleImplementation(newImpl);
        vm.stopBroadcast();
        console.log("New VaultFactory impl:", newImpl);
        console.log("Scheduled on proxy:", proxy);
        console.log("Activates at:", VaultFactory(proxy).pendingImplementationActivatesAt());
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd contracts && forge build --force 2>&1 | tail -5`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add contracts/script/deploy/DeployTokagentFactoryUpgrade.s.sol
git commit -m "script: deploy + schedule VaultFactory v4 upgrade"
```

---

### Task E3: Factory upgrade activation script (48h later)

**Files:**
- Create: `contracts/script/deploy/ActivateTokagentFactoryUpgrade.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @notice Activates a previously scheduled VaultFactory UUPS upgrade.
///         Must be called >= 48h after scheduling.
/// @dev Required env vars:
///        - VAULT_FACTORY_PROXY: the factory proxy address
/// @dev Usage: forge script script/deploy/ActivateTokagentFactoryUpgrade.s.sol --rpc-url $RPC --private-key $OWNER_PK --broadcast --legacy
contract ActivateTokagentFactoryUpgrade is Script {
    function run() external {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        address scheduled = VaultFactory(proxy).pendingImplementation();
        require(scheduled != address(0), "no scheduled implementation");
        console.log("Activating scheduled impl:", scheduled);

        vm.startBroadcast();
        UUPSUpgradeable(proxy).upgradeToAndCall(scheduled, "");
        vm.stopBroadcast();

        console.log("Upgrade activated");
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd contracts && forge build --force 2>&1 | tail -5`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add contracts/script/deploy/ActivateTokagentFactoryUpgrade.s.sol
git commit -m "script: activate scheduled VaultFactory v4 upgrade"
```

---

### Task E4: Code store wiring script

**Files:**
- Create: `contracts/script/deploy/SetTokagentCodeStore.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";

/// @notice Wires the deployed TokagentVaultCreationCodeStore into the upgraded VaultFactory.
/// @dev Required env vars:
///        - VAULT_FACTORY_PROXY: upgraded factory (v4)
///        - TOKAGENT_CODE_STORE: address returned by DeployTokagentCodeStore
/// @dev Usage: forge script script/deploy/SetTokagentCodeStore.s.sol --rpc-url $RPC --private-key $OWNER_PK --broadcast --legacy
contract SetTokagentCodeStore is Script {
    function run() external {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        address store = vm.envAddress("TOKAGENT_CODE_STORE");
        vm.startBroadcast();
        VaultFactory(proxy).setTokagentVaultCreationCodeStoreOnce(store);
        vm.stopBroadcast();
        console.log("Tokagent code store set:", store);
    }
}
```

- [ ] **Step 2: Compile + commit**

```bash
cd contracts && forge build --force 2>&1 | tail -5
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add contracts/script/deploy/SetTokagentCodeStore.s.sol
git commit -m "script: wire Tokagent code store into upgraded factory"
```

---

### Task E5: Smoke-test deploy script

**Files:**
- Create: `contracts/script/deploy/DeployTokagentVaultTest.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";
import { IVaultFactory } from "../../src/interfaces/IVaultFactory.sol";
import { TokagentVault } from "../../src/TokagentVault.sol";

/// @notice End-to-end smoke test: deploys an empty-allowlist Tokagent vault via the factory,
///         verifies deployment state, and prints the address for manual inspection.
/// @dev Env vars:
///        - VAULT_FACTORY_PROXY
///        - TOKAGENT_OPERATOR: operator address for the test vault
///        - TOKAGENT_USER_SALT (optional, defaults to 0xdeadbeef): CREATE2 salt
contract DeployTokagentVaultTest is Script {
    function run() external returns (address vault) {
        address proxy = vm.envAddress("VAULT_FACTORY_PROXY");
        address operator = vm.envAddress("TOKAGENT_OPERATOR");
        bytes32 userSalt;
        try vm.envBytes32("TOKAGENT_USER_SALT") returns (bytes32 s) {
            userSalt = s;
        } catch {
            userSalt = bytes32(uint256(0xdeadbeef));
        }

        IVaultFactory.TokagentEntry[] memory entries = new IVaultFactory.TokagentEntry[](0);
        IVaultFactory.TokagentApprovalSpec[] memory approvals = new IVaultFactory.TokagentApprovalSpec[](0);

        vm.startBroadcast();
        vault = VaultFactory(proxy).deployTokagentVault(operator, entries, approvals, userSalt);
        vm.stopBroadcast();

        TokagentVault v = TokagentVault(payable(vault));
        console.log("Tokagent vault deployed:", vault);
        console.log("  owner:", v.owner());
        console.log("  operator:", v.operator());
        console.log("  vaultKind:", vm.toString(v.vaultKind()));
        require(v.vaultKind() == keccak256("TokagentVault:v1"), "wrong vaultKind");
        require(VaultFactory(proxy).isDeployedVault(vault), "not tracked");
    }
}
```

- [ ] **Step 2: Compile + commit**

```bash
cd contracts && forge build --force 2>&1 | tail -5
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add contracts/script/deploy/DeployTokagentVaultTest.s.sol
git commit -m "script: smoke-test deploy of TokagentVault via factory"
```

---

## Phase F: tal-cli Extension

### Task F1: Protocol pack registry

**Files:**
- Create: `crates/tal-cli/src/tokagent_packs.rs`
- Modify: `crates/tal-cli/src/main.rs` (module declaration)

- [ ] **Step 1: Write the pack registry**

```rust
//! Protocol pack definitions used by the `tal deploy --kind tokagent` command.
//!
//! A protocol pack is a curated list of (target, selector, human-label) entries
//! that the user allowlists at deploy time. Packs are keyed by (chain_id, pack_id).
//! Adding a new pack: append to `PACKS` below, then reference it on the CLI.

use alloy_primitives::{address, fixed_bytes, Address, FixedBytes};

#[derive(Debug, Clone)]
pub struct PackEntry {
    pub target: Address,
    pub selector: FixedBytes<4>,
    pub label: &'static str,
}

#[derive(Debug, Clone)]
pub struct ApprovalEntry {
    pub token: Address,
    pub spender: Address,
    pub label: &'static str,
}

#[derive(Debug, Clone)]
pub struct ProtocolPack {
    pub id: &'static str,
    pub chain_id: u64,
    pub display_name: &'static str,
    pub entries: &'static [PackEntry],
    pub approvals: &'static [ApprovalEntry],
}

// Polygon Aave v3 pack
const POLYGON_AAVE_V3: ProtocolPack = ProtocolPack {
    id: "aave-v3-polygon",
    chain_id: 137,
    display_name: "Aave v3 on Polygon",
    entries: &[
        PackEntry {
            target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
            selector: fixed_bytes!("617ba037"), // supply(address,uint256,address,uint16)
            label: "Pool.supply",
        },
        PackEntry {
            target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
            selector: fixed_bytes!("69328dec"), // withdraw(address,uint256,address)
            label: "Pool.withdraw",
        },
        PackEntry {
            target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
            selector: fixed_bytes!("a415bcad"), // borrow(address,uint256,uint256,uint16,address)
            label: "Pool.borrow",
        },
        PackEntry {
            target: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
            selector: fixed_bytes!("573ade81"), // repay(address,uint256,uint256,address)
            label: "Pool.repay",
        },
    ],
    approvals: &[ApprovalEntry {
        token: address!("2791Bca1f2de4661ED88A30C99A7a9449Aa84174"), // USDC.e
        spender: address!("794a61358D6845594F94dc1DB02A252b5b4814aD"),
        label: "USDC.e → Aave Pool (max)",
    }],
};

// NOTE: PR 0 ships only the Aave v3 Polygon pack. Polymarket and Hyperliquid packs land in PR E,
// where the plugin authors contribute the full selector list alongside the real SDK wiring.
// Adding packs later is a one-file change — append to PACKS below.

/// All packs registered in the CLI.
pub const PACKS: &[&ProtocolPack] = &[&POLYGON_AAVE_V3];

pub fn find_pack(id: &str, chain_id: u64) -> Option<&'static ProtocolPack> {
    PACKS.iter().copied().find(|p| p.id == id && p.chain_id == chain_id)
}

pub fn list_for_chain(chain_id: u64) -> Vec<&'static ProtocolPack> {
    PACKS.iter().copied().filter(|p| p.chain_id == chain_id).collect()
}
```

- [ ] **Step 2: Add the module to `main.rs`**

Near the top of `crates/tal-cli/src/main.rs`, next to the existing `mod` declarations (look for `mod deploy;`), add:

```rust
mod tokagent_packs;
```

- [ ] **Step 3: Compile**

Run: `cargo build -p tal-cli 2>&1 | tail -15`
Expected: success. Adjust the `alloy_primitives` import if the existing `deploy.rs` uses a different primitives crate (e.g., `ethers` or `alloy`) — match whatever is already in use.

- [ ] **Step 4: Commit**

```bash
git add crates/tal-cli/src/tokagent_packs.rs crates/tal-cli/src/main.rs
git commit -m "tal-cli: protocol pack registry for Tokagent vault deploys"
```

---

### Task F2: Add --kind flag and Tokagent deploy branch

**Files:**
- Modify: `crates/tal-cli/src/main.rs`
- Modify: `crates/tal-cli/src/deploy.rs`

- [ ] **Step 1: Inspect the existing `Deploy` command structure**

Run: `sed -n '115,170p' crates/tal-cli/src/main.rs` — locate the existing `Deploy` enum variant fields (it currently has `testnet: bool`, `optimistic: bool`, probably `agent_id`, `asset`, etc.).

- [ ] **Step 2: Add a `--kind` flag to the existing `Deploy` variant**

In the `Commands` enum of `main.rs`, modify the `Deploy` variant to add:

```rust
        /// What kind of vault to deploy: zkp (default, existing), optimistic, or tokagent.
        #[arg(long, value_enum, default_value = "zkp")]
        kind: VaultKind,

        /// (tokagent only) Operator address — the agent's hot wallet.
        #[arg(long, required_if_eq("kind", "tokagent"))]
        operator: Option<String>,

        /// (tokagent only) Protocol pack IDs to seed into the allowlist.
        /// Repeatable: --pack aave-v3-polygon --pack polymarket-polygon
        #[arg(long = "pack")]
        packs: Vec<String>,

        /// (tokagent only) User-provided CREATE2 salt (hex, 32 bytes).
        #[arg(long, default_value = "0x0000000000000000000000000000000000000000000000000000000000000001")]
        user_salt: String,
```

Add the `VaultKind` enum above or below the `Commands` declaration (whichever is stylistically consistent with existing code):

```rust
#[derive(clap::ValueEnum, Debug, Clone, Copy)]
pub enum VaultKind {
    Zkp,
    Optimistic,
    Tokagent,
}
```

- [ ] **Step 3: Update the `Commands::Deploy` match arm in `main.rs`**

In `fn main()`, when matching `Commands::Deploy { ... }`, branch on `kind`:

```rust
        Commands::Deploy { kind, testnet, optimistic, operator, packs, user_salt, /* ...existing fields */ } => {
            match kind {
                VaultKind::Zkp | VaultKind::Optimistic => {
                    // existing logic — pass `optimistic` based on either the flag or kind==Optimistic
                    deploy::deploy(/* existing args */)?;
                }
                VaultKind::Tokagent => {
                    let op = operator.as_deref().expect("--operator required for --kind tokagent");
                    deploy::deploy_tokagent_vault(
                        testnet,
                        op,
                        &packs,
                        &user_salt,
                    )?;
                }
            }
        }
```

Note: the existing `optimistic` bool can coexist with `kind`. If the user passes `--kind tokagent --optimistic`, reject it.

- [ ] **Step 4: Add `deploy_tokagent_vault` to `crates/tal-cli/src/deploy.rs`**

```rust
use crate::tokagent_packs::{find_pack, PackEntry, ApprovalEntry};

/// Deploy a Tokagent (non-zkp) vault via the upgraded VaultFactory.
pub fn deploy_tokagent_vault(
    testnet: bool,
    operator_hex: &str,
    pack_ids: &[String],
    user_salt_hex: &str,
) -> anyhow::Result<()> {
    let chain_id = if testnet { 11155111u64 /* Sepolia */ } else {
        // Default to Polygon. Users pass --chain-id via a new flag if they want a different chain.
        // For now we require the CLI to know which chain each pack lives on — all packs in --pack
        // must share a chain_id, and that's the chain we deploy to.
        resolve_chain_from_packs(pack_ids)?
    };
    println!("Deploying Tokagent vault on chain {chain_id}");

    // Flatten all packs into entries + approvals.
    let mut entries: Vec<PackEntry> = Vec::new();
    let mut approvals: Vec<ApprovalEntry> = Vec::new();
    for pack_id in pack_ids {
        let pack = find_pack(pack_id, chain_id)
            .ok_or_else(|| anyhow::anyhow!("unknown pack {pack_id} for chain {chain_id}"))?;
        entries.extend_from_slice(pack.entries);
        approvals.extend_from_slice(pack.approvals);
    }
    println!("  entries: {} / approvals: {}", entries.len(), approvals.len());

    // Load factory proxy address for this chain from config / env.
    // Use addresses exported by the SDK (could hard-code for MVP).
    let factory = resolve_factory_for_chain(chain_id)?;
    let operator = parse_address(operator_hex)?;
    let user_salt = parse_bytes32(user_salt_hex)?;

    // Build call data for deployTokagentVault(operator, entries, approvals, user_salt).
    // Use `alloy` or `ethers` (whichever this CLI already uses — match existing patterns).
    // Left as TODO in the stub; Task F3 adds the actual ABI encoding + send.
    anyhow::bail!("tokagent deploy wiring pending — complete in Task F3 via alloy ABI encoding against VaultFactory");
}

fn resolve_chain_from_packs(pack_ids: &[String]) -> anyhow::Result<u64> {
    use crate::tokagent_packs::PACKS;
    let mut chain = None;
    for id in pack_ids {
        let pack = PACKS.iter().find(|p| p.id == *id)
            .ok_or_else(|| anyhow::anyhow!("unknown pack: {id}"))?;
        match chain {
            None => chain = Some(pack.chain_id),
            Some(c) if c != pack.chain_id => {
                anyhow::bail!("packs span multiple chains: {id} is on chain {}, earlier pack was on chain {}", pack.chain_id, c);
            }
            _ => {}
        }
    }
    chain.ok_or_else(|| anyhow::anyhow!("no packs specified — pass at least one --pack"))
}

fn resolve_factory_for_chain(chain_id: u64) -> anyhow::Result<alloy_primitives::Address> {
    use alloy_primitives::{address, Address};
    Ok(match chain_id {
        1     => address!("47E6EfFf516E8b899092ebEEF92fddCE579e9d39"),
        137   => address!("0eDa0bCFBFc51Ab245F078AEFa3ee42cB384c865"),
        999   => address!("d27A7470a34903b7e215EA8d07d9cd2d21238F83"),
        42161 => address!("7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611"),
        10    => address!("7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611"),
        11155111 => address!("580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C"),
        998   => address!("4c36bCA87f21E16f5af8A6d7Df2D86a5aD13049F"),
        _ => anyhow::bail!("no factory address configured for chain {chain_id}"),
    })
}

fn parse_address(s: &str) -> anyhow::Result<alloy_primitives::Address> {
    s.parse::<alloy_primitives::Address>().map_err(|e| anyhow::anyhow!("bad address: {e}"))
}

fn parse_bytes32(s: &str) -> anyhow::Result<[u8; 32]> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(s).map_err(|e| anyhow::anyhow!("bad bytes32 hex: {e}"))?;
    if bytes.len() != 32 {
        anyhow::bail!("expected 32 bytes, got {}", bytes.len());
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}
```

- [ ] **Step 5: Compile + confirm CLI structure**

Run: `cargo build -p tal-cli 2>&1 | tail -15`
Expected: success. Follow-up task (F3) fills in the ABI encoding + transaction submission.

- [ ] **Step 6: Commit**

```bash
git add crates/tal-cli/src/main.rs crates/tal-cli/src/deploy.rs
git commit -m "tal-cli: add --kind tokagent flag + deploy branch scaffold"
```

---

### Task F3: Wire the Tokagent deploy path to send the transaction

**Files:**
- Modify: `crates/tal-cli/src/deploy.rs`

- [ ] **Step 1: Inspect how the existing `deploy()` function sends transactions**

Run: `grep -n "send_transaction\|send_raw\|contract::call\|provider\|signer\|Wallet" crates/tal-cli/src/deploy.rs | head -30`

The existing function uses either `alloy` or `ethers-rs`. Match its pattern exactly in the new function — no new dependency variants. If it's alloy, use `SolCall` and the provider sender; if ethers, use the `ethers::contract::abigen!` macro or manual ABI encoding via `abi::encode_with_signature`.

- [ ] **Step 2: Replace the `anyhow::bail!` stub in `deploy_tokagent_vault` with real sending**

The exact code depends on whether the CLI uses alloy or ethers — both are common for this kind of tool. Two templates:

**Template A (alloy):**

```rust
use alloy_sol_types::{sol, SolCall};

sol! {
    struct TokagentEntry { address target; bytes4 selector; }
    struct TokagentApprovalSpec { address token; address spender; uint256 amount; }
    function deployTokagentVault(
        address operator,
        TokagentEntry[] initialAllowlist,
        TokagentApprovalSpec[] initialApprovals,
        bytes32 userSalt
    ) external returns (address);
}

// inside deploy_tokagent_vault (replacing the anyhow::bail!):
let entries_sol: Vec<TokagentEntry> = entries.iter().map(|e| TokagentEntry {
    target: e.target,
    selector: e.selector.0.into(),
}).collect();
let approvals_sol: Vec<TokagentApprovalSpec> = approvals.iter().map(|a| TokagentApprovalSpec {
    token: a.token,
    spender: a.spender,
    amount: alloy_primitives::U256::MAX,
}).collect();
let call = deployTokagentVaultCall {
    operator,
    initialAllowlist: entries_sol,
    initialApprovals: approvals_sol,
    userSalt: user_salt.into(),
};
let calldata = call.abi_encode();

// Follow the existing deploy() pattern to get a provider + signer, then:
let tx = TransactionRequest {
    to: Some(TxKind::Call(factory)),
    input: calldata.into(),
    ..Default::default()
};
let pending = provider.send_transaction(tx).await?;
println!("Tokagent deploy tx: {}", pending.tx_hash());
let receipt = pending.get_receipt().await?;

// Parse TokagentVaultDeployed event from receipt logs to extract the deployed vault address.
let vault = extract_deployed_vault_from_receipt(&receipt)?;
println!("Deployed vault: {vault}");
Ok(())
```

**Template B (ethers-rs):**

```rust
use ethers::{abi::Token, types::{Bytes, U256, Address as EthAddress}};

// Encode deployTokagentVault(address,(address,bytes4)[],(address,address,uint256)[],bytes32)
let fn_sig = "deployTokagentVault(address,(address,bytes4)[],(address,address,uint256)[],bytes32)";
let entries_tokens: Vec<Token> = entries.iter().map(|e| Token::Tuple(vec![
    Token::Address(EthAddress::from_slice(e.target.as_slice())),
    Token::FixedBytes(e.selector.0.to_vec()),
])).collect();
let approvals_tokens: Vec<Token> = approvals.iter().map(|a| Token::Tuple(vec![
    Token::Address(EthAddress::from_slice(a.token.as_slice())),
    Token::Address(EthAddress::from_slice(a.spender.as_slice())),
    Token::Uint(U256::MAX),
])).collect();
let args = vec![
    Token::Address(EthAddress::from_slice(operator.as_slice())),
    Token::Array(entries_tokens),
    Token::Array(approvals_tokens),
    Token::FixedBytes(user_salt.to_vec()),
];
let calldata = ethers::abi::encode(&args);
let fn_selector = &ethers::utils::keccak256(fn_sig.as_bytes())[..4];
let full: Vec<u8> = fn_selector.iter().chain(calldata.iter()).copied().collect();
// ...send via existing client/provider, parse receipt, extract vault from log topic.
```

Pick the template that matches the current CLI stack; paste and adapt.

- [ ] **Step 3: Build**

Run: `cargo build -p tal-cli 2>&1 | tail -15`
Expected: success.

- [ ] **Step 4: Add a dry-run unit test**

Append to the bottom of `crates/tal-cli/src/deploy.rs`:

```rust
#[cfg(test)]
mod tokagent_tests {
    use super::*;

    #[test]
    fn resolve_chain_from_packs_single_chain() {
        let packs = vec!["aave-v3-polygon".to_string()];
        assert_eq!(resolve_chain_from_packs(&packs).unwrap(), 137);
    }

    #[test]
    fn resolve_chain_from_packs_empty() {
        let err = resolve_chain_from_packs(&[]).unwrap_err();
        assert!(err.to_string().contains("no packs"));
    }

    #[test]
    fn resolve_chain_from_packs_unknown() {
        let packs = vec!["not-a-pack".to_string()];
        let err = resolve_chain_from_packs(&packs).unwrap_err();
        assert!(err.to_string().contains("unknown pack"));
    }

    #[test]
    fn parse_bytes32_ok() {
        let h = "0x0000000000000000000000000000000000000000000000000000000000000001";
        let out = parse_bytes32(h).unwrap();
        assert_eq!(out[31], 1);
    }

    #[test]
    fn parse_bytes32_wrong_length() {
        let h = "0x01";
        assert!(parse_bytes32(h).is_err());
    }
}
```

- [ ] **Step 5: Run**

Run: `cargo test -p tal-cli tokagent_tests 2>&1 | tail -15`
Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add crates/tal-cli/src/deploy.rs
git commit -m "tal-cli: implement Tokagent vault deploy (ABI encoding + send + receipt parse)"
```

---

## Phase G: Mainnet Deployment Runbook

> **Note:** These steps require private keys + RPC endpoints the plan author does not have. Execute manually (or via a separate Foundry keystore + sequencer) on each target chain. The plan is "done" once Phase F commits; Phase G is ops, not code.

The runbook, in order per chain (Ethereum → Polygon → HyperEVM):

1. **Set env vars:**
   ```
   export VAULT_FACTORY_PROXY=<from sdk/src/addresses.ts for this chain>
   export RPC_URL=<rpc endpoint>
   export OWNER_PK=<factory owner private key>
   ```

2. **Deploy code store (Phase E task E1 script).**
   - Ethereum + Polygon: `forge script ... --rpc-url $RPC_URL --private-key $OWNER_PK --broadcast`
   - HyperEVM: append `--legacy --gas-limit 3000000`
   - Record the printed address as `$TOKAGENT_CODE_STORE`.

3. **Schedule factory upgrade (task E2).**
   - Same flags per chain. Records `newImpl` and `pendingImplementationActivatesAt`.

4. **Wait >= 48 hours** (timelock).

5. **Activate the upgrade (task E3).**
   - `forge script script/deploy/ActivateTokagentFactoryUpgrade.s.sol ...`

6. **Wire the code store (task E4).**
   - `TOKAGENT_CODE_STORE=<from step 2> forge script script/deploy/SetTokagentCodeStore.s.sol ...`

7. **Smoke test (task E5).**
   - `TOKAGENT_OPERATOR=<test operator address> forge script script/deploy/DeployTokagentVaultTest.s.sol ...`
   - Verify the printed `vaultKind` matches `keccak256("TokagentVault:v1") = 0x...` and that `isDeployedVault` is true.

8. **End-to-end integration test.**
   - Using `tal` CLI: `tal deploy --kind tokagent --operator $OP --pack aave-v3-polygon` (Polygon only).
   - Deposit 10 USDC to the vault address (via wallet).
   - Run `tal ...` to execute an Aave supply through the vault.
   - Verify USDC decreased + aUSDC balance appeared via `cast call`.

9. **Post-deploy: update `sdk/src/addresses.ts`**
   - Add `tokagentVaultCreationCodeStore: '0x...'` and `tokagentFactoryVersion: 'v4'` fields for each chain if the frontend needs to reference them. (Not strictly required — the factory proxy address is unchanged.)

10. **Monitor for 72 hours.** No vault deploys outside the smoke tests, no frontend changes, no user funds. Anyone running PR D later will deploy real vaults.

---

## Success Criteria

- [ ] `forge test` passes all four TokagentVault test files (unit + fuzz + fork + factory integration) on a Polygon-fork CI run.
- [ ] `cd sdk && npm run typecheck && npm test` passes with new `TokagentVaultClient` tests included.
- [ ] `cargo test -p tal-cli` passes with new `tokagent_tests` module.
- [ ] `forge build --force` produces a `VaultFactory.sol/VaultFactory.json` whose deployed-bytecode size is small enough for HyperEVM (fits within a 3M-gas deploy via the existing `[profile.small]` profile).
- [ ] Phase G steps 1–7 complete successfully on Ethereum, Polygon, and HyperEVM mainnets (manual; see runbook).
- [ ] `cast call <factoryProxy> 'vaultCount()(uint256)'` on each chain returns the pre-PR-0 count + 1 after the smoke test (accounts for the test vault).
- [ ] No `KernelVault` / `OptimisticKernelVault` regression: existing integration tests (`KernelVault.t.sol`, `KernelVault.ExecutionSemantics.t.sol`, `AdapterCrossVaultIsolation.t.sol`) still pass on a mainnet-pinned fork after the factory upgrade.
