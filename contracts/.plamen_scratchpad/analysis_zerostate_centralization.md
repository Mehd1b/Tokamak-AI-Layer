# Analysis: Zero-State Return + Centralization Risk

**Agent**: Analysis Agent #6
**Scope**: KernelVault.sol, MetaVault.sol, OptimisticKernelVault.sol, AgentRegistry.sol, VaultFactory.sol, KernelExecutionVerifier.sol, WSTONBondManager.sol, VaultAccessControl.sol

---

## ZERO-STATE RETURN ANALYSIS

### Zero-State Return Checklist — KernelVault

#### Can protocol return to zero state?
- [x] All users can withdraw (no locked funds during normal operations)
- [x] All shares can be burned
- [x] Supply can reach exactly zero (totalShares = 0)

#### What persists when supply = 0?
- Accrued rewards: Cleaned via _resetFeeEpochIfEmpty() (highWaterMark = 0, lastFeeTimestamp = 0)
- Protocol fees: Cleaned — HWM and management fee clock reset
- Dust balances: For ERC20 vaults, asset.balanceOf(address(this)) may have residual dust. For ETH vaults, trackedETHBalance reaches 0 but address(this).balance may have residual from selfdestruct.
- Pending operations: strategyActive persists if vault empties via normal withdrawal during a strategy.

#### Re-entry vulnerability?
- Initial zero state protected: YES — DECIMALS_OFFSET=1e3 virtual shares
- Return-to-zero state protected: YES — same DECIMALS_OFFSET formula applies on re-entry
- Same protection mechanism: YES

### Zero-State Return Checklist — MetaVault

#### Can protocol return to zero state?
- [x] All users can withdraw
- [x] All meta shares can be burned
- [x] totalShares can reach exactly zero

#### What persists when totalShares = 0?
- trackedIdle may have residual from rounding
- Underlying vault shares persist if vaults are NOT removed

---

## Finding [ZC-1]: Vault owner can silently change access control contract without event emission

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3 | x4(N/A) | x5(no emergency power)
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check] [R13:x(not design-related)]
**Severity**: Low
**Location**: KernelVault.sol:629-632

**Centralization Type**: PARAMETER_CONTROL
**Affected Role**: vault owner (immutable)
**Mitigation Present**: NONE

**Description**:
The setAccessControl function changes the access control contract without emitting an event. This address controls who can deposit (whitelist, KYC, caps) and is used during withdrawals to track deposit counters via recordWithdrawal. Depositors cannot monitor access control changes on-chain.

**Impact**: Depositors have no on-chain signal when the access control policy changes. A vault owner could silently disable whitelist/KYC enforcement or swap to a contract that blocks specific users from withdrawing.

### Postcondition Analysis
**Postconditions Created**: Access control contract address changed silently
**Postcondition Types**: STATE
**Who Benefits**: Vault owner can change deposit/withdrawal policy without depositor awareness

---

## Finding [ZC-2]: Vault owner can rescue tokens without event emission when totalShares == 0

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3 | x4(N/A) | x5(N/A)
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Informational
**Location**: KernelVault.sol:565-569

**Centralization Type**: FUND_CONTROL (limited — only when no depositors)
**Affected Role**: vault owner
**Mitigation Present**: totalShares == 0 guard

**Description**:
The rescueTokens function transfers arbitrary ERC20 tokens from the vault without emitting an event. While the totalShares == 0 guard ensures no depositor funds are at risk, the lack of event emission makes forensic analysis difficult and is inconsistent with the protocol's event emission pattern.

**Impact**: Informational — no depositor funds at risk. Missing event makes fund flow analysis harder.

---

## Finding [ZC-3]: WSTONBondManager ownership transfer is single-step without confirmation

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3,4,5
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Low
**Location**: WSTONBondManager.sol:707-711

**Centralization Type**: UPGRADE_CONTROL (ownership transfer)
**Affected Role**: owner
**Mitigation Present**: NONE

**Description**:
Unlike AgentRegistry, VaultFactory, and KernelExecutionVerifier which implement two-step ownership transfer (propose + accept), WSTONBondManager uses single-step transferOwnership. The owner controls treasury, bond floor, vault authorization, relayer, rescue tokens, and markSlashPending. A typo would irrecoverably transfer control of the entire bond escrow system.

**Impact**: If ownership is transferred to an incorrect address, the entire WSTON bond system becomes permanently unmanageable. Treasury, relayer, and vault authorization cannot be updated.

### Postcondition Analysis
**Postconditions Created**: Irrecoverable ownership loss of bond manager
**Postcondition Types**: ACCESS
**Who Benefits**: Attacker who receives ownership, or nobody (permanent lockout)

---

## Finding [ZC-4]: VaultAccessControl ownership transfer is single-step without confirmation

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3 | x4(N/A) | x5(N/A)
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Low
**Location**: VaultAccessControl.sol:126-130

**Centralization Type**: UPGRADE_CONTROL (ownership transfer)
**Affected Role**: owner
**Mitigation Present**: NONE

**Description**:
VaultAccessControl uses single-step ownership transfer, contrasting with core infrastructure contracts. The owner manages whitelist, deposit caps, and KYC verification. A mistaken transfer permanently locks the access control configuration.

**Impact**: Losing ownership means access control policy becomes immutable. The vault would need a new VaultAccessControl deployment.

---

## Finding [ZC-5]: Vault owner has concentrated control over execution, fees, oracle, pause, and access control with no timelock

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3,4,5
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Medium
**Location**: KernelVault.sol (entire contract — immutable owner)

**Centralization Type**: FUND_CONTROL + PARAMETER_CONTROL + OPERATIONAL_CONTROL
**Affected Role**: vault owner (immutable, no transfer mechanism)
**Mitigation Present**: Fee caps, 7-day cooldowns, emergency withdraw (14d), emergency settle (7d)

**Description**:
The KernelVault owner is the single point of control. Key risks: (1) No multisig requirement — single EOA compromise gives full control. (2) Immutable owner — cannot migrate to multisig post-deployment. (3) Oracle/bond signer changes have no timelock — attacker can instantly change signers and submit malicious executions. (4) Owner can pause for up to 14 days blocking normal withdrawals.

Mitigating: trustedImageId is immutable, ZK proof is mandatory for regular execution, fee caps/cooldowns exist, emergency escape hatches have bounded delays.

**Impact**: Compromised vault owner key can: pause vault for 14 days, change oracle/bond signers for malicious optimistic executions, set fees to maximum, change access control. For optimistic vaults, owner compromise + bond signer rotation enables unbonded execution drain.

### Postcondition Analysis
**Postconditions Created**: Full vault control via single key
**Postcondition Types**: ACCESS, STATE
**Who Benefits**: Attacker who compromises the owner key

---

## Finding [ZC-6]: MetaVault owner has unilateral control over vault allocation with 1-hour cooldown only

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3,4,5
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Low
**Location**: MetaVault.sol:379-467

**Centralization Type**: FUND_CONTROL
**Affected Role**: MetaVault owner
**Mitigation Present**: 2% max NAV slippage, 1-hour cooldown, 40% per-vault cap

**Description**:
MetaVault owner can rebalance (move depositor funds), add/remove vaults, and sweep donations. The 2% slippage guard limits per-rebalance losses but repeated rebalances could erode NAV. The MetaVault owner could route funds into underlying vaults controlled by a malicious actor.

**Impact**: MetaVault owner can redirect depositor capital. With the 40% cap, a colluding vault owner could capture up to 40% of TVL per rebalance cycle. The 2% slippage guard limits immediate damage.

---

## Finding [ZC-7]: KernelVault rescueTokens can move ANY ERC20 + no ETH rescue for ETH vaults

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3 | x4(N/A) | x5(N/A)
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Informational
**Location**: KernelVault.sol:565-569

**Description**:
When totalShares == 0, owner can rescue ANY ERC20 token. For ETH vaults, there is no rescue mechanism for native ETH stuck from selfdestruct donations. The receive() function adds incoming ETH to trackedETHBalance, so dust becomes a permanent donation to the next depositor.

**Impact**: By design — totalShares == 0 guard protects depositors. ETH vault dust from selfdestruct is not rescuable but benefits the next depositor.

---

## Finding [ZC-8]: strategyActive flag persists through normal withdrawal drain but only auto-cleared via emergency withdrawal

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3 | x4(N/A) | x5(N/A)
**Rules Applied**: [R4:x(evidence clear)] [R5:x(no role)] [R6:x(no role)] [R8:x(single-step)] [R10:check]
**Severity**: Low
**Location**: KernelVault.sol:1157-1191 vs 1627-1646

**Description**:
When all depositors withdraw via _processWithdraw during an active strategy, totalShares reaches 0 but strategyActive remains true. _resetFeeEpochIfEmpty resets fees but NOT the strategy flag. The emergency withdrawal path clears strategyActive when totalShares == 0 but the normal path does not. This means new deposits are blocked (DepositsLockedDuringStrategy) until owner calls settle() or emergencySettle() after 7 days.

**Impact**: After full depositor exit during strategy, vault is locked for deposits up to 7 days if owner is unavailable. Not permanently broken but creates unnecessary liveness gap.

### Postcondition Analysis
**Postconditions Created**: Vault locked for deposits until settle
**Postcondition Types**: STATE
**Who Benefits**: Nobody — liveness degradation

---

## Finding [ZC-9]: MetaVault owner is immutable with no transfer function

**Verdict**: CONFIRMED
**Step Execution**: check1,2 | x3(N/A) | x4(N/A) | x5(N/A)
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Low
**Location**: MetaVault.sol:66

**Centralization Type**: UPGRADE_CONTROL (ownership)
**Affected Role**: owner
**Mitigation Present**: NONE

**Description**:
MetaVault has no transferOwnership function. Owner is set in constructor and never changeable. No migration to multisig possible. If key is lost, depositors can still withdraw but rebalancing stops, no vaults can be added/removed, and donations cannot be swept.

**Impact**: MetaVault degrades to static allocation if owner key is lost. Depositors are not locked but operational management ceases.

---

## Finding [ZC-10]: KernelExecutionVerifier owner can cycle-pause to halt all executions indefinitely

**Verdict**: CONFIRMED
**Step Execution**: check1,2,3,4,5
**Rules Applied**: [R4:x(evidence clear)] [R5:x(single entity)] [R6:check] [R8:x(single-step)] [R10:check]
**Severity**: Medium
**Location**: KernelExecutionVerifier.sol:350-355

**Centralization Type**: OPERATIONAL_CONTROL
**Affected Role**: KernelExecutionVerifier owner
**Mitigation Present**: Auto-expiry after 7 days, 48-hour timelock on upgrades, two-step ownership

**Description**:
The verifier owner can call setVerificationPaused(true) to halt ALL proof verification ecosystem-wide. The M-11 auto-expiry (7 days) can be bypassed by cycling: unpause (pausedSince = 0) then re-pause (pausedSince = block.timestamp), resetting the 7-day timer. During pause, no vault execution can proceed and pending optimistic executions may expire and be slashed.

**Impact**: Compromised verifier owner can halt all vault executions indefinitely by cycling pause/unpause. Pending optimistic executions get unfairly slashed since operators cannot submit proofs. The auto-expiry mechanism is bypassed by re-pausing before expiry.

### Postcondition Analysis
**Postconditions Created**: All vault executions halted; pending proofs cannot be submitted
**Postcondition Types**: STATE, TIMING
**Who Benefits**: Attacker wanting bond slashing or protocol halt

---

## Chain Summary

| Finding ID | Severity | Title | Postconditions Created | Postcondition Type |
|------------|----------|-------|------------------------|-------------------|
| ZC-1 | Low | Silent setAccessControl (missing event) | Access policy changed without trace | STATE |
| ZC-2 | Info | Silent rescueTokens (missing event) | Token rescue without trace | STATE |
| ZC-3 | Low | WSTONBondManager single-step ownership | Irrecoverable ownership transfer | ACCESS |
| ZC-4 | Low | VaultAccessControl single-step ownership | Irrecoverable ownership transfer | ACCESS |
| ZC-5 | Medium | Concentrated vault owner control | Full vault control via single key | ACCESS, STATE |
| ZC-6 | Low | MetaVault owner unilateral rebalance | Capital redirection | STATE |
| ZC-7 | Info | rescueTokens scope + no ETH rescue | Design note | N/A |
| ZC-8 | Low | strategyActive not cleared on drain | Vault locked for deposits | STATE |
| ZC-9 | Low | MetaVault immutable owner | Permanent ownership lock | ACCESS |
| ZC-10 | Medium | Verifier cycle-pause bypass | Ecosystem-wide execution halt | STATE, TIMING |
