# Composition Coverage Map

**Agent**: Chain Agent 2 (Chain Matching + Composition Coverage)
**Date**: 2026-04-13

---

## Finding Pair Exploration Status

| Finding A | Finding B | Explored? | Result | Notes |
|-----------|-----------|-----------|--------|-------|
| H-5 (deposit gates dead) | H-15 (withdrawal DoS) | YES | **CH-1 (STRONG)** | One-way valve: deposits bypass gates, withdrawals blocked |
| H-12 (cycle-pause bypass) | H-26 (no verifier post-upgrade) | YES | **CH-2 (STRONG)** | Pause covers upgrade gap, permanent halt |
| H-3 (bond reclaim timing) | H-4 (trivial bond-to-TVL) | YES | **CH-3 (STRONG)** | Full exploit economics: zero-cost drain |
| H-6 (Aave borrow zeroed) | H-7 (aggregate HF) | YES | **CH-4 (STRONG)** | Hidden leverage spiral, cross-vault contagion |
| H-8 (Morpho emergency exit) | H-9 (Morpho stale health) | YES | **CH-5 (STRONG)** | Invisible undercollateralization + locked collateral |
| H-10 (Pendle first-caller) | H-11 (YT never claimed) | YES | **CH-6 (MODERATE)** | Compound yield loss, same adapter |
| H-1 (TRANSFER_ERC20 drain) | H-2 (RISC Zero CVE) | YES | **CH-7 (MODERATE, conditional)** | Trust root break + blast radius amplifier |
| H-5 (deposit gates dead) | H-17 (MetaVault NAV timing) | YES | NO CHAIN | Different components (KernelVault vs MetaVault); deposit bypass does not enable MetaVault arbitrage |
| H-5 (deposit gates dead) | H-21 (donation PPS inflation) | YES | WEAK | Bypassed gates allow attacker to deposit, but donation attack is independent of access control |
| H-6 (Aave borrow zeroed) | H-19 (Aave interest stranded) | YES | NO CHAIN | Both affect AaveV3Adapter but different mechanisms -- zeroed borrow does not create stranded interest |
| H-8 (Morpho emergency exit) | H-31 (Morpho oracle staleness) | YES | WEAK | Oracle staleness is a separate concern; emergency exit failure is independent of oracle freshness |
| H-12 (cycle-pause bypass) | H-20 (owner no timelock) | YES | WEAK | Both are owner-control issues but different contracts (verifier owner vs vault owner) |
| H-13 (shared maxOracleAge) | H-20 (owner no timelock) | YES | MODERATE | Instant signer rotation + stale oracle window. However, H-13 is about parameter conflation, H-20 is about timelock absence. The chain: owner rotates signer instantly (H-20) while maxOracleAge allows old signer's attestations to remain valid for the full window (H-13). This is already captured in the cross-state interaction CH-E from variable_finding_map. |
| H-14 (Uniswap zero slippage) | H-25 (emergency settle flag-only) | YES | WEAK | Both are emergency path issues but different contracts/mechanisms. Emergency settle does not trigger Uniswap withdrawal. |
| H-16 (CoreWriter non-atomicity) | H-25 (emergency settle flag-only) | YES | WEAK | strategyActive desync from H-16 could mean emergencySettle clears a phantom strategy, but the practical impact is already captured by H-16 alone. |
| H-17 (MetaVault NAV timing) | H-18 (MetaVault emergency withdraw) | YES | NO CHAIN | Both affect MetaVault but different mechanisms. NAV arbitrage is about deposits; emergency withdraw is about share burning. No postcondition-precondition match. |
| H-22 (nonce overflow) | H-79 (MAX_NONCE_GAP exhaustion) | YES | WEAK | Both affect nonce space but different magnitudes. Nonce overflow (uint64 max) is separate from gap exhaustion (10-gap window). No meaningful compound. |
| H-3 (bond reclaim) | H-35 (slash to L1 vault address) | YES | MODERATE | If bond is slashed, 80% goes to vault address on L1 which may not exist (H-35). If relayer is offline and bond is reclaimed (H-3), no slash happens at all. These are ALTERNATIVE outcomes, not compound: either the relayer works (H-35 applies) or it doesn't (H-3 applies). Not a chain. |
| H-4 (trivial bond) | H-62 (selfSlash finder=0 burns 10%) | YES | WEAK | selfSlash with trivial bond: 10% of $5 = $0.50 burned. Negligible compound. |
| H-9 (Morpho stale health) | H-33 (Morpho ignores return values) | YES | MODERATE | Both are MorphoAdapter accounting issues. Ignored return values (H-33) mean tracked amounts may diverge from actual Morpho positions INDEPENDENTLY of interest accrual (H-9). However, H-33 is Low and the divergence from return values is typically minimal. Not a meaningful compound attack. |
| H-1 (TRANSFER_ERC20 drain) | H-23 (MAX_ACTIONS gas) | YES | WEAK | Gas explosion is orthogonal -- it prevents execution, not enables drain. These are opposing forces. |
| H-27 (LidoAdapter rebase desync) | H-67 (Lido withdrawal nominal) | YES | MODERATE (already captured in CH-J from variable_finding_map) | Both affect totalTrackedStETH. Negative rebase desync + nominal withdrawal = compounding stETH accounting corruption. Low+Low = no severity upgrade. |
| H-19 (Aave interest stranded) | H-66 (Aave unregister skips borrows) | YES | WEAK | Different mechanisms. Stranded interest is about principal tracking; unregister is about cleanup. No compound. |
| H-38 (no event on setAccessControl) | H-15 (withdrawal DoS) | YES | ABSORBED INTO CH-1 | H-38 is the silent-change enabler for CH-1. Already included in CH-1 sequence step 2. |
| H-20 (no timelock) | H-13 (shared maxOracleAge) | YES | CANDIDATE CH-E | Instant signer rotation + shared staleness window. Variable_finding_map marks this as CH-E. See analysis below. |

---

## Cross-Class Pairs Analysis

| Finding A Class | Finding B Class | Pairs Explored | Chains Found |
|----------------|----------------|---------------|-------------|
| STATE | ACCESS | 3 | CH-1 (STRONG) |
| STATE | TIMING | 4 | CH-2 (STRONG), CH-3 (STRONG) |
| STATE | BALANCE | 5 | CH-4 (STRONG), CH-5 (STRONG), CH-6 (MODERATE) |
| ACCESS | EXTERNAL | 1 | CH-7 (MODERATE) |
| TIMING | EXTERNAL | 2 | 0 (H-3 already has timing+external) |
| STATE | STATE | 6 | CH-4 (same-variable chain), CH-5 (same-variable chain) |
| BALANCE | BALANCE | 3 | CH-6 (additive yield) |

---

## Candidate CH-E Analysis: Instant Signer Rotation + Shared maxOracleAge

**Finding A**: H-20 (INV-29) -- Vault owner concentrated control, no timelock on oracle/bond signer rotation
**Finding B**: H-13 (DEPTH-EX-9, INV-01) -- Shared maxOracleAge conflates bond attestation and price oracle freshness

**Chain hypothesis**: If the vault owner rotates the bond signer instantly (H-20, no timelock), AND maxOracleAge is set to accommodate bond attestation convenience (e.g., 24h) (H-13), THEN during the maxOracleAge window after rotation, BOTH the old signer's attestations AND the new signer's attestations could be valid. A compromised old signer could submit stale-but-within-window bond attestations.

**Assessment**: This is a WEAK chain. The rotation replaces the signer, so old signer's signatures would fail the address check in OracleVerifier. The maxOracleAge parameter controls TIMESTAMP freshness, not SIGNER validity. These are independent issues: H-20 is about governance speed, H-13 is about parameter conflation. They do not form a postcondition-precondition link. **NOT ELEVATED to formal chain.**

---

## Unexplored Cross-Class Medium+ Pairs

| Finding A | Finding B | Class A | Class B | Why Unexplored |
|-----------|-----------|---------|---------|---------------|
| H-14 (UniV4 zero slippage) | H-8 (Morpho emergency exit) | EXTERNAL | STATE | Different adapters, no shared state variable |
| H-16 (CoreWriter desync) | H-7 (aggregate HF) | STATE | STATE | Different contract systems (HyperCore vs Aave), no shared state |
| H-24 (fee extraction >50%) | H-17 (MetaVault NAV timing) | BALANCE | TIMING | Independent mechanisms, no postcondition link |

These unexplored pairs involve findings in DIFFERENT adapter/contract systems with no shared state variables. The variable_finding_map shows no cross-contract variable links between them. **No further iteration needed.**

---

## Summary Statistics

- **Total pairs considered**: 26
- **Chains found**: 7 (CH-1 through CH-7)
- **Strong matches**: 5 (CH-1, CH-2, CH-3, CH-4, CH-5)
- **Moderate matches**: 2 (CH-6, CH-7)
- **Weak/no chain**: 17
- **Unexplored Medium+ cross-class pairs**: 3 (all in different contract systems with no shared state)
- **Iteration 2 needed**: NO (0 unexplored cross-class Medium+ pairs with shared state variables)
