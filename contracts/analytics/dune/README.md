# Tokamak AI Layer -- Dune Analytics Dashboard

## Overview

This directory contains DuneSQL (Trino) queries for monitoring the Tokamak AI Layer protocol. Each query is designed as a standalone Dune query that can be composed into a unified dashboard.

## Contract Addresses

Update these addresses per deployment. The queries reference decoded event tables, so you must submit the contracts to Dune for decoding first.

| Contract | Description | Address |
|---|---|---|
| `VaultFactory` | Factory deploying KernelVault and OptimisticKernelVault instances via CREATE2 | _TBD per chain_ |
| `AgentRegistry` | Permissionless registry for agent registration (agentId = keccak256(author, salt)) | _TBD per chain_ |
| `KernelVault` | ERC4626-like vault holding a single ERC20, executing agent actions via RISC Zero proofs | _Multiple instances_ |
| `OptimisticKernelVault` | Extends KernelVault with optimistic execution using cross-chain oracle-attested bonds | _Multiple instances_ |
| `ReferralManager` | Standalone referral system for tracking deposit attributions and awarding points | _TBD per chain_ |

## Event Signatures Reference

These are the on-chain events consumed by the dashboard queries:

### KernelVault
- `Deposit(address indexed sender, uint256 amount, uint256 shares)`
- `Withdraw(address indexed sender, uint256 amount, uint256 shares)`
- `ExecutionApplied(bytes32 indexed agentId, uint64 indexed executionNonce, bytes32 actionCommitment, uint256 actionCount)`
- `ActionExecuted(uint256 indexed actionIndex, uint32 actionType, bytes32 target, bool success)`
- `TransferExecuted(uint256 indexed actionIndex, address indexed token, address indexed to, uint256 amount)`

### VaultFactory (IVaultFactory)
- `VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)`
- `OptimisticVaultDeployed(address indexed vault, bytes32 indexed agentId, address indexed owner, uint256 bondChainId)`

### AgentRegistry (IAgentRegistry)
- `AgentRegistered(bytes32 indexed agentId, address indexed author, bytes32 indexed imageId, bytes32 agentCodeHash)`
- `AgentUpdated(bytes32 indexed agentId, bytes32 indexed newImageId, bytes32 newAgentCodeHash)`
- `AgentUnregistered(bytes32 indexed agentId, address indexed author)`
- `AgentDeprecated(bytes32 indexed agentId, address indexed author)`

### OptimisticKernelVault (IOptimisticKernelVault)
- `OptimisticExecutionSubmitted(uint64 indexed executionNonce, bytes32 journalHash, uint256 bondAmount, uint256 deadline)`
- `ProofSubmitted(uint64 indexed executionNonce, address indexed submitter)`
- `ExecutionSlashed(uint64 indexed executionNonce, address indexed slasher, uint256 bondAmount)`
- `OptimisticConfigUpdated(uint256 challengeWindow, uint256 minBond, uint256 maxPending, bool enabled)`

### ReferralManager
- `CodeRegistered(address indexed referrer, bytes32 indexed codeHash)`
- `ReferralRecorded(address indexed depositor, address indexed referrer, bytes32 indexed codeHash, uint256 points)`

## Query Catalog

### 01 -- TVL Over Time (`01_tvl_over_time.sql`)
**Parameter:** `{{chain}}`

Daily TVL computed as cumulative net deposits minus withdrawals per vault per day. Includes per-vault breakdown and protocol-wide aggregate. Uses a date spine to ensure continuous time series with no gaps.

**Suggested visualization:** Area chart (stacked by vault or single line for protocol TVL).

---

### 02 -- Unique Depositors (`02_unique_depositors.sql`)
**Parameter:** `{{chain}}`

Tracks new unique depositors per day and cumulative unique depositors over time. A depositor is "new" on the day of their first-ever deposit across any Tokamak vault.

**Suggested visualization:** Dual-axis chart -- bar chart for daily new depositors, line for cumulative.

---

### 03 -- Vault Leaderboard (`03_vault_leaderboard.sql`)
**Parameter:** `{{chain}}`

Top 20 vaults ranked by TVL. Includes vault address, agent ID, asset, total depositors, total executions, and 30-day net flow (momentum indicator).

**Suggested visualization:** Table widget with conditional formatting on net_flow_30d (green positive, red negative).

---

### 04 -- Execution Volume (`04_execution_volume.sql`)
**Parameter:** `{{chain}}`

Daily and cumulative execution counts broken down by type: standard (ZK-proved upfront) vs optimistic (bonded, proof submitted later). For optimistic executions, also tracks daily proved vs slashed outcomes.

**Suggested visualization:** Stacked bar chart (standard vs optimistic) with cumulative line overlay.

---

### 05 -- Deposit Cohort Retention (`05_deposit_cohort.sql`)
**Parameter:** `{{chain}}`

Weekly cohort retention analysis. Users are assigned to the week of their first deposit. For each cohort, tracks what percentage still holds a positive balance in weeks 1 through 12 after joining.

**Suggested visualization:** Heatmap table (cohort week on Y axis, week offset on X axis, retention % as cell color).

---

### 06 -- Agent Metrics (`06_agent_metrics.sql`)
**Parameter:** `{{chain}}`

Per-agent aggregated metrics: number of vaults deployed, total TVL across all vaults, average vault size, total execution count, total actions, and unique depositors.

**Suggested visualization:** Table widget, sortable by any column. Optionally a bar chart for top agents by TVL.

---

### 07 -- Referral Funnel (`07_referral_funnel.sql`)
**Parameter:** `{{chain}}`

Referral program analytics. The default query shows a per-referrer leaderboard with referred users, points earned, and TVL attributed to referrals. Commented-out alternatives provide a funnel summary (single-row scorecards) and a daily time series of code creation vs referral recordings.

**Suggested visualization:** Table for leaderboard. Counter widgets for funnel summary. Line chart for daily funnel time series.

---

### 08 -- Chain Distribution (`08_chain_distribution.sql`)
**Parameter:** None (queries multiple chains directly)

Cross-chain breakdown of TVL, vault count, and unique depositors. Shows each chain's share as a percentage of the global total. Update the UNION ALL blocks to add or remove chains.

**Suggested visualization:** Pie chart or donut chart for TVL distribution. Side-by-side pie charts for users and vaults.

---

## Suggested Dashboard Layout

```
+---------------------------------------------------------------+
|  ROW 1: Scorecards                                            |
|  [Protocol TVL] [Unique Depositors] [Total Vaults] [Agents]  |
+---------------------------------------------------------------+
|  ROW 2: TVL Over Time (01) -- full width area chart           |
+---------------------------------------------------------------+
|  ROW 3: Half/Half                                             |
|  [Unique Depositors (02)]    |  [Chain Distribution (08)]     |
|  Line + bar chart            |  Pie chart                     |
+-------------------------------+-------------------------------+
|  ROW 4: Vault Leaderboard (03) -- full width table            |
+---------------------------------------------------------------+
|  ROW 5: Half/Half                                             |
|  [Execution Volume (04)]     |  [Agent Metrics (06)]          |
|  Stacked bar chart           |  Table                         |
+-------------------------------+-------------------------------+
|  ROW 6: Deposit Cohort Retention (05) -- full width heatmap   |
+---------------------------------------------------------------+
|  ROW 7: Referral Funnel (07) -- full width table              |
+---------------------------------------------------------------+
```

## Setup Instructions

1. **Submit contracts to Dune** -- Use "My Creations > Contracts" to submit each contract address per chain. Dune will decode the ABI and create event tables automatically.

2. **Create queries** -- Copy each `.sql` file into a new Dune query. Set the `chain` parameter type to "dropdown" with values matching your deployment chains (e.g., `ethereum`, `arbitrum`, `base`).

3. **Build dashboard** -- Create a new dashboard and add each query as a widget using the layout above.

4. **Adjust for token decimals** -- The raw `amount` values in deposit/withdraw events are in the token's smallest unit. Divide by `10^decimals` (e.g., `/ 1e6` for USDC, `/ 1e18` for WETH) to show human-readable values. You may want to join with `tokens.erc20` for automatic decimal handling.

## Notes

- All queries scope events to vaults deployed by the VaultFactory to avoid counting unrelated contracts that may emit identically-named events.
- The `{{chain}}` parameter follows Dune's standard naming convention and maps to the blockchain schema (e.g., `ethereum`, `arbitrum`, `base`).
- Query 08 (chain distribution) does not use `{{chain}}` because it aggregates across all chains. Update the UNION ALL blocks when new chains are added.
- TVL calculations use deposit/withdraw flow sums. For vaults with active strategies (funds sent out via CALL actions), the on-chain `totalAssets()` read may differ from the flow-based calculation. The flow-based approach is used here because Dune event tables are more reliable for historical time series than point-in-time contract reads.
