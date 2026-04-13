# Depth Candidates

## Priority Order for Phase 4b

| Priority | Finding ID | Domain Agent | Key Question |
|----------|-----------|-------------|-------------|
| 1 | INV-04 | depth-state-trace | Can Vault B borrow against Vault A collateral? Trace concrete LTV exploit with real Aave parameters |
| 2 | INV-01 | depth-external | With maxOracleAge=24h what is the bond replay window? Does nonce monotonicity fully close it? |
| 3 | INV-34 | depth-external | Trace exact 90-day path: slashExpired emitted - relayer offline - reclaimExpiredBond succeeds. What must be true at each step? |
| 4 | INV-29 | depth-state-trace | Trace instant bondSigner rotation to executeOptimistic drain. What is the economic cost/profit? |
| 5 | INV-31 | depth-state-trace | Trace cycle-pause with 5 pending optimistic executions all expiring. What is aggregate bond loss? |
| 6 | INV-08 | depth-token-flow | With real Aave rates (5-8% APY) how long until interest cap exceeded? What is stranded amount at 1-year mark? |
| 7 | INV-06 | depth-token-flow | ERC20 donation sandwich: DECIMALS_OFFSET=1e3 bounds attacker gain. Model exact numbers. |
| 8 | INV-22 | depth-edge-case | MetaVault settle() front-run: what is precondition reachability? Is mempool observable? What is max NAV delta? |
| 9 | INV-35 | depth-external | If owner proposes rotation at T+6d and pause expires at T+7d what is vulnerable verifier window? What exploits exist? |
| 10 | MIXED_DECIMALS | DIMENSIONAL_ANALYSIS niche | Scan all adapter arithmetic for 1e6 USDC vs 1e18 WSTON vs 1e27 minBond vs 1e36 oracle scale cross-contamination |

## Niche Agent Recommendations

- DIMENSIONAL_ANALYSIS niche: MIXED_DECIMALS flag unresolved - 1e6/1e8/1e18/1e27/1e36 throughout adapters
- SIGNATURE_VERIFICATION_AUDIT niche: HAS_SIGNATURES partially covered; bond attestation EIP-712 domain binding needs verification

## Coverage Gap Action Required

Before spawning depth agents, spawn a breadth re-scan for:
- UniswapV4Adapter.sol
- PendleAdapter.sol
- StakingRouter.sol

These files are 100% unanalyzed and could contain Medium/High findings that depth agents would miss.
