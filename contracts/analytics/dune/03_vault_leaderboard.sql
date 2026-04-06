-- ============================================================================
-- 03_vault_leaderboard.sql
-- Top 20 vaults by TVL with: vault address, agent ID, TVL, total depositors,
-- total executions, 30d net flow
-- Chain parameter: {{chain}} (e.g., ethereum, arbitrum, base)
-- ============================================================================
-- Event signatures used:
--   KernelVault.Deposit(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.Withdraw(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.ExecutionApplied(bytes32 indexed agentId, uint64 indexed executionNonce, bytes32 actionCommitment, uint256 actionCount)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
-- ============================================================================

WITH

-- CTE 1: All deployed vaults with their metadata.
deployed_vaults AS (
    SELECT
        vault           AS vault_address,
        owner           AS vault_owner,
        agentId         AS agent_id,
        asset           AS asset_address,
        evt_block_time  AS deploy_time
    FROM {{chain}}.VaultFactory_evt_VaultDeployed
),

-- CTE 2: All-time TVL per vault = sum(deposits) - sum(withdrawals).
-- This gives the current net asset position based on flow events.
vault_tvl AS (
    SELECT
        vault_address,
        SUM(net_amount) AS tvl
    FROM (
        SELECT contract_address AS vault_address, CAST(amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Deposit
        UNION ALL
        SELECT contract_address AS vault_address, -CAST(amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Withdraw
    ) flows
    INNER JOIN deployed_vaults v ON flows.vault_address = v.vault_address
    GROUP BY vault_address
),

-- CTE 3: 30-day net flow per vault.
-- Measures recent momentum: positive = net inflows, negative = net outflows.
vault_30d_flow AS (
    SELECT
        vault_address,
        SUM(net_amount) AS net_flow_30d
    FROM (
        SELECT contract_address AS vault_address, CAST(amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Deposit
        WHERE evt_block_time >= NOW() - INTERVAL '30' DAY
        UNION ALL
        SELECT contract_address AS vault_address, -CAST(amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Withdraw
        WHERE evt_block_time >= NOW() - INTERVAL '30' DAY
    ) recent_flows
    INNER JOIN deployed_vaults v ON recent_flows.vault_address = v.vault_address
    GROUP BY vault_address
),

-- CTE 4: Count of unique depositors per vault (all-time).
vault_depositors AS (
    SELECT
        d.contract_address              AS vault_address,
        COUNT(DISTINCT d.sender)        AS total_depositors
    FROM {{chain}}.KernelVault_evt_Deposit d
    INNER JOIN deployed_vaults v ON d.contract_address = v.vault_address
    GROUP BY d.contract_address
),

-- CTE 5: Count of executions per vault (all-time).
-- ExecutionApplied is emitted by the vault contract itself.
vault_executions AS (
    SELECT
        e.contract_address              AS vault_address,
        COUNT(*)                        AS total_executions
    FROM {{chain}}.KernelVault_evt_ExecutionApplied e
    INNER JOIN deployed_vaults v ON e.contract_address = v.vault_address
    GROUP BY e.contract_address
)

-- Final output: Top 20 vaults ranked by TVL, with all metrics.
SELECT
    v.vault_address,
    v.vault_owner,
    v.agent_id,
    v.asset_address,
    v.deploy_time,
    COALESCE(tvl.tvl, 0)                    AS tvl,
    COALESCE(dep.total_depositors, 0)       AS total_depositors,
    COALESCE(ex.total_executions, 0)        AS total_executions,
    COALESCE(f30.net_flow_30d, 0)           AS net_flow_30d
FROM deployed_vaults v
LEFT JOIN vault_tvl tvl         ON v.vault_address = tvl.vault_address
LEFT JOIN vault_depositors dep  ON v.vault_address = dep.vault_address
LEFT JOIN vault_executions ex   ON v.vault_address = ex.vault_address
LEFT JOIN vault_30d_flow f30    ON v.vault_address = f30.vault_address
ORDER BY tvl DESC
LIMIT 20
