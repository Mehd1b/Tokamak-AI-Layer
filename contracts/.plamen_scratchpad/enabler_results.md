# Enabler Enumeration Results

**Agent**: Chain Agent 1 (Enabler Enumeration + Grouping)
**Date**: 2026-04-13

---

## STEP 0-pre: Cross-Domain Dependency Scan

| Tag | Source | Referenced Domain | Covered by Finding? | Action |
|-----|--------|------------------|--------------------:|--------|
| [CROSS-DOMAIN-DEP: external -- assumes ZK proof verification prevents malicious action sequences] | DEPTH-TF-1 | external (RISC Zero verifier) | DEPTH-EX-7 (CONTESTED) | If CVE-2025-52484 unpatched, DEPTH-TF-1 blast radius is 78.4%-100% vault drain via TRANSFER_ERC20 compound |
| [CROSS-DOMAIN-DEP: state-trace -- assumes adapter owner has no backdoor to extract stranded interest] | DEPTH-TF-3 | state-trace (adapter ownership) | No finding covers adapter owner extraction | Noted as design assumption; adapter is non-upgradeable so no backdoor exists |
| [CROSS-DOMAIN-DEP: external -- if the vault does not hold sufficient loan tokens] | DEPTH-ST-3 | token-flow | DEPTH-EX-2, INV-70 | YES -- compound path confirmed: interest residual + missing loan tokens = full emergency exit blocked |
| [CROSS-DOMAIN-DEP: external -- relayer is centralized off-chain service (FULLY_TRUSTED)] | DEPTH-ST-4 | external (relayer liveness) | DEPTH-EX-6, DST-5 | YES -- relayer offline = bond reclaim, extensively covered |
| [CROSS-DOMAIN-DEP: external -- if the vault holds regulated securities] | DEPTH-ST-1 | external/legal | No finding covers legal implications | Regulatory risk outside smart contract scope; noted |
| [CROSS-DOMAIN-DEP: token-flow -- reward tokens that accumulate in adapter post-stranding] | DEPTH-EX-4 | token-flow | DEPTH-TF-6 | YES -- compound: first-caller captures + stranded rewards unrecoverable |
| [CROSS-DOMAIN-DEP: state-trace -- strategyActive flag lifecycle] | DEPTH-EX-8 | state-trace | DEPTH-ST-5 (partial, different mechanism) | CoreWriter non-atomicity creates phantom strategyActive; different root cause from cycle-pause |
| [CROSS-DOMAIN-DEP: token-flow -- this finding is contingent on the vault not holding loan tokens] | DEPTH-EX-2 | token-flow | DEPTH-TF-8, DEPTH-ST-3 | YES -- same root cause (Morpho interest) + missing loan tokens = compound exit block |
| [CROSS-DOMAIN-DEP: temporal -- impact depends on whether all underlyings have satisfied 14-day delay] | DEPTH-EC-3 | temporal | No specific finding | Operational timing dependency; MetaVault emergency path vulnerable to uneven pause timing |
| [CROSS-DOMAIN-DEP: access -- requires vault owner to keep submitting proofs] | DEPTH-EC-6 | access control | No finding | nonce overflow reachability depends on proof submission infrastructure |

---

## STEP 0a: Dangerous States Extracted

| # | Finding ID(s) | Dangerous State S | Current Known Path(s) | Actor Category |
|---|-------------|-------------------|----------------------|---------------|
| S1 | DEPTH-TF-1, DEPTH-EC-1 | Vault drained >40% via TRANSFER_ERC20 compound | Forged proof (CVE-2025-52484 or future exploit) | External attacker |
| S2 | DEPTH-ST-4, DEPTH-EX-6, DST-5 | Bond reclaimed after vault drain (zero penalty) | Relayer offline >90 days after slash event | Malicious operator |
| S3 | DEPTH-ST-1, INV-55 | Unauthorized deposits bypass whitelist/cap/KYC | Any external address calls deposit functions | External attacker |
| S4 | DEPTH-ST-2, INV-61 | Aave health check permanently blinded (borrow tracking zeroed) | withdrawToVault() fails on Aave pool.withdraw | Vault operator (natural operation) |
| S5 | DEPTH-ST-3, DEPTH-TF-8, DEPTH-EX-2, INV-62, INV-70 | Morpho collateral permanently locked | Interest accrual on borrow position + emergency exit attempt | Natural operation (time-dependent) |
| S6 | INV-19, DEPTH-ST-1 | Withdrawal DoS via reverting accessControl | Owner sets reverting contract as accessControl | Vault owner (semi-trusted action) |
| S7 | DEPTH-ST-5, INV-31 | All vault executions halted indefinitely | Verifier owner cycle-pauses every 7 days | Verifier owner (trusted actor) |
| S8 | DEPTH-TF-6, DEPTH-EX-4, INV-66 | Non-first-caller vaults permanently lose reward share | Any vault calls claimRewards before others | Adversarial vault operator or natural race |
| S9 | DEPTH-EX-5, INV-67 | All YT interest yield permanently stranded | Hardcoded empty yts array in claimRewards | Design gap (always active) |
| S10 | DST-10 | Profitable vault drain with trivial bond at risk | Vault owner=operator sets minBond near floor | Malicious operator/vault owner |
| S11 | DEPTH-EX-3, INV-72 | Emergency LP removal value extracted via MEV | MEV bot sandwiches zero-slippage emergency withdraw | External attacker (MEV bot) |
| S12 | DEPTH-EX-8 | strategyActive=true without actual HyperCore position | CoreWriter silently drops order after EVM state updated | Natural operation (async system) |

---

## STEP 0b: 5-Actor-Category Enumeration

### S1: Vault drained >40% via TRANSFER_ERC20 compound drain

| # | Actor Category | Path to State S1? | Reachable? | Existing Finding? | New Finding? |
|---|----------------|-------------------|------------|-------------------|--------------|
| 1 | External attacker (permissionless) | Forge proof via CVE-2025-52484 (if verifier unpatched) then use 3-64 TRANSFER_ERC20 actions | YES (if CVE applies) | DEPTH-TF-1, DEPTH-EC-1, DEPTH-EX-7 | N/A |
| 2 | Semi-trusted role | Oracle signer (Role A) cannot forge proofs; bond signer (Role B) compromise + executeOptimistic with malicious agent output -- but optimistic mode ALSO requires proof eventually | NO -- optimistic still requires proof or slash | -- | N/A |
| 3 | Natural operation | Legitimate agent accidentally outputs >3 TRANSFER_ERC20 at 40% each | YES (no cap on action count for this type) | DEPTH-TF-1 | N/A |
| 4 | External event | RISC Zero CVE or verifier downgrade by owner | YES (if verifier owner compromised) | DEPTH-EX-7 | N/A |
| 5 | User action sequence | Depositor cannot control agent output | NO | -- | N/A |

### S2: Bond reclaimed after vault drain (zero economic penalty)

| # | Actor Category | Path to State S2? | Reachable? | Existing Finding? | New Finding? |
|---|----------------|-------------------|------------|-------------------|--------------|
| 1 | External attacker | Cannot call reclaimExpiredBond (only operator) | NO | -- | N/A |
| 2 | Semi-trusted role | Operator IS the semi-trusted actor here | YES | DEPTH-ST-4, DST-5 | N/A |
| 3 | Natural operation | Relayer goes offline naturally (infra failure) | YES | DST-5 | N/A |
| 4 | External event | Relayer DoS attack by malicious operator | YES | DST-5 | N/A |
| 5 | User action sequence | Users cannot influence bond lifecycle | NO | -- | N/A |

### S3: Unauthorized deposits bypass access controls

| # | Actor Category | Path to State S3? | Reachable? | Existing Finding? | New Finding? |
|---|----------------|-------------------|------------|-------------------|--------------|
| 1 | External attacker (permissionless) | Call depositERC20Tokens or depositETH directly | YES | DEPTH-ST-1, INV-55 | N/A |
| 2 | Semi-trusted role | N/A -- all addresses already bypass | YES | -- | N/A |
| 3 | Natural operation | Any depositor deposits normally bypassing intended controls | YES | DEPTH-ST-1 | N/A |
| 4 | External event | N/A | -- | -- | N/A |
| 5 | User action sequence | Normal deposit is already the bypass | YES | DEPTH-ST-1 | N/A |

### S4: Aave health check permanently blinded

| # | Actor Category | Path to State S4? | Reachable? | Existing Finding? | New Finding? |
|---|----------------|-------------------|------------|-------------------|--------------|
| 1 | External attacker | Cannot directly trigger withdrawToVault (only vault can call) | NO | -- | N/A |
| 2 | Semi-trusted role | Vault owner triggers withdrawToVault during Aave pool pause | YES | DEPTH-ST-2 | N/A |
| 3 | Natural operation | Aave pool temporarily pauses (governance/emergency) + vault calls withdrawToVault | YES | DEPTH-ST-2 | N/A |
| 4 | External event | Aave governance pauses pool → withdrawal fails → borrow tracking zeroed | YES | DEPTH-ST-2 | N/A |
| 5 | User action sequence | Users cannot trigger adapter operations | NO | -- | N/A |

### S5: Morpho collateral permanently locked

| # | Actor Category | Path to State S5? | Reachable? | Existing Finding? | New Finding? |
|---|----------------|-------------------|------------|-------------------|--------------|
| 1 | External attacker | Cannot trigger emergency path directly | NO | -- | N/A |
| 2 | Semi-trusted role | Vault owner triggers emergency exit after interest accrual | YES | DEPTH-ST-3, DEPTH-TF-8 | N/A |
| 3 | Natural operation | ANY borrow position with accrued interest + emergency exit attempt | YES | DEPTH-ST-3, DEPTH-TF-8, DEPTH-EX-2 | N/A |
| 4 | External event | Morpho interest rate spike accelerates accrual | YES | -- | [EN-1] |
| 5 | User action sequence | Users cannot trigger adapter operations | NO | -- | N/A |

**[EN-1]**: Morpho interest rate spike (external event) accelerates the divergence between tracked principal and actual debt, making the emergency exit failure more severe. The higher the rate and the longer the position, the more collateral is locked. This is a NATURAL AMPLIFIER of S5, not a distinct attack.

### S6: Withdrawal DoS via reverting accessControl

| # | Actor Category | Path to State S6? | Reachable? | Existing Finding? | New Finding? |
|---|----------------|-------------------|------------|-------------------|--------------|
| 1 | External attacker | Cannot set accessControl (owner only) | NO | -- | N/A |
| 2 | Semi-trusted role | Vault owner calls setAccessControl(reverting_contract) | YES | INV-19 | N/A |
| 3 | Natural operation | Owner accidentally deploys broken accessControl contract | YES (unlikely) | INV-19 | N/A |
| 4 | External event | N/A | -- | -- | N/A |
| 5 | User action sequence | Users cannot influence accessControl | NO | -- | N/A |

### S10: Profitable vault drain with trivial bond

| # | Actor Category | Path to State S10? | Reachable? | Existing Finding? | New Finding? |
|---|----------------|-------------------|------------|-------------------|--------------|
| 1 | External attacker | Cannot set minBond (owner only) | NO | -- | N/A |
| 2 | Semi-trusted role | Vault owner IS operator, sets minBond = floor | YES | DST-10 | N/A |
| 3 | Natural operation | Vault deployed with default low minBond | YES | DST-10, DST-4 | N/A |
| 4 | External event | N/A | -- | -- | N/A |
| 5 | User action sequence | Depositors enter vault without verifying bond-to-TVL ratio | YES | -- | [EN-2] |

**[EN-2]**: Depositor action sequence enables S10 -- depositors deposit into a vault without checking the bond-to-TVL ratio because there is no on-chain mechanism to surface this ratio. This is not a new vulnerability but an enabler: depositor deposits + low minBond = profitable drain target. Impact severity inherited from DST-10 (High). This is an INFORMATION ASYMMETRY enabler, not a code bug.

---

## STEP 0c: Cross-State Interactions

### Cross-State 1: S4 (Aave borrow tracking zeroed) + S4 aggregate HF (DEPTH-TF-4)
Reaching S4 (via failed withdrawToVault zeroing _vaultBorrowed) ALSO creates the precondition for DEPTH-TF-4 (aggregate HF cross-vault subsidy). With _vaultBorrowed=0 for one vault, the aggregate HF is no longer constrained by that vault's debt. The vault can then re-borrow unlimited amounts under the aggregate umbrella. Combined: zero-tracked + aggregate HF = hidden leverage spiral threatening ALL vaults sharing the adapter.

### Cross-State 2: S3 (unauthorized deposits) + S6 (withdrawal DoS)
If S3 is active (deposit gates bypassed), unauthorized depositors enter the vault. If the owner then triggers S6 (reverting accessControl), deposits still work (canDeposit never called) but withdrawals revert. Result: one-way valve -- funds enter but cannot exit. Combination of DEPTH-ST-1 + INV-19.

### Cross-State 3: S5 (Morpho collateral locked) + S4 (Aave borrow zeroed)
If a vault uses BOTH MorphoAdapter and AaveV3Adapter, triggering S4 on Aave (borrow tracking zeroed) and S5 on Morpho (collateral locked) creates a scenario where the vault has phantom health on Aave (no tracked debt) but real locked collateral on Morpho. The combined state makes the vault's risk position invisible to any health monitoring.

### Cross-State 4: S2 (bond reclaimed) + S10 (trivial bond)
S10 establishes the precondition (low bond-to-TVL ratio) and S2 provides the mechanism (relayer offline for reclaim). Together: operator drains vault at trivial bond cost, then recovers even that trivial bond after 90 days. Net loss to operator: gas costs only.

### Cross-State 5: S1 (TRANSFER_ERC20 drain) serves as blast radius for DEPTH-EX-7 (CVE verifier)
If the ZK verifier is vulnerable (S1 precondition via CVE-2025-52484), the TRANSFER_ERC20 compound drain becomes the exploitation mechanism. The verifier vulnerability is the enabler; the drain cap bypass is the blast radius amplifier.

### Cross-State 6: S7 (indefinite pause) + INV-40 (no verifier post-upgrade)
If the verifier owner cycle-pauses (S7) AND a UUPS upgrade drops the approvedVerifiers mapping (INV-40), the new verifier instance has no approved verifiers. Combined: indefinite pause + broken verifier rotation = permanent protocol halt.

---

## New Enabler Findings

### [EN-1]: Morpho Interest Rate Spike Amplifies Emergency Exit Failure
- **Severity**: Medium (inherited from S5)
- **Location**: MorphoAdapter.sol:L599-644
- **Description**: External Morpho interest rate increases accelerate the divergence between _vaultBorrowed (tracked principal) and actual Morpho debt. At higher rates, the emergency exit failure (DEPTH-ST-3, DEPTH-TF-8) manifests faster and with larger collateral lockup. This is a natural amplifier, not a distinct vulnerability -- absorbed into the S5 hypothesis.
- **Absorbed into**: S5 (Morpho collateral lock hypothesis)

### [EN-2]: Depositor Information Asymmetry on Bond-to-TVL Ratio
- **Severity**: Informational (depositor education issue)
- **Location**: OptimisticKernelVault.sol (no on-chain ratio check)
- **Description**: Depositors have no on-chain mechanism to verify the bond-to-TVL ratio before depositing. This enables S10 (profitable drain with trivial bond). This is an INFORMATION ASYMMETRY gap, not a code vulnerability.
- **Absorbed into**: S10 (bond deterrence hypothesis)
