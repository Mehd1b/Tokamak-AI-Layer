# Blind Spot Scanner C: Role Lifecycle, Capability Exposure & Reachability
## Scanner C Output — Phase 4b Iteration 1

---

## Processing Protocol Coverage

### CHECK 6: Role Lifecycle Completeness — Enumeration

**Roles identified across the codebase:**

1. KernelVault `owner` — granted in constructor, single-step transfer via `transferOwnership()` (VaultAccessControl.sol) — DONE
2. KernelVault `oracleSigner` — granted via `setOracleSigner()`, revocable by setting to `address(0)` — DONE
3. KernelVault `bondSigner` — granted via `setBondSigner()`, revocable by setting to `address(0)` — DONE
4. KernelVault `accessControl` — granted via `setAccessControl()`, revocable by setting to `address(0)` — DONE
5. AgentRegistry `owner` — two-step ownership transfer (proposeOwner/acceptOwnership) — DONE
6. VaultFactory `owner` — two-step ownership transfer — DONE
7. KernelExecutionVerifier `owner` — two-step ownership transfer — DONE
8. KernelExecutionVerifier `approvedVerifiers` mapping — granted via `approveVerifier()`, revocable via `revokeVerifier()` — DONE
9. WSTONBondManager `owner` — single-step `transferOwnership()` — DONE
10. WSTONBondManager `trustedRelayer` — time-locked rotation via `setTrustedRelayer()` + `activateTrustedRelayer()` — DONE
11. WSTONBondManager `authorizedVaults` — granted via `authorizeVault()`, revocable via `revokeVault()` — DONE
12. PointsProgram `owner` — single-step transfer — DONE
13. PointsProgram `authorizedCallers` — granted via `setAuthorizedCaller()`, revocable — DONE
14. BuilderProgram `owner` — single-step transfer — DONE
15. BuilderProgram `authorizedUpdaters` — granted via `setAuthorizedUpdater()`, revocable — DONE
16. ReferralManager `owner` — single-step transfer — DONE
17. ReferralManager `authorizedRecorders` — granted via `setAuthorizedRecorder()`, revocable — DONE
18. VaultAccessControl `owner` — single-step transfer — DONE
19. AaveV3Adapter `adapterOwner` — immutable, set in constructor — DONE
20. HyperliquidAdapter `adapterDeployer` — immutable, set in constructor — DONE

**Role lifecycle table:**

| Role | Grant Function | Revoke Function | Revoke Exists? | Circular Dependency? | Finding? |
|------|---------------|-----------------|----------------|---------------------|----------|
| KernelVault owner | constructor | transferOwnership (1-step) | YES (via new owner) | NO | KNOWN INV-16 |
| oracleSigner | setOracleSigner | setOracleSigner(addr0) | YES | NO | - |
| bondSigner | setBondSigner | setBondSigner(addr0) | YES | NO | - |
| accessControl | setAccessControl | setAccessControl(addr0) | YES (silent) | NO | KNOWN INV-17 |
| AgentRegistry owner | initialize | acceptOwnership (2-step) | YES | NO | - |
| VaultFactory owner | initialize | acceptOwnership (2-step) | YES | NO | - |
| KernelExecutionVerifier owner | initialize | acceptOwnership (2-step) | YES | NO | - |
| KernelExecutionVerifier approvedVerifiers | approveVerifier | revokeVerifier | YES | NO | KNOWN INV-40 |
| WSTONBondManager owner | constructor | transferOwnership (1-step) | YES | NO | KNOWN INV-14 |
| WSTONBondManager trustedRelayer | setTrustedRelayer + activate | setTrustedRelayer(0) | YES | NO | - |
| WSTONBondManager authorizedVaults | authorizeVault | revokeVault | YES | NO | - |
| AaveV3Adapter adapterOwner | constructor (immutable) | NONE | **NO** | - | **FINDING BLIND-C-1** |
| HyperliquidAdapter adapterDeployer | constructor (immutable) | NONE | **NO** | - | **FINDING BLIND-C-2** |
| PointsProgram authorizedCallers | setAuthorizedCaller | setAuthorizedCaller(false) | YES | NO | - |
| BuilderProgram authorizedUpdaters | setAuthorizedUpdater | setAuthorizedUpdater(false) | YES | NO | - |
| ReferralManager authorizedRecorders | setAuthorizedRecorder | setAuthorizedRecorder(false) | YES | NO | - |

**Coverage: 20 enumerated, 20 analyzed = 100%**

---

### CHECK 7: Inherited Capability Exposure Gaps — Enumeration

Base contracts providing internal functions relevant to this check:

1. `Pausable` (OpenZeppelin) → `_pause()`, `_unpause()` — exposed in KernelVault via `pause()`, `unpause()` — DONE
2. `ReentrancyGuard` (OZ) → `_reentrancyGuardEntered()` — not externally exposed, internal only — DONE (N/A)
3. `UUPSUpgradeable` (OZ via KernelExecutionVerifier, VaultFactory, AgentRegistry) → `upgradeTo()`, `upgradeToAndCall()` — exposed via inherited UUPS entrypoints, controlled by `_authorizeUpgrade()` which enforces schedule delay — DONE
4. LidoAdapter base pattern → `registerVault()` exposed, **`unregisterVault()` NOT exposed** — DONE
5. UniswapV4Adapter base pattern → `registerVault()` exposed, **`unregisterVault()` NOT exposed** — DONE
6. PendleAdapter base pattern → `registerVault()` exposed, **`unregisterVault()` NOT exposed** — DONE
7. HyperliquidAdapter base pattern → `registerVault()` exposed, **`unregisterVault()` NOT exposed** — DONE (FINDING BLIND-C-3)
8. PolymarketAdapter base pattern → `registerVault()` exposed, **`unregisterVault()` NOT exposed** — DONE
9. Pausable `paused()` view — exposed in KernelVault (inherits) — DONE (N/A)

**Coverage: 9 enumerated, 9 analyzed = 100%**

---

### CHECK 8: Function Reachability Audit — Enumeration

Functions requiring reachability analysis (flagging those with no expected external callers):

1. `HyperliquidAdapter.closePositionAdmin(address vault)` — deprecated, always reverts — DONE
2. `HyperliquidAdapter.closePosition()` — deprecated, always reverts — DONE
3. `TradingSubAccount.executeClose()` (deprecated) — always reverts — DONE
4. `PolymarketAdapter.buyOutcome()` — always reverts (NotImplemented) — DONE
5. `PolymarketAdapter.sellOutcome()` — always reverts (NotImplemented) — DONE
6. `PolymarketAdapter.redeemResolved()` — always reverts (NotImplemented) — DONE
7. `MetaVault._emergencyWithdrawExternal()` — external but gated by `msg.sender == address(this)`, only reachable via `this.` call — DONE
8. `MetaVault.depositToVaultExternal()` — external but gated by `msg.sender == address(this)` — DONE
9. `MetaVault.withdrawFromVaultExternal()` — external but gated by `msg.sender == address(this)` — DONE
10. `KernelVault.collectManagementFee()` — permissionless, callable by anyone — DONE
11. `KernelVault.collectPerformanceFee()` — permissionless, callable by anyone — DONE
12. `PointsProgram.batchAccrue()` — permissionless, callable by anyone — DONE
13. `KernelExecutionVerifier.activateVerifier()` — permissionless after delay — DONE
14. `WSTONBondManager.activateTrustedRelayer()` — permissionless after delay — DONE
15. `WSTONBondManager.reclaimExpiredBond()` — permissionless (operator only effectively, operator=msg.sender) — DONE
16. `LidoAdapter.syncRebase()` — permissionless state-modifier — DONE
17. `BuilderProgram.claimGrant()` — permissionless for registered builders — DONE
18. `AgentRegistry.register()` — fully permissionless — DONE
19. `ReferralManager.registerCode()` — fully permissionless — DONE
20. `KernelVault.emergencySettle()` — permissionless after 7d — DONE
21. `KernelVault.emergencyWithdraw()` — permissionless for share holders after 14d paused — DONE
22. `HyperliquidAdapter.depositMargin()` — uses msg.sender as vault key, reachable only by registered vaults — DONE
23. `VaultFactory.setVaultProtocolType()` — owner OR vault owner can call — DONE (FINDING BLIND-C-4)

**Coverage: 23 enumerated, 23 analyzed = 100%**

---

## Findings

---

## Finding [BLIND-C-1]: AaveV3Adapter `adapterOwner` is Immutable — No Rotation Path

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(single role holder) | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✗(single-step, no stored external state), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition exposed), R13:✗(not design-related), R14:✗(no aggregate variables), R15:✗(no flash loan access), R16:✗(no oracle dependency)]
**Severity**: Low
**Location**: AaveV3Adapter.sol:L126, L205

**Description**:
`adapterOwner` is set as an immutable state variable (`address public immutable adapterOwner`) in the AaveV3Adapter constructor (`adapterOwner = msg.sender`). It has no rotation or transfer mechanism. The only function gated by `onlyAdapterOwner` is `setMinHealthFactor()`, which controls the adapter-wide minimum Aave health factor threshold. If the deployer address is compromised or the deployer key is rotated (e.g., operational security practice), there is no on-chain way to update `adapterOwner` without deploying a new adapter contract (which requires all vaults to re-register and re-supply assets).

```solidity
// AaveV3Adapter.sol:L126
address public immutable adapterOwner;
// AaveV3Adapter.sol:L179-182
modifier onlyAdapterOwner() {
    require(msg.sender == adapterOwner, "not adapter owner");
    _;
}
// AaveV3Adapter.sol:L205
adapterOwner = msg.sender;
```

**Impact**: If the deployer key is lost or compromised, `setMinHealthFactor()` becomes permanently uncallable, locking the adapter at whatever health factor was last set. There is no remediation path short of full adapter migration (re-deploying adapter, re-registering all vaults, migrating all supplied positions). This is consistent with the Low severity because the function only controls a parameter and does not gate withdrawals or deposits.

**Why breadth agents likely missed this**: Breadth agents focus on active attack vectors (role abuse, fund extraction). An immutable-but-un-rotatable role that controls only a parameter is a lifecycle completeness gap not an active vulnerability — it requires mapping "what happens if the keyholder disappears?" rather than "what can an attacker do?"

---

## Finding [BLIND-C-2]: HyperliquidAdapter `adapterDeployer` Is Irrevocable and Controls a One-Time Killswitch

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(single entity) | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R13:✗, R14:✗, R15:✗, R16:✗]
**Severity**: Low
**Location**: HyperliquidAdapter.sol:L76, L109, L116-120

**Description**:
`adapterDeployer` is an immutable address set at construction time (`adapterDeployer = msg.sender`). It exclusively controls the `disableRawCoreWriter()` function — the killswitch that permanently disables the raw CoreWriter backdoor for the adapter. Unlike `adapterOwner` in AaveV3Adapter, there is no mechanism to rotate `adapterDeployer` even under emergency conditions. 

The `disableRawCoreWriter()` function is a one-way irreversible action (sets `rawCoreWriterDisabled = true` with no reset path), so the key risk is not an attacker gaining `adapterDeployer` (the function only restricts capabilities, not expands them), but rather that if the deployer key is unavailable (lost/rotated), the raw CoreWriter pathway can never be disabled via this mechanism. This is a weaker concern than BLIND-C-1 since an admin can still gate raw writes by ensuring vaults never call `rawCoreWriterAdmin` directly.

```solidity
// HyperliquidAdapter.sol:L116-120
function disableRawCoreWriter() external {
    require(msg.sender == adapterDeployer, "not deployer");
    rawCoreWriterDisabled = true;
    emit RawCoreWriterDisabled();
}
```

**Impact**: If `adapterDeployer` key is lost or rotated, `disableRawCoreWriter()` cannot be called. The raw CoreWriter backdoor remains active indefinitely. Since `rawCoreWriterAdmin` is still gated by vault owner checks (`msg.sender == IKernelVaultOwner(vault).owner()`), the security impact is limited but the intended governance capability of permanently closing the raw path is unreachable.

**Why breadth agents likely missed this**: The function was analyzed as "restricted to deployer" (correct), but the inverse question — "can the deployer role ever be revoked or transferred?" — was not explored. Breadth agents confirmed access control presence; they did not audit role lifecycle completeness.

---

## Finding [BLIND-C-3]: LidoAdapter, UniswapV4Adapter, PendleAdapter, HyperliquidAdapter, and PolymarketAdapter Lack `unregisterVault()` — Vault Cannot Exit Adapter Lifecycle

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A no role) | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✓, R13:✗, R14:✗, R15:✗, R16:✗]
**Severity**: Low
**Location**: LidoAdapter.sol:L165-188, UniswapV4Adapter.sol:L297-332, PendleAdapter.sol:L332-370, HyperliquidAdapter.sol:L125-165, PolymarketAdapter.sol:L115-145

**Description**:
Five of the seven adapters provide a `registerVault()` function but no corresponding `unregisterVault()`. Contrast with `MorphoAdapter.unregisterVault()` (L309) and `AaveV3Adapter.unregisterVault()` (L239) which allow the vault owner to cleanly exit the adapter after withdrawing all positions.

For the five affected adapters:
- **LidoAdapter**: Once registered (`isRegistered[vault] = true`), there is no path to set it back to `false`. A vault that has claimed all its ETH and exited stETH/wstETH positions cannot formally deregister.
- **UniswapV4Adapter**: Once `_vaultRegistered[vault]` is set, there is no unregister. A vault that has withdrawn all LP positions via `withdrawToVault()` remains registered indefinitely.
- **PendleAdapter**: `vaultConfigs[vault].registered` is set `true` on registration; no function exists to set it to `false`.
- **HyperliquidAdapter**: `vaultConfigs[vault].subAccount != address(0)` is the registration check. No way to clear this mapping after the vault exits all positions and the sub-account is emptied.
- **PolymarketAdapter**: Similar: `vaultConfigs[vault].registered` has no clearing path.

The immediate consequence is operational: a vault owner cannot cleanly migrate to a different adapter instance without the old adapter permanently believing the vault is "registered," allowing vault-level calls that should no longer be permitted.

**Impact**: Low in isolation: a vault that has fully withdrawn its positions from an adapter cannot formally exit the adapter's registration. If the adapter is later compromised or upgraded, registered-but-empty vaults remain in the adapter's scope. If the adapter's `onlyRegisteredVault` functions have any side effects on shared state (e.g., LidoAdapter's `syncRebase()` reads from `totalTrackedStETH`), stale registrations create attack surface. The `onlyRegisteredVault` modifier remains available to the vault, allowing calls even after the vault intends to be "done" with that adapter — if the adapter ever has new functions added, the vault is automatically in scope. No direct fund loss in current code.

**Why breadth agents likely missed this**: Breadth agents confirmed `registerVault()` access control is correct and checked for common vault isolation issues (cross-vault theft). The lifecycle completeness question — "can the vault exit after it's done?" — was not a breadth scan focus. Asymmetry between Morpho/Aave (which have `unregisterVault`) and the other five adapters was not cross-checked.

---

## Finding [BLIND-C-4]: `PolymarketAdapter.buyOutcome()`, `sellOutcome()`, and `redeemResolved()` — ABI-Exposed Functions That Always Revert Are Reachable Dead Code

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A no role) | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single contract), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]
**Severity**: Informational
**Location**: PolymarketAdapter.sol:L164-186

**Description**:
Three external functions — `buyOutcome()`, `sellOutcome()`, and `redeemResolved()` — are explicitly not implemented and always revert with `NotImplemented()`. They are callable by any registered vault (gated by `onlyRegisteredVault`) but unconditionally revert:

```solidity
function buyOutcome(bool, uint256, uint256) external view onlyRegisteredVault {
    revert NotImplemented();
}
function sellOutcome(bool, uint256, uint256) external view onlyRegisteredVault {
    revert NotImplemented();
}
function redeemResolved() external view onlyRegisteredVault {
    revert NotImplemented();
}
```

The contract comment explicitly marks these as scaffolding (`NOTE: buyOutcome/sellOutcome/redeemResolved contain scaffolding logic.`). These three functions represent the core trading capability of the PolymarketAdapter — the ability to buy/sell prediction market tokens and redeem resolved markets. Without them, the adapter can only deposit USDC and withdraw it; it cannot perform any actual Polymarket operations. The adapter in its current state is non-functional from a trading perspective.

**Impact**: Informational — no fund risk since reverts preserve state. However:
1. Any agent that calls these functions via `_executeAction()` dispatch will receive a revert, causing the entire proof execution to revert. An agent ELF that was compiled expecting these functions to work will fail silently or revert on-chain.
2. The adapter registers vaults and accepts USDC deposits (`depositUSDC`) but cannot deploy capital — USDC deposited into the adapter is idle indefinitely until `withdrawToVault()` is called. No yield is generated.
3. R13: This is "by design" (documented scaffolding), but the terminal consequence for users — deposited USDC earns zero yield and can only be recovered via `withdrawToVault()` — should be documented as a known limitation.

**Why breadth agents likely missed this**: The functions are technically gated by `onlyRegisteredVault` (correct access control), so they passed access control review. A reachability audit — do these functions do anything useful? — was not in scope for breadth agents.

---

## Finding [BLIND-C-5]: `VaultFactory.setVaultProtocolType()` — Vault Owner Can Modify Factory Protocol Classification for Their Vault Without Factory Owner Oversight

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,4,5 | ✗6(no circular dependency) | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗, R13:✗, R14:✗, R15:✗, R16:✗]
**Severity**: Informational
**Location**: VaultFactory.sol:L532-544

**Description**:
`setVaultProtocolType()` allows EITHER the factory owner OR the vault owner to set the protocol type classification for any vault:

```solidity
function setVaultProtocolType(address vault, uint8 protocolType) external {
    require(isDeployedVault[vault], "vault not deployed");
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
```

This dual-authority model means a vault owner can unilaterally reclassify their vault's protocol type in the VaultFactory's records. If `_vaultProtocolType` is consumed by off-chain indexers, dashboards, or on-chain consumers (e.g., to gate features by protocol type), a vault owner could misclassify their vault to gain access to features or bypass restrictions applied by protocol type.

Additionally, the `protocolType` parameter has no validation — it accepts any `uint8` value (0-255), including undefined protocol types.

**Impact**: Informational — the classification itself does not gate any on-chain fund movement in the current codebase. No `require(_vaultProtocolType[vault] == X)` guards are present that would allow type manipulation to unlock capabilities. The risk is primarily off-chain (indexer/dashboard manipulation) or in future code that uses `_vaultProtocolType` as a gate. The dual-authority model (vault owner can self-classify) is worth flagging as a design note.

**Why breadth agents likely missed this**: The function is on a setter list and has access control (vault owner can call). The question of whether vault owners SHOULD be able to reclassify their vault in the factory's records is a role boundary question that breadth agents did not flag since no on-chain gate currently depends on it.

---

## Chain Summary (MANDATORY)

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|--------------------:|---------|----------|-------------------|-------------------|
| BLIND-C-1 | AaveV3Adapter.sol:L126,L205 | `adapterOwner` immutable with no rotation path | CONFIRMED | Low | ACCESS | STATE |
| BLIND-C-2 | HyperliquidAdapter.sol:L76,L109,L116 | `adapterDeployer` immutable with no rotation path | CONFIRMED | Low | ACCESS | STATE |
| BLIND-C-3 | LidoAdapter/UniswapV4/Pendle/Hyperliquid/Polymarket | Five adapters lack `unregisterVault()` lifecycle exit | CONFIRMED | Low | ACCESS | STATE |
| BLIND-C-4 | PolymarketAdapter.sol:L164-186 | Three core trading functions always revert (NotImplemented) | CONFIRMED | Informational | N/A | N/A |
| BLIND-C-5 | VaultFactory.sol:L532-544 | Vault owner can unilaterally reclassify vault protocol type | CONFIRMED | Informational | ACCESS | STATE |

---

## Coverage Assertion

- **CHECK 6**: 20 roles enumerated, 20 analyzed. 2 findings (BLIND-C-1, BLIND-C-2).
- **CHECK 7**: 9 base/inherited capability gaps enumerated, 9 analyzed. 1 finding (BLIND-C-3, consolidated across 5 adapters).
- **CHECK 8**: 23 reachability targets enumerated, 23 analyzed. 2 findings (BLIND-C-4, BLIND-C-5).
