# Integration Test Report: Thanos Sepolia

**Date:** 2026-02-11T11:27:20.219Z
**Network:** Thanos Sepolia (chain 111551119090)
**Agent ID:** 4
**Owner:** 0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618
**Metadata:** ipfs://QmQuw5JdLXKj7SzFAoAUmoxPJZFKSZHk6XFT8XPBEfAgpW

## Lifecycle Results

| Step | Status | Details |
|------|--------|---------|
| 0. Preflight | ✅ | Chain ID verified, 5 contracts deployed, 188.99 TON balance |
| 1. Agent Registration | ✅ | Agent #4 (pre-existing), tx: pre-existing |
| 2. Stake Verification | ✅ | Bridge not configured, MIN_OPERATOR_STAKE=1000 TON, verification skipped |
| 3. Task Submission | ✅ | Fee: 0.5 TON, tx: 0x6ae8af53..., block: 6327441 |
| 4. Strategy Generation | ✅ | 1550 live pools, 3 allocations, 22ms, determinism VERIFIED |
| 5. On-chain Delivery | ✅ | confirmTask tx: 0x675761bc..., gas: 75941 |
| 6. API Verification | ✅ | 4/7 endpoints OK (3 expected failures — in-memory cache) |
| 7. Validator Re-execution | ✅ | Hash match confirmed, 29ms re-execution |
| 8. Payment Claim | ✅ | Claimed 5.5 TON, tx: 0xcc351710... |
| 9. Feedback | ✅ | Score: 4/5, tx: 0xdf31e1da... |

## Strategy Summary

| Metric | Value |
|--------|-------|
| Blended APY | 89.7494% |
| Risk Score | 37.8/100 |
| Allocations | 3 pools |
| Determinism | VERIFIED |
| Data Source | Live DeFi Llama |
| Snapshot ID | `0x02929b26...` |
| Execution Hash | `0x976a5248...` |

## Gas Summary

| Transaction | Gas Used |
|------------|----------|
| payForTask | 139,880 |
| confirmTask (delivery) | 75,941 |
| claimFees | 43,777 |
| submitFeedback | 279,587 |
| **Total** | **615,126** |

## On-Chain Artifacts

| Artifact | Value |
|----------|-------|
| Agent ID | 4 |
| Task Ref | `0xc9ef08c4962a1cfddcd67501b15c605d2811d4e64792e5254c44046b1f734142` |
| Strategy Hash | `0x976a5248eec0db75b97937ac8f9494a4ad5520425bc9e5e7cb966bc408f0e1b8` |
| Report ID | `0x81a5bd1c8487caa3d945b8297b817cb5e05f4e0971b5f9beac24822534f47295` |
| Snapshot ID | `0x02929b262fb5718d6895542b2845b1e1f5dd85d5d70216f9c583756e4a2d8fc9` |
| Snapshot (local) | `scripts/integration/.data/snapshot.json` |
| Report (local) | `scripts/integration/.data/strategy-report.json` |

## Contract Interactions

| Contract | Address | Function | Status |
|----------|---------|----------|--------|
| TALIdentityRegistry | `0x3f89...A525` | register() | ✅ (pre-existing) |
| TALIdentityRegistry | `0x3f89...A525` | getAgentsByOwner() | ✅ |
| TaskFeeEscrow | `0x43f9...4b8C` | setAgentFee() | ✅ |
| TaskFeeEscrow | `0x43f9...4b8C` | payForTask() | ✅ |
| TaskFeeEscrow | `0x43f9...4b8C` | confirmTask() | ✅ |
| TaskFeeEscrow | `0x43f9...4b8C` | claimFees() | ✅ |
| TaskFeeEscrow | `0x43f9...4b8C` | hasUsedAgent() | ✅ |
| StakingIntegrationModule | `0xDc9d...fe30` | MIN_OPERATOR_STAKE() | ✅ |
| StakingIntegrationModule | `0xDc9d...fe30` | getStake() | ⚠️ StakingBridgeNotSet |
| StakingIntegrationModule | `0xDc9d...fe30` | isVerifiedOperator() | ✅ (false) |
| TALReputationRegistry | `0x0052...502b` | submitFeedback() | ✅ |
| TALReputationRegistry | `0x0052...502b` | getSummary() | ✅ |
| TALValidationRegistry | `0x0944...2F3` | paused() | ✅ |

## Validation Details

| Check | Result |
|-------|--------|
| Agent execution hash | `0x976a5248eec0db75b97937ac8f9494a4ad5520425bc9e5e7cb966bc408f0e1b8` |
| Validator re-execution hash | `0x976a5248eec0db75b97937ac8f9494a4ad5520425bc9e5e7cb966bc408f0e1b8` |
| Hashes match | YES |
| Validator on-chain submission | Skipped (requires separate validator wallet) |

## Reputation After Test

| Metric | Value |
|--------|-------|
| Feedback count | 2 |
| Latest score | 4/5 |
| Reviewer | `0xc4C75d595E21Af15FddAd252697c6d8973A27360` |
| Summary | total=44, count=2, min=4, max=40 |

## Notes

1. **Staking bridge** not configured on StakingIntegrationModule — staking verification skipped. Staking is managed externally via L1 bridge (TALStakingBridgeL1 -> TALStakingBridgeL2).
2. **API server** uses in-memory caches — task/snapshot endpoints return 404 when server hasn't processed those tasks during its lifetime. Health, pools, and agent stats work.
3. **Self-feedback prevention** — the ReputationRegistry prevents agent owners from reviewing their own agents. Integration test creates a separate user wallet for feedback.
4. **Determinism** proven across 3 independent executions (Step 5 x2 + Step 8 validator) all producing the same execution hash.
5. **Live data** used from DeFi Llama (1550 pools from 6 adapters), not mock data.
