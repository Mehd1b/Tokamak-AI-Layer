# Finding-to-Hypothesis Mapping

**Agent**: Chain Agent 1
**Date**: 2026-04-13

---

## Finding → Hypothesis Map

| Finding ID | Source | Hypothesis | Role in Hypothesis |
|------------|--------|-----------|-------------------|
| DEPTH-TF-1 | depth-token-flow | H-1 | Primary (compound drain mechanism) |
| DEPTH-EC-1 | depth-edge-case | H-1 | Corroborating (same root cause, boundary analysis) |
| DEPTH-EX-7 | depth-external | H-2 | Primary (CVE verifier trust root) |
| DEPTH-ST-4 | depth-state-trace | H-3 | Primary (cross-chain timing gap) |
| DEPTH-EX-6 | depth-external | H-3 | Corroborating (same root cause) |
| DST-5 | design-stress | H-3 | Corroborating (full attack sequence) |
| INV-34 | breadth (TC-4) | H-3 | Original breadth finding |
| INV-38 | breadth (TC-10) | H-3 | Related (front-running residual) |
| DST-10 | design-stress | H-4 | Primary (bond deterrence economics) |
| DST-4 | design-stress | H-4 | Corroborating (bond economics at scale) |
| DEPTH-ST-1 | depth-state-trace | H-5 | Primary (deposit gates dead) |
| INV-55 | breadth (PC2-1) | H-5 | Corroborating (same root cause) |
| INV-56 | breadth (PC2-2) | H-5 | Related (recordWithdrawal misattribution) |
| DEPTH-ST-2 | depth-state-trace | H-6 | Primary (Aave borrow tracking zeroed) |
| INV-61 | breadth (PC5-1) | H-6 | Corroborating (same root cause) |
| DEPTH-TF-4 | depth-token-flow | H-7 | Primary (aggregate HF cross-vault subsidy) |
| INV-04 | breadth (OA-5) | H-7 | Original breadth finding |
| DEPTH-ST-3 | depth-state-trace | H-8 | Primary (Morpho interest residual blocks emergency exit) |
| DEPTH-TF-8 | depth-token-flow | H-8 | Corroborating (same root cause) |
| DEPTH-EX-2 | depth-external | H-8 | Related (vault lacks loan tokens) |
| INV-62 | breadth (PC5-2) | H-8 | Original breadth finding |
| INV-70 | breadth (SE-3) | H-8 | Related (emergency exit blocked) |
| DEPTH-ST-8 | depth-state-trace | H-9 | Primary (Morpho health check stale nominal) |
| DEPTH-EX-1 | depth-external | H-9 | Corroborating (same root cause) |
| INV-73 | breadth (SE-7) | H-9 | Original breadth finding |
| DEPTH-TF-6 | depth-token-flow | H-10 | Primary (Pendle reward race) |
| DEPTH-EX-4 | depth-external | H-10 | Corroborating (same root cause) |
| INV-66 | breadth (PC6-1) | H-10 | Original breadth finding |
| INV-51 | breadth (RS2-2) | H-10 | Related (PT excluded from weight) |
| DEPTH-EX-5 | depth-external | H-11 | Primary (YT yield never claimed) |
| INV-67 | breadth (PC6-2) | H-11 | Original breadth finding |
| DEPTH-ST-5 | depth-state-trace | H-12 | Primary (cycle-pause bypass) |
| INV-31 | breadth (ZC-10) | H-12 | Original breadth finding |
| INV-35 | breadth (TC-5) | H-12 | Related (MAX_PAUSE_DURATION vs rotation) |
| DEPTH-EX-9 | depth-external | H-13 | Primary (shared maxOracleAge) |
| INV-01 | breadth (OA-1+TC-2) | H-13 | Original breadth finding |
| DEPTH-EX-3 | depth-external | H-14 | Primary (zero-slippage emergency LP removal) |
| INV-72 | breadth (SE-5) | H-14 | Original breadth finding |
| INV-19 | breadth (SR-6) | H-15 | Primary (DoS via reverting accessControl) |
| INV-17 | breadth (SR-5+ZC-2) | H-15 | Enabler (silent policy change) |
| DEPTH-EX-8 | depth-external | H-16 | Primary (CoreWriter non-atomicity desync) |
| INV-22 | breadth (CS-1) | H-17 | Primary (MetaVault NAV timing arbitrage) |
| DST-9 | design-stress | H-17 | Corroborating (deposit front-running) |
| DEPTH-EC-7 | depth-edge-case | H-17 | Related (NAV=0 with shares>0) |
| INV-25 | breadth (CS-5) | H-18 | Primary (MetaVault emergencyWithdraw trackedIdle) |
| DEPTH-TF-5 | depth-token-flow | H-18 | Corroborating (downgraded, design trade-off) |
| DEPTH-EC-3 | depth-edge-case | H-18 | Related (shares burned before recovery) |
| DEPTH-TF-3 | depth-token-flow | H-19 | Primary (Aave interest stranding) |
| INV-08 | breadth (TF-3) | H-19 | Original breadth finding |
| INV-29 | breadth (ZC-5) | H-20 | Primary (concentrated owner control) |
| INV-06 | breadth (TF-1) | H-21 | Primary (ERC20 PPS donation) |
| DEPTH-TF-2 | depth-token-flow | H-21 | Depth analysis (downgraded to Low) |
| DEPTH-EC-6 | depth-edge-case | H-22 | Primary (uint64 nonce overflow) |
| DST-1 | design-stress | H-23 | Primary (MAX_ACTIONS gas explosion) |
| DST-3 | design-stress | H-24 | Primary (fee extraction exceeds 50%) |
| DST-6 | design-stress | H-25 | Primary (emergency settle recovery time) |
| INV-40 | breadth (MG-2) | H-26 | Primary (UUPS upgrade verifier gap) |
| INV-29 | breadth (ZC-5) | H-20 | Already mapped |
| DEPTH-TF-7 | depth-token-flow | H-27 | Primary (LidoAdapter negative rebase desync) |
| INV-10 | breadth (TF-5) | H-27 | Original breadth finding |
| INV-50 | breadth (RS2-1) | H-27 | Related (nominal decrement) |
| DEPTH-EX-10 | depth-external | H-28 | Primary (Pendle SY residual stranded) |
| INV-69 | breadth (PC6-4) | H-28 | Original breadth finding |
| DEPTH-ST-6 | depth-state-trace | H-29 | Primary (snapshot desync independent clamping) |
| DEPTH-ST-7 | depth-state-trace | H-30 | Primary (_pendingCount self-correction) |
| INV-02 | breadth (OA-3) | H-31 | Primary (MorphoAdapter oracle no staleness) |
| INV-41 | breadth (MG-4) | H-32 | Primary (VaultFactory code store swap race) |
| INV-09 | breadth (TF-4) | H-33 | Primary (MorphoAdapter ignores return values) |
| INV-11 | breadth (TF-6) | H-34 | Primary (MetaVault FoT trackedIdle) |
| INV-13 | breadth (TF-8) | H-35 | Primary (slash bond to L1 vault address) |
| INV-14 | breadth (SR-1+ZC-3) | H-36 | Single-step ownership transfer group |
| INV-16 | breadth (SR-3+ZC-4) | H-36 | Same pattern |
| INV-15 | breadth (SR-2+ZC-9) | H-37 | Primary (MetaVault immutable owner) |
| INV-17 | breadth (SR-5+ZC-2) | H-38 | Missing event group |
| INV-18 | breadth (SR-5) | H-38 | Same pattern |
| INV-20 | breadth (SR-8) | H-39 | Primary (MetaVault removeVault no try/catch) |
| INV-21 | breadth (SR-7) | H-40 | Primary (registerExternalVault no interface check) |
| INV-23 | breadth (CS-2) | H-41 | Primary (HWM preserved through fee toggle) |
| INV-24 | breadth (CS-3) | H-42 | Primary (slash depositor share to treasury) |
| INV-26 | breadth (CS-5) | H-43 | Primary (partial withdrawal rounding) |
| INV-27 | breadth (CS-6) | H-44 | Primary (MetaVault Phase 2 under-allocation) |
| INV-28 | breadth (CS-7) | H-45 | Primary (execution bonus Sybil) |
| INV-30 | breadth (ZC-8) | H-46 | Primary (strategyActive persists) |
| INV-32 | breadth (TC-1) | H-47 | Primary (setChallengeWindow increase-only) |
| INV-33 | breadth (TC-3) | H-48 | Primary (setMinBondFloor immediate effect) |
| INV-36 | breadth (TC-7) | H-49 | Primary (first setFees bypasses cooldown) |
| INV-37 | breadth (TC-8) | H-50 | Primary (strategyActivatedAt set once) |
| INV-39 | breadth (MG-1) | H-51 | Primary (__gap comment off-by-one) |
| INV-42 | breadth (MG-5) | H-52 | Primary (agent successor chain) |
| INV-43 | breadth (MG-6) | H-53 | Primary (1-wei blocks unregister) |
| INV-44 | breadth (SL-1) | H-54 | Primary (stale _agentMetadataURI) |
| INV-45 | breadth (SE-1) | H-55 | Primary (Uniswap LP fees no collection) |
| INV-46 | breadth (SE-2) | H-56 | Primary (Pendle YT expired tokens) |
| INV-47 | breadth (SLITHER-1) | H-57 | Primary (ETH call in action loop) |
| INV-48 | breadth (SLITHER-2) | H-58 | Primary (AgentRegistry external calls in loop) |
| INV-49 | breadth (SLITHER-3) | H-58 | Same pattern (LidoAdapter) |
| INV-52 | breadth (RS2-3) | H-59 | Primary (residual approval after partial fill) |
| INV-53 | breadth (RS2-4) | H-60 | Primary (PointsProgram arbitrary balance) |
| INV-54 | breadth (RS2-5) | H-61 | Primary (BuilderProgram O(N^2) sort) |
| INV-57 | breadth (PC2-3) | H-62 | Primary (selfSlash finder=address(0)) |
| INV-58 | breadth (PC4-1) | H-63 | Primary (VaultFactory protocol fee dead state) |
| INV-59 | breadth (PC4-2) | H-64 | Primary (VaultFactory init missing code.length) |
| INV-60 | breadth (PC4-3) | H-65 | Primary (setVaultCreationCodeStore dead code) |
| INV-63 | breadth (PC5-3) | H-66 | Primary (unregisterVault ignores borrows) |
| INV-64 | breadth (PC5-4) | H-67 | Primary (LidoAdapter positive-rebase withdrawal) |
| INV-65 | breadth (PC5-5) | H-68 | Primary (AaveV3 _suppliedAssets not cleaned) |
| INV-68 | breadth (PC6-3) | H-69 | Primary (setSlippage allows 100%) |
| INV-71 | breadth (SE-4) | H-70 | Primary (Pendle instantaneous weight snapshot) |
| INV-74 | breadth (SE-9) | H-71 | Primary (StakingRouter hardcoded 1e9) |
| INV-75 | breadth (SE-10) | H-72 | Primary (LidoAdapter no stETH rescue) |
| INV-03 | breadth (OA-4) | H-73 | Primary (1e36 oracle scale hardcode) |
| INV-05 | breadth (OA-6) | H-74 | Primary (Morpho oracle revert DoS) |
| INV-12 | breadth (TF-7) | H-75 | Primary (Aave rewards to vault no exit) |
| DEPTH-EC-2 | depth-edge-case | H-76 | Primary (performance metrics not reset) |
| DEPTH-EC-4 | depth-edge-case | H-77 | Primary (same-block fee zero-duration) |
| DEPTH-EC-8 | depth-edge-case | H-78 | Primary (bond expiry boundary correct) |
| DST-2 | design-stress | H-79 | Primary (MAX_NONCE_GAP exhaustion) |
| DST-7 | design-stress | H-80 | Primary (HyperliquidAdapter no vault cap) |
| DST-8 | design-stress | H-81 | Primary (AgentRegistry unregister 50-vault cap) |

---

## Orphan Finding Coverage

All 75 INV findings + all depth findings + all DST findings have been mapped to a hypothesis. Zero orphans.
