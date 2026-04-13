# Analysis: Oracle Analysis

**Agent**: Analysis Agent #1
**Scope**: OracleVerifier library, dual-role oracle system, adapter oracle dependencies
**Skill Applied**: ORACLE_ANALYSIS

---

## Finding [OA-1]: Bond Attestation Reuses Role A maxOracleAge for Staleness

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✓, R8:✓, R10:✓]
**Severity**: Low
**Location**: OptimisticKernelVault.sol:L250, KernelVault.sol:L232
**Description**: The C-02 fix correctly separated signer keys (Role A vs Role B) but both use the single `maxOracleAge` for staleness. Price feeds and bond attestations have fundamentally different freshness needs. A tight price staleness may reject valid bond attestations during L1 relay latency; a loose setting extends the bond replay window.
**Impact**: Inability to independently tune staleness for two fundamentally different oracle roles. May cause valid bond attestations to be rejected or create excessive replay windows.

**Evidence**:
```solidity
// Both oracle and bond verification use the same maxOracleAge
if (block.timestamp > oracleTimestamp + maxOracleAge) {
    revert OracleTimestampTooOld();
}
```

---

## Finding [OA-2]: abi.encodePacked with String Prefix — No Collision Risk

**Verdict**: REFUTED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity)]
**Severity**: Informational
**Location**: OracleVerifier.sol
**Description**: The `abi.encodePacked` usage includes fixed-length prefixes ("BOND_LOCK_V1", "PRICE_FEED_V1") that prevent collision between different message types. Standard safe usage pattern.
**Impact**: None — correctly implemented.

---

## Finding [OA-3]: MorphoAdapter Health Check Does Not Verify Oracle Freshness

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3 | ✗4(N/A)
**Rules Applied**: [R4:✓, R5:✗(single entity), R8:✓, R10:✓, R16:✓]
**Severity**: Low
**Location**: MorphoAdapter.sol:L726-728
**Description**: The `IMorphoOracle.price()` call has no staleness check — it returns a spot value with no timestamp. If the underlying Chainlink feed freezes, the adapter uses the stale price. Impact is bounded because Morpho's own liquidation logic operates independently (the adapter's health check is an 80%-of-LLTV safety margin).
**Impact**: Stale oracle price used in adapter health check during Chainlink feed freeze. Bounded by Morpho's independent liquidation.

**Evidence**:
```solidity
// MorphoAdapter.sol L726-728 - no staleness check on oracle
uint256 collateralPrice = IMorphoOracle(oracle).price();
// price() returns raw value with no timestamp
```

---

## Finding [OA-4]: MorphoAdapter Hardcodes ORACLE_PRICE_SCALE = 1e36

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✓, R5:✗(single entity), R16:✓]
**Severity**: Informational
**Location**: MorphoAdapter.sol:L702
**Description**: The `1e36` constant is correct for standard Morpho oracles (MorphoChainlinkOracleV2 normalizes internally). For non-standard oracles that follow the raw formula `10^(36+loanDec-collDec)`, the health check would miscalculate. The whitelisting process does not validate oracle price scale compatibility.
**Impact**: Incorrect health check for non-standard Morpho oracle implementations. Low probability due to whitelisting.

---

## Finding [OA-5]: AaveV3Adapter Health Check Uses Aggregate Adapter Position, Not Per-Vault

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✓, R5:✓, R6:✗(no role), R8:✓, R10:✓, R16:✓]
**Severity**: Medium
**Location**: AaveV3Adapter.sol:L574-592
**Description**: The M-08 fix changed `_checkVaultHealth` to delegate to Aave's `getUserAccountData(address(this))`. Since the adapter is a singleton holding ALL vaults' positions in one Aave account, the health factor is the AGGREGATE of all vaults — not per-vault. The `vault` parameter in the function signature is explicitly unused (`/* vault */`).
**Impact**: Cross-vault collateral subsidy. Vault B can borrow excessively by relying on Vault A's collateral to inflate the aggregate HF. If Vault A exits, the aggregate HF drops and the entire adapter risks Aave liquidation affecting all vaults.

**Evidence**:
```solidity
function _checkVaultHealth(address /* vault */) internal view {
    (,,,,, uint256 aaveHealthFactor) = pool.getUserAccountData(address(this));
    // This is the ADAPTER's aggregate HF, not per-vault
    if (aaveHealthFactor == type(uint256).max) return;
    if (aaveHealthFactor < minHealthFactor) {
        revert HealthFactorTooLow(aaveHealthFactor, minHealthFactor);
    }
}
```

### Postcondition Analysis
**Postconditions Created**: Cross-vault collateral dependency on shared Aave account
**Postcondition Types**: [STATE, BALANCE]
**Who Benefits**: A vault that wants to borrow more than its own collateral supports

---

## Finding [OA-6]: Morpho Oracle price() Revert Blocks Borrow/WithdrawCollateral

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✗(evidence clear), R16:✓]
**Severity**: Informational
**Location**: MorphoAdapter.sol:L726-740
**Description**: If `IMorphoOracle.price()` reverts (oracle down, feed decommissioned), the health check reverts, blocking `borrow()` and `withdrawCollateral()`. The `withdrawToVault` emergency path also calls the health check, but has a try/catch around the Morpho interactions.
**Impact**: Temporary DoS on borrow/withdrawCollateral operations. Emergency withdrawal path remains available.

---

## Finding [OA-7]: maxOracleAge=0 Cannot Disable Bond Staleness — Invariant Chain Protects

**Verdict**: REFUTED
**Step Execution**: ✓1,2,3,5
**Rules Applied**: [R4:✗(evidence clear)]
**Severity**: Informational
**Location**: KernelVault.sol, OptimisticKernelVault.sol
**Description**: `setOptimisticEnabled(true)` requires `oracleSigner != address(0)` (L402), and `setOracleSigner` with non-zero signer requires `_maxAge != 0` (L584). Therefore `maxOracleAge > 0` is guaranteed whenever optimistic mode is active. The `maxAge == 0` skip in OracleVerifier is unreachable for bond attestations.
**Impact**: None — correctly protected by invariant chain.

---

## Chain Summary

| Finding ID | Severity | Verdict | Chain Input? | Chain Output? |
|-----------|----------|---------|-------------|---------------|
| OA-1 | Low | PARTIAL | YES — couples with cross-chain timing | Staleness mismatch postcondition |
| OA-2 | Informational | REFUTED | NO | N/A |
| OA-3 | Low | PARTIAL | YES — combines with Morpho health check | Stale price postcondition |
| OA-4 | Informational | PARTIAL | NO — whitelisting mitigates | N/A |
| OA-5 | Medium | CONFIRMED | YES — cross-vault collateral subsidy | Aggregate HF collapse postcondition |
| OA-6 | Informational | CONFIRMED | NO — DoS only | N/A |
| OA-7 | Informational | REFUTED | NO | N/A |

## Methodology Notes
- Oracle inventory: 4 oracle types identified (Role A price, Role B bond, Aave HF, Morpho price)
- No TWAP oracles in scope
- No Chainlink direct consumption
- OracleVerifier library well-constructed: EIP-2 malleability protection, future timestamp guard, domain binding, action commitment binding
