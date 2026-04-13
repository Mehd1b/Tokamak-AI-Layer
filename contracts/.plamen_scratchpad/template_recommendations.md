# Template Recommendations

## Template Analysis

### 1. FLASH_LOAN_INTERACTION
- **Trigger**: FLASH_LOAN or FLASH_LOAN_EXTERNAL flag
- **Detected**: NO — No direct flash loan patterns in scope contracts
- **Required**: NO
- **Reason**: Protocol does not implement or integrate flash loan facilities. However, flash loans CAN be used by attackers to manipulate external state (balances, prices) before interacting with the protocol. This is covered by R15 in the finding format.

### 2. ORACLE_ANALYSIS
- **Trigger**: ORACLE flag
- **Detected**: YES — OracleVerifier library, dual-role oracle signers, bond attestation
- **Required**: YES
- **Reason**: Core protocol security depends on oracle signature verification for both price feeds (Role A) and bond attestations (Role B). C-02 fix introduced dual-role separation. Staleness checks, signature malleability (EIP-2), and bound signature format are critical. Also: MorphoAdapter uses IMorphoOracle for LTV; AaveV3Adapter uses Aave oracle for health factor.
- **Key Questions**: (1) Can the bound oracle signature format be replayed across vaults or chains? (2) Is the staleness check (>= vs >) consistent across all verification sites? (3) Can oracleSigner and bondSigner ever converge to the same address despite the 4-site invariant?

### 3. TOKEN_FLOW_TRACING
- **Trigger**: BALANCE_DEPENDENT flag
- **Detected**: YES — 8 contracts use balance-based accounting
- **Required**: YES
- **Reason**: KernelVault uses balanceOf(this) for ERC20 and trackedETHBalance for ETH. MetaVault uses trackedIdle. Fee calculations depend on totalAssets(). Strategy snapshot creates dual-state accounting. Fee-on-transfer tokens supported via balance-before/after pattern.
- **Key Questions**: (1) Can a donation to the vault inflate PPS and extract value from new depositors? (2) Is trackedETHBalance always consistent with actual ETH balance? (3) During strategy, can the snapshot become stale relative to actual vault state?

### 4. ZERO_STATE_RETURN
- **Trigger**: ERC4626/first-depositor patterns
- **Detected**: YES — KernelVault and MetaVault both use virtual offset (DECIMALS_OFFSET = 1e3)
- **Required**: YES
- **Reason**: First depositor attack surface. Virtual offset mitigates inflation attack but introduces precision divergence for small vaults (L-31 documented). Fee epoch reset on empty vault creates potential re-entry concerns.
- **Key Questions**: (1) Can the first depositor manipulation the PPS via the virtual offset? (2) When totalShares returns to 0 and fees are reset, can an attacker exploit the re-anchor sequence?

### 5. STAKING_RECEIPT_TOKENS
- **Trigger**: Receipt token detected
- **Detected**: YES — LidoAdapter (stETH rebasing, wstETH), AaveV3Adapter (aTokens rebasing), PendleAdapter (PT/YT)
- **Required**: YES
- **Reason**: Rebasing tokens (stETH, aTokens) change balances between transactions. wstETH is non-rebasing wrapper. PT/YT have expiry. All affect vault accounting if held as the vault asset.
- **Key Questions**: (1) If a vault holds stETH as asset, does the rebase affect totalAssets() and PPS? (2) Are adapter tracked amounts consistent with the rebasing behavior?

### 6. SEMI_TRUSTED_ROLES
- **Trigger**: SEMI_TRUSTED_ROLE flag
- **Detected**: YES — 10 contracts have semi-trusted roles
- **Required**: YES
- **Reason**: Vault owner controls execute(), fees, pause, oracle configuration. WSTONBondManager owner controls treasury, relayer, vault authorization. All adapters are controlled by vault owners. MetaVault owner controls rebalance weights. Multiple timelocks and cooldowns already in place.
- **Key Questions**: (1) Can a malicious vault owner extract depositor value through fee manipulation despite C-05 and M-07 fixes? (2) Can the WSTONBondManager owner front-run a slash by rotating the relayer? (3) Can the MetaVault owner manipulate weights to extract value during rebalance?

### 7. TEMPORAL_PARAMETER_STALENESS
- **Trigger**: TEMPORAL flag
- **Detected**: YES — 10 contracts have temporal patterns
- **Required**: YES
- **Reason**: Challenge windows, fee cooldowns, emergency delays, bond expiry, rebalance cooldown, oracle staleness, UUPS upgrade timelocks, relayer rotation delay, season end notice period. Many time-dependent state transitions.
- **Key Questions**: (1) Can fee collection be timed to maximise extraction around strategy activation/settlement? (2) Can the challenge window be gamed with block.timestamp manipulation? (3) Is the relayer rotation delay (1h) sufficient for in-flight slash messages?

### 8. CENTRALIZATION_RISK
- **Trigger**: 3+ privileged roles (optional)
- **Detected**: YES — Multiple distinct privileged roles: vault owner, factory owner, registry owner, bond manager owner, adapter owners, verifier owner, relayer
- **Required**: YES (optional but strongly recommended given protocol architecture)
- **Reason**: Each UUPS upgradeable contract has a single owner. VaultFactory owner can change code stores (with timelock). Vault owner controls all execution and fee parameters. No multisig or governance required by protocol.

### 9. SHARE_ALLOCATION_FAIRNESS
- **Trigger**: SHARE_ALLOCATION flag
- **Detected**: YES — KernelVault (deposit/withdraw PPS), MetaVault (NAV-based), WSTONBondManager (slash distribution)
- **Required**: YES
- **Reason**: Share pricing during strategy active state uses snapshots. Fee share minting dilutes depositors. MetaVault NAV depends on underlying vault pricing. Slash distribution percentages are hardcoded.
- **Key Questions**: (1) Can fee share minting during a strategy create phantom dilution? (2) Is the MetaVault withdraw formula symmetric with deposit? (3) Can partial emergency withdrawals create unfair distribution of remaining assets?

### 10. ECONOMIC_DESIGN_AUDIT
- **Trigger**: MONETARY_PARAMETER flag
- **Detected**: YES — Fee structures, bond economics, slash distribution, PPS computation
- **Required**: YES
- **Reason**: Complex fee extraction (management + performance + protocol split with combined cap). Bond economics must incentivize honest behavior. MetaVault rebalance slippage. Points program multipliers.
- **Key Questions**: (1) At max combined fees (50%), what is the effective annual cost to depositors? (2) Is the minBond sufficient to deter malicious optimistic executions? (3) Can the rebalance slippage check (2%) be gamed?

### 11. EXTERNAL_PRECONDITION_AUDIT
- **Trigger**: External interactions
- **Detected**: YES — 7 external protocol integrations (Aave, Morpho, Lido, Pendle, Uniswap, Polymarket, Hyperliquid)
- **Required**: YES
- **Reason**: Each adapter makes assumptions about external protocol behavior. CoreWriter non-atomicity is critical. Aave health factor dependency. Pendle expiry. Morpho oracle scale.

### 12. VERIFICATION_PROTOCOL
- **Trigger**: Always (verifiers)
- **Required**: YES
- **Reason**: All verified findings must follow the verification protocol.

### 13. FORK_ANCESTRY
- **Trigger**: Always (recon TASK 0)
- **Required**: YES (already running via recon)
- **Reason**: ERC4626-like pattern with virtual offset is a known fork variant.

### 14. MIGRATION_ANALYSIS
- **Trigger**: MIGRATION flag
- **Detected**: YES — UUPS upgradeable contracts with timelocked upgrades
- **Required**: YES
- **Reason**: AgentRegistry, VaultFactory, KernelExecutionVerifier are all UUPS upgradeable. Storage gap management is critical. Code store swaps also timelocked.
- **Key Questions**: (1) Are __gap sizes consistent after adding new state slots? (2) Can a scheduled upgrade be front-run? (3) Are storage slots preserved correctly across the upgrade path?

### 15. CROSS_CHAIN_TIMING
- **Trigger**: CROSS_CHAIN flag
- **Detected**: YES — Cross-chain bond system (L1 Ethereum ↔ HyperEVM)
- **Required**: YES
- **Reason**: Bond locking on L1, attestation relay to HyperEVM, event relay back to L1. Timing assumptions between chains. Relayer trust. Bond expiry safety valve.
- **Key Questions**: (1) What happens if the relayer goes offline during the challenge window? (2) Can an operator front-run the cross-chain slash by reclaiming the bond? (3) Is the 90-day bond expiry sufficient given cross-chain relay latency?

### 16. STORAGE_LAYOUT_SAFETY
- **Trigger**: STORAGE_LAYOUT flag (proxy/upgradeable/assembly)
- **Detected**: YES — 3 UUPS contracts with __gap, assembly in KernelOutputParser and OracleVerifier
- **Required**: YES
- **Reason**: __gap was reduced from 43→40 (AgentRegistry), 40→33 (VaultFactory), 48→45 (KernelExecutionVerifier) to accommodate new state. Assembly in binary parsing and signature verification.
- **Key Questions**: (1) Do the __gap reductions exactly account for the new state slots? (2) Is the assembly in KernelOutputParser memory-safe? (3) Are assembly-parsed signature components (r, s, v) correctly bounded?

---

## BINDING MANIFEST

| Template | Pattern Trigger | Required? | Reason |
|----------|-----------------|-----------|--------|
| FLASH_LOAN_INTERACTION | No flash loan patterns | NO | No flash loan facility. R15 covers attacker-side flash loan scenarios. |
| ORACLE_ANALYSIS | ORACLE flag — OracleVerifier, dual-role, bound signatures | **YES** | Core security: dual-role oracle (C-02), staleness, signature replay |
| TOKEN_FLOW_TRACING | BALANCE_DEPENDENT — 8 contracts | **YES** | balanceOf-based accounting, trackedETHBalance, trackedIdle, fee-on-transfer |
| ZERO_STATE_RETURN | ERC4626 with DECIMALS_OFFSET=1e3 | **YES** | First-depositor, fee epoch reset on empty vault |
| STAKING_RECEIPT_TOKENS | stETH/wstETH, aTokens, PT/YT | **YES** | Rebasing tokens affect vault accounting |
| EVENT_CORRECTNESS | 2 silent setters found | Optional | 2 silent setters (setAccessControl, rescueTokens) — small surface |
| SEMI_TRUSTED_ROLES | 10 contracts with owner/relayer/authorized roles | **YES** | Vault owner controls execution+fees, relayer controls bonds |
| MIGRATION_ANALYSIS | UUPS upgradeable + timelocked code stores | **YES** | Storage gap management, upgrade path integrity |
| CROSS_CHAIN_TIMING | Cross-chain bond system | **YES** | L1↔HyperEVM relay timing, bond expiry races |
| TEMPORAL_PARAMETER_STALENESS | 10 contracts with temporal patterns | **YES** | Challenge windows, fee cooldowns, emergency delays, timelocks |
| CENTRALIZATION_RISK | 7+ privileged roles | **YES** | Single-owner UUPS contracts, adapter owners |
| SHARE_ALLOCATION_FAIRNESS | PPS accounting, NAV, slash distribution | **YES** | Dual-state PPS, fee dilution, MetaVault NAV |
| FORK_ANCESTRY | ERC4626-like | **YES** | Already running (recon) |
| ECONOMIC_DESIGN_AUDIT | Complex fee structures, bond economics | **YES** | Management+performance+protocol fees, bond incentives |
| EXTERNAL_PRECONDITION_AUDIT | 7 external protocol integrations | **YES** | Adapter trust assumptions, non-atomic CoreWriter |
| VERIFICATION_PROTOCOL | Always | **YES** | Standard |
| STORAGE_LAYOUT_SAFETY | UUPS proxy, assembly, __gap | **YES** | Reduced __gap sizes, assembly parsing |

### Injectable Skills

| Skill | Protocol Type Trigger | Required? | Reason |
|-------|----------------------|-----------|--------|
| VAULT_ACCOUNTING | `vault` — KernelVault is ERC4626-like vault | **YES** | Core protocol is a vault system. PPS, share math, deposit/withdraw pricing, fee extraction, strategy snapshot accounting. |
| LENDING_PROTOCOL_SECURITY | `lending` — AaveV3Adapter + MorphoAdapter | **YES** | Two lending protocol integrations. Health factor tracking, liquidation risk, borrow/repay flows, collateral management. |
| DEX_INTEGRATION_SECURITY | `dex_integration` — UniswapV4Adapter (protocol is NOT a DEX) | **YES** | Uniswap V4 swap/LP integration. Slippage protection, MEV, price manipulation via LP. |

### Niche Agents

| Niche Agent | Trigger | Required? | Reason |
|-------------|---------|-----------|--------|
| EVENT_COMPLETENESS | `MISSING_EVENT` — 2 silent setters found (setAccessControl, rescueTokens) | **YES** | Silent admin state changes need detection |
| SIGNATURE_VERIFICATION_AUDIT | `HAS_SIGNATURES` — ecrecover in OracleVerifier, bound signatures, bond attestations | **YES** | Dual-role oracle signatures, EIP-191, EIP-2 malleability, cross-chain attestation binding |
| SEMANTIC_CONSISTENCY_AUDIT | `HAS_MULTI_CONTRACT` — 23 in-scope contracts sharing parameters (BPS_DENOMINATOR, DECIMALS_OFFSET, fee formulas) | **YES** | Multiple contracts share BPS_DENOMINATOR (10000 vs 10_000), DECIMALS_OFFSET (1e3). Fee formula consistency between KernelVault and MetaVault. |
| MULTI_STEP_OPERATION_SAFETY | `MULTI_STEP_OPS` — cross-chain bond lock+execute, approve→deposit | **YES** | lockBondDirect (L1) → executeOptimistic (HyperEVM) is a critical multi-step operation. Bond attestation timing. |
| CALLBACK_RECEIVER_SAFETY | No OUTCOME_CALLBACK flag | NO | No ERC721/1155 callbacks in scope. KernelVault's receive() only accepts ETH for ETH vaults. |
| SPEC_COMPLIANCE_AUDIT | `HAS_DOCS` — CLAUDE.md has detailed binary format spec + architecture | **YES** | Binary format alignment between Rust kernel-core and Solidity KernelOutputParser. Journal = 209 bytes. Little-endian integers. |
| DIMENSIONAL_ANALYSIS | `MIXED_DECIMALS` — 7 contracts with decimal mismatches | **YES** | TON(18d)↔WTON(27d)↔WSTON(27d), CoreWriter 1e6/1e8, Morpho oracle 1e36 scale, PointsProgram decimal normalization, AaveV3 base currency units |
| STABLESWAP_COMPLIANCE | No STABLESWAP_FORK flag | NO | Not a Curve fork |

### Manifest Summary
- **Total Required Standard Templates**: 15
- **Total Required Injectable Skills**: 3 (VAULT_ACCOUNTING, LENDING_PROTOCOL_SECURITY, DEX_INTEGRATION_SECURITY)
- **Total Required Niche Agents**: 6 (EVENT_COMPLETENESS, SIGNATURE_VERIFICATION_AUDIT, SEMANTIC_CONSISTENCY_AUDIT, MULTI_STEP_OPERATION_SAFETY, SPEC_COMPLIANCE_AUDIT, DIMENSIONAL_ANALYSIS)
- **HARD GATE**: Orchestrator MUST spawn agent for each REQUIRED template and niche agent
