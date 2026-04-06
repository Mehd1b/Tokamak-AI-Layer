-- ============================================================================
-- 08_chain_distribution.sql
-- TVL and user distribution across chains (for pie charts)
-- NOTE: This query does NOT use {{chain}} — it queries multiple chains.
-- ============================================================================
-- Event signatures used:
--   KernelVault.Deposit(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.Withdraw(address indexed sender, uint256 amount, uint256 shares)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
-- ============================================================================
-- Usage:
--   Update the UNION ALL blocks below to include each chain where Tokamak
--   contracts are deployed. Each block follows the same pattern.
-- ============================================================================

WITH

-- CTE 1: Collect TVL flows from each chain.
-- Add/remove UNION ALL blocks as chains are added to Tokamak deployment.
-- Each block: sum deposits and subtract withdrawals for known vaults.
chain_flows AS (
    -- === Ethereum ===
    SELECT
        'ethereum' AS chain,
        d.sender AS depositor,
        d.contract_address AS vault_address,
        CAST(d.amount AS DOUBLE) AS net_amount
    FROM ethereum.KernelVault_evt_Deposit d
    INNER JOIN ethereum.VaultFactory_evt_VaultDeployed v
        ON d.contract_address = v.vault
    UNION ALL
    SELECT
        'ethereum' AS chain,
        w.sender AS depositor,
        w.contract_address AS vault_address,
        -CAST(w.amount AS DOUBLE) AS net_amount
    FROM ethereum.KernelVault_evt_Withdraw w
    INNER JOIN ethereum.VaultFactory_evt_VaultDeployed v
        ON w.contract_address = v.vault

    UNION ALL

    -- === Arbitrum ===
    SELECT
        'arbitrum' AS chain,
        d.sender AS depositor,
        d.contract_address AS vault_address,
        CAST(d.amount AS DOUBLE) AS net_amount
    FROM arbitrum.KernelVault_evt_Deposit d
    INNER JOIN arbitrum.VaultFactory_evt_VaultDeployed v
        ON d.contract_address = v.vault
    UNION ALL
    SELECT
        'arbitrum' AS chain,
        w.sender AS depositor,
        w.contract_address AS vault_address,
        -CAST(w.amount AS DOUBLE) AS net_amount
    FROM arbitrum.KernelVault_evt_Withdraw w
    INNER JOIN arbitrum.VaultFactory_evt_VaultDeployed v
        ON w.contract_address = v.vault

    UNION ALL

    -- === Base ===
    SELECT
        'base' AS chain,
        d.sender AS depositor,
        d.contract_address AS vault_address,
        CAST(d.amount AS DOUBLE) AS net_amount
    FROM base.KernelVault_evt_Deposit d
    INNER JOIN base.VaultFactory_evt_VaultDeployed v
        ON d.contract_address = v.vault
    UNION ALL
    SELECT
        'base' AS chain,
        w.sender AS depositor,
        w.contract_address AS vault_address,
        -CAST(w.amount AS DOUBLE) AS net_amount
    FROM base.KernelVault_evt_Withdraw w
    INNER JOIN base.VaultFactory_evt_VaultDeployed v
        ON w.contract_address = v.vault
),

-- CTE 2: Aggregate TVL per chain.
chain_tvl AS (
    SELECT
        chain,
        SUM(net_amount)                 AS total_tvl,
        COUNT(DISTINCT vault_address)   AS vault_count
    FROM chain_flows
    GROUP BY chain
),

-- CTE 3: Count unique depositors per chain.
-- Note: a depositor active on multiple chains is counted once per chain.
chain_users AS (
    SELECT
        chain,
        COUNT(DISTINCT depositor) AS unique_depositors
    FROM chain_flows
    WHERE net_amount > 0    -- only count deposit-side events for user counting
    GROUP BY chain
),

-- CTE 4: Compute totals for percentage calculation.
totals AS (
    SELECT
        SUM(total_tvl)          AS global_tvl,
        SUM(vault_count)        AS global_vaults
    FROM chain_tvl
),

user_totals AS (
    SELECT SUM(unique_depositors) AS global_depositors
    FROM chain_users
)

-- Final output: one row per chain with TVL, vaults, users, and percentages.
-- Ideal for pie chart / donut chart visualization.
SELECT
    ct.chain,
    ct.total_tvl,
    ct.vault_count,
    cu.unique_depositors,
    ROUND(100.0 * ct.total_tvl / NULLIF(t.global_tvl, 0), 2)               AS tvl_pct,
    ROUND(100.0 * cu.unique_depositors / NULLIF(ut.global_depositors, 0), 2) AS user_pct,
    ROUND(100.0 * ct.vault_count / NULLIF(t.global_vaults, 0), 2)           AS vault_pct
FROM chain_tvl ct
LEFT JOIN chain_users cu ON ct.chain = cu.chain
CROSS JOIN totals t
CROSS JOIN user_totals ut
ORDER BY ct.total_tvl DESC
