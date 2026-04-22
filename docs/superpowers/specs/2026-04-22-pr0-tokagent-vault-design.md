# PR 0 — TokagentVault (non-zkp custody contract)

**Date:** 2026-04-22
**Author:** mehdi@tokamak.network
**Status:** Design approved; awaiting implementation plan
**Follows:** `2026-04-21-tokagentos-fork-design.md`

## Summary

Add a new non-upgradeable custody contract `TokagentVault` and a factory extension `VaultFactory.deployTokagentVault(...)` to support the Tokagent chat-agent product. The vault coexists with the existing zkp-verified `KernelVault` and `OptimisticKernelVault`. It enforces a per-`(target, selector)` allowlist that bounds the agent operator's authority, supports batched `executeBatch` calls, holds ERC20 / ERC721 / ERC1155 / native assets, and provides owner-only emergency withdraw paths. Deployed via the existing UUPS `VaultFactory` upgraded to v4 on Ethereum, Polygon, and HyperEVM.

This contract is PR 0 of the Tokagent product scope reduction (plugin-hyperliquid-perps, plugin-polymarket, plugin-yield). It blocks PR A (`@tokagent/plugin-tokagent-shared`) because the shared library needs the vault ABI.

## Context

The parent repo's existing vault contracts (`KernelVault`, `OptimisticKernelVault`) are built around verifiable execution: agent actions run inside a RISC Zero zkVM, produce a proof, and only execute on-chain after proof verification. That model is correct for the `perp-trader` flagship agent but too heavy for the Tokagent chat product, which is a non-developer-facing tool where a hot-wallet agent dispatches DeFi operations on behalf of the user.

The Tokagent product's safety story is **allowlist-bounded hot-wallet execution**:
- The user deploys a custody vault and funds it.
- The user curates an allowlist of `(protocol contract, function selector)` pairs ("protocol packs").
- The user designates one operator address — the chat agent's hot wallet.
- The operator can only call allowlisted functions. The owner can withdraw everything at any time.

This gives the user a cryptographic cap on what a compromised agent can do, without the latency and complexity of proof generation.

## Scope

### In scope
- `contracts/src/TokagentVault.sol` — new non-upgradeable custody contract
- `contracts/src/TokagentVaultCreationCodeStore.sol` — bytecode store following the `OptimisticVaultCreationCodeStore` pattern (HyperEVM 3M gas constraint)
- UUPS upgrade of `VaultFactory` to v4: add `deployTokagentVault`, `computeTokagentVaultAddress`, `TokagentVaultDeployed` event
- Test suite: `test/TokagentVault.t.sol`, `test/VaultFactoryTokagent.t.sol`, `test/TokagentVaultFuzz.t.sol`, `test/TokagentVaultFork.t.sol`
- Deploy scripts: `script/deploy/DeployTokagentFactoryUpgrade.s.sol`, `script/deploy/DeployTokagentVaultTest.s.sol`
- `tal-cli` extension: new `--kind tokagent` branch of the `Deploy` command that drives `deployTokagentVault` from the CLI
- Factory upgrade executed on Ethereum, Polygon, HyperEVM mainnets
- Test-deployed Tokagent vault on each chain verifying end-to-end

### Out of scope
- Frontend UI for deploying/listing Tokagent vaults (PR D)
- Protocol pack TypeScript definitions (PR A — lives in `@tokagent/plugin-tokagent-shared`)
- Any plugin code (PR B, E)
- Any vault UUPS-upgradeable variant (explicitly not supported for this contract)
- Cross-chain message passing between vaults (v2 topic)
- Fee model / protocol revenue capture (product decision, deferred)
- Gasless execution (user-paid gas is the v1 model)

## Design Decisions (traceability)

| # | Decision | Choice | Alternatives rejected |
|---|----------|--------|-----------------------|
| 1 | Architecture | Wallet-agent (direct SDK), not verifiable | Verifiable-agent (reuses zkVM flow) too heavy for product |
| 2 | Authority model | Allowlisted-target vault | Thin custody too permissive; role-gated+spending-caps too much ongoing operator burden |
| 3 | Per-chain shape | One vault per (user × chain) | Cross-chain messaging too complex for v1 |
| 4 | Chains v1 | Ethereum + Polygon + HyperEVM | Arbitrum deferred — pools 90% overlap with mainnet |
| 5 | Allowlist granularity | `(target, selector)` with plugin-defined packs | Per-target too coarse; deny-list hybrid adds no safety over (X) |
| 6 | `execute()` shape | Batched `executeBatch` | Single-call forces two txs for approve+action |
| 7 | Approval semantics | Dedicated `approveToken` restricted to allowlisted spenders | Raw `approve` via `execute` can't constrain spender |
| 8 | Upgradeability | Non-upgradeable per vault + factory-versioned | UUPS owner-upgrade weakens safety property; admin-upgrade worst |
| 9 | Asset scope | ERC20 + native + ERC721 + ERC1155 | ERC20-only rules out Polymarket (CTF is 1155) and Uniswap v3 yield |
| 10 | Factory design | Extend existing `VaultFactory` with new deploy function | Separate factory fragments the portfolio view |
| 11 | Initial approvals | Factory performs initial approvals inline during deploy | Separate post-deploy approve txs worse UX |

## Architecture

### Contract surface

```solidity
contract TokagentVault is IERC721Receiver, IERC1155Receiver, ReentrancyGuard {
    address public owner;
    address public pendingOwner;        // Ownable2Step
    address public operator;            // single, rotatable by owner

    mapping(bytes32 => bool) public allowlisted;  // key = keccak256(target, selector)
    bytes32 public constant VAULT_KIND = keccak256("TokagentVault:v1");

    struct Call { address target; bytes data; uint256 value; }
    struct Entry { address target; bytes4 selector; }

    // operator path
    function executeBatch(Call[] calldata calls) external nonReentrant onlyOperator;
    function approveToken(address token, address spender, uint256 amount) external nonReentrant onlyOperator;

    // owner path (bypasses allowlist)
    function ownerSetOperator(address newOp) external onlyOwner;
    function ownerSetAllowlist(address target, bytes4 selector, bool allowed) external onlyOwner;
    function ownerSetAllowlistBatch(Entry[] calldata entries, bool[] calldata allowed) external onlyOwner;
    function ownerWithdrawERC20(address token, uint256 amount, address to) external onlyOwner;
    function ownerWithdrawERC721(address token, uint256 tokenId, address to) external onlyOwner;
    function ownerWithdrawERC1155(address token, uint256 id, uint256 amount, address to) external onlyOwner;
    function ownerWithdrawNative(uint256 amount, address payable to) external onlyOwner;
    function transferOwnership(address newOwner) external onlyOwner; // Ownable2Step
    function acceptOwnership() external;

    // views
    function isAllowlisted(address target, bytes4 selector) external view returns (bool);
    function vaultKind() external pure returns (bytes32);

    // receivers (ERC165 registered)
    function onERC721Received(...) external returns (bytes4);
    function onERC1155Received(...) external returns (bytes4);
    function onERC1155BatchReceived(...) external returns (bytes4);
    function supportsInterface(bytes4) external view returns (bool);

    receive() external payable {}
}
```

### Authority model

- **Owner** (the user, possibly a Safe multisig) sets operator, curates allowlist, withdraws in emergencies. Uses `Ownable2Step` — two-step ownership transfers prevent loss via pasted-in-wrong-address.
- **Operator** (the agent's hot wallet, one per vault) calls `executeBatch` and `approveToken`. Has no rights outside the allowlist.
- **Allowlist enforcement:**
  - `executeBatch`: for each call, require `allowlisted[keccak256(target, bytes4(data[0:4]))]` is true. One failed call in the batch reverts the whole batch (atomicity).
  - `approveToken`: require there exists any selector `s` such that `allowlisted[keccak256(spender, s)]` is true. This enforces the invariant that approvals only flow to protocols the owner has already whitelisted for direct calls.
- **Reentrancy:** `nonReentrant` on `executeBatch` and `approveToken`. Target callbacks into the vault for asset receiving hooks (ERC721/1155) are safe because those functions do not mutate execution state.

### Asset handling

- ERC20: held via standard `balanceOf`. Operator transfers out via `executeBatch` calling the token's `transfer`/`transferFrom` — must be allowlisted per token. Owner withdraws via `ownerWithdrawERC20`.
- ERC721: held via `onERC721Received` returning the magic bytes. Owner withdraws via `ownerWithdrawERC721`.
- ERC1155: held via `onERC1155Received` / `onERC1155BatchReceived`. Owner withdraws via `ownerWithdrawERC1155`.
- Native: `receive()` accepts all deposits. Operator passes `value` per `Call` in `executeBatch`. Owner withdraws via `ownerWithdrawNative`.

### Factory extension (VaultFactory v4)

Add to the existing UUPS-upgradeable `VaultFactory`:

```solidity
event TokagentVaultDeployed(
    address indexed vault,
    address indexed owner,
    address indexed operator,
    uint256 salt,
    bytes32 kind       // VAULT_KIND — lets indexers filter without calling vaultKind()
);

struct ApprovalSpec { address token; address spender; uint256 amount; }

function deployTokagentVault(
    address operator,
    Entry[] calldata initialAllowlist,
    ApprovalSpec[] calldata initialApprovals,
    uint256 salt
) external returns (address vault);

function computeTokagentVaultAddress(
    address owner,
    address operator,
    uint256 salt
) external view returns (address);
```

Key properties:
- CREATE2 deterministic deployment. Salt user-controlled so one user can deploy multiple vaults per chain (e.g., "perps" vs "yield" vaults with different operators or allowlists).
- `msg.sender` becomes `owner` of the new vault — `tx.origin` is not used.
- Initial allowlist and initial approvals are seeded inside the vault's constructor, not via external calls from the factory. The constructor signature is `(address owner_, address operator_, Entry[] initialAllowlist, ApprovalSpec[] initialApprovals)`. It writes `allowlisted[key(target, selector)] = true` for each entry directly, then for each approval validates the spender appears in at least one allowlist entry and calls `IERC20(token).approve(spender, amount)`. This preserves the `approveToken` spender-must-be-allowlisted invariant from the first block the vault exists. The factory never has authority over the deployed vault — `owner` is set from the constructor argument (plumbed from the factory's `msg.sender`), never from the factory address.
- Shares existing tracking state: `isDeployedVault[vault] = true`, `_deployedVaults.push(vault)`. Frontend's `useDeployedVaultsList()` returns all vault kinds; it disambiguates via `vaultKind()` (with try/catch fallback for legacy vaults that don't expose it).
- No `agentId` / `imageId`: Tokagent vaults do not touch `AgentRegistry`. Related fields on the deploy event diverge from `VaultDeployed`.
- Bytecode store: `TokagentVaultCreationCodeStore` holds the runtime bytecode, factory reads from it. Required to keep factory deploy gas under HyperEVM's 3M block limit.

## Alternatives considered

### Verifiable-agent architecture (using the zkVM flow)

Plugins would emit action intents that get fed into a new multi-domain zkVM agent, proved, and submitted through existing `KernelVault` / `OptimisticKernelVault`. **Rejected** because the product is a chat UI for non-developers — the latency of proof generation (~8–10 minutes for `perp-trader`) is incompatible with conversational DeFi UX. Also adds substantial engineering cost for writing a new multi-domain guest agent across three distinct protocol families.

### UUPS-upgradeable TokagentVault

Each vault is its own proxy, owner can upgrade. **Rejected** because the owner can already compromise the vault by manipulating the allowlist (adding a malicious target, then draining through it). Non-upgradeable doesn't strengthen the security story much, but it makes the "code under the user doesn't change" narrative honest. Bug-response plan is explicit: factory v5 ships, old vaults keep running, users migrate via `ownerWithdraw` + fresh deploy.

### Separate `TokagentVaultFactory`

Rather than extending `VaultFactory`. **Rejected** because the existing frontend hook `useDeployedVaultsList()` would need to fan out to a second factory on every chain. The shared `_deployedVaults` list is an asset, not a constraint — keeping one factory per chain for all vault kinds preserves that.

### On-chain protocol pack abstraction

A `ProtocolPack` struct stored on-chain, with `applyPack(packId)` on the vault. **Rejected** as a feature no one benefits from. Packs are pure UX — the contract only needs individual `(target, selector)` entries. Keeping the contract simple reduces audit surface; pack definitions live in plugin TypeScript where they're reviewable alongside the plugin code that uses them.

## Testing

| Suite | File | Coverage |
|-------|------|----------|
| Unit | `test/TokagentVault.t.sol` | Constructor, `executeBatch` allowlist enforcement + atomicity + reentrancy guard, `approveToken` spender validation, all `ownerWithdraw*` variants, ownership two-step, emergency exit after operator compromise |
| Factory | `test/VaultFactoryTokagent.t.sol` | `deployTokagentVault` event + state, CREATE2 determinism, initial allowlist + approvals atomic, isolation from zkp vault state, `vaultKind()` discrimination |
| Fuzz | `test/TokagentVaultFuzz.t.sol` | Invariant: operator cannot exceed allowlist; `ownerWithdraw*` always works; fuzz `executeBatch` with random `(target, selector, data)` |
| Fork | `test/TokagentVaultFork.t.sol` | Polygon fork: Aave v3 supply/withdraw flow, Polymarket CTF ERC1155 receipt, USDC approvals restricted to allowlisted spenders |

No HyperEVM fork test — HyperEVM infra is exercised by the existing `perp-trader` integration tests. From the Tokagent vault's perspective, the HyperEVM adapter is just another allowlisted target.

## Deployment

Three chains, same procedure (HyperEVM has extra gas constraints):

1. Deploy `TokagentVaultCreationCodeStore` via `forge create`
2. Compile `VaultFactory` v4 impl (with new `deployTokagentVault` / `computeTokagentVaultAddress`)
   - HyperEVM: `FOUNDRY_PROFILE=small`, link `OracleVerifier` + `KernelOutputParser` libraries
3. Deploy v4 impl via `forge create`
   - HyperEVM: `--legacy --gas-limit 3000000`
4. Call `upgradeToAndCall(v4_impl, "")` on the existing factory proxy. Authoritative addresses from `sdk/src/addresses.ts`:
   - Ethereum: `0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39`
   - HyperEVM (chain 999): `0xd27A7470a34903b7e215EA8d07d9cd2d21238F83`
   - Polygon (chain 137): `0x0eDa0bCFBFc51Ab245F078AEFa3ee42cB384c865`
5. Post-upgrade verification:
   - Read `factory.vaultCount()` before and after a test `deployTokagentVault` — should increment by 1
   - Read `factory.isDeployedVault(addr)` on the new vault — must be `true`
   - Call `vault.vaultKind()` on the test vault — must return `keccak256("TokagentVault:v1")`
   - Call `executeBatch` with one allowlisted and one un-allowlisted call — allowlisted passes, un-allowlisted reverts

Deploy scripts: `contracts/script/deploy/DeployTokagentFactoryUpgrade.s.sol` (parameterized by `CHAIN_ID`), `contracts/script/deploy/DeployTokagentVaultTest.s.sol`.

**CLI integration.** The existing `tal-cli` (`crates/tal-cli/`) already has a `Deploy` subcommand with `--optimistic` to deploy `OptimisticKernelVault` instead of `KernelVault`. PR 0 extends the same command with a `--kind tokagent` flag (or `--tokagent` shorthand) that calls `deployTokagentVault(operator, initialAllowlist, initialApprovals, salt)` against the upgraded factory. `--operator` / `--allowlist-pack` / `--salt` flags round out the CLI. Initial protocol pack IDs (e.g., `aave-v3-polygon`) resolve against a registry shipped alongside the CLI, avoiding hand-specified selectors.

PR 0 ships contract code + factory upgrade + CLI extension + test deploys only. No real user vaults until PR D (UI support).

## Open questions (non-blocking)

- **Arbitrum / Optimism support:** factories already exist on both (addresses in `sdk/src/addresses.ts`). Extending the upgrade to include them costs one extra `forge script` invocation per chain. Decision deferred to implementation — include if trivial, skip if it complicates the rollout.
- **Operator rotation UX:** `ownerSetOperator` is a one-tx rotation. No timelock. Acceptable given the owner has already-more-powerful `ownerWithdraw*` — a compromised owner can drain funds regardless.
- **Protocol pack versioning:** plugins may ship pack updates over time (e.g., Aave deploys new `Pool` after v3.1). Design assumes users re-curate their allowlist manually when a plugin updates a pack. UI hints this, but no on-chain versioning.

## Success criteria

1. `forge test` passes all four test suites on Ethereum + Polygon forks.
2. Factory v4 upgrade succeeds on all three mainnets.
3. Test `deployTokagentVault` completes end-to-end on each mainnet; resulting vault passes allowlist-enforcement integration checks.
4. `useDeployedVaultsList()` in the existing frontend returns the test Tokagent vault alongside the existing zkp vaults, with `vaultKind()` correctly distinguishing them (verified manually — frontend UI changes are PR D).
5. No regressions in existing `KernelVault` / `OptimisticKernelVault` flows on any chain.
