-- ============================================================================
-- 01_tvl_over_time.sql
-- Daily TVL: sum of net deposits minus withdrawals per vault per day
-- Chain parameter: {{chain}} (e.g., ethereum, arbitrum, base)
-- ============================================================================
-- Event signatures used:
--   KernelVault.Deposit(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.Withdraw(address indexed sender, uint256 amount, uint256 shares)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
-- ============================================================================

WITH

-- CTE 1: Get all deployed vault addresses so we can scope deposit/withdraw events
-- to only Tokamak vaults (not random contracts emitting same event sigs).
deployed_vaults AS (
    SELECT
        evt_block_time,
        vault                           AS vault_address,
        agentId                         AS agent_id,
        asset                           AS asset_address
    FROM {{chain}}.VaultFactory_evt_VaultDeployed
),

-- CTE 2: All deposit events from deployed vaults.
-- Each deposit increases the vault's TVL by `amount` of the underlying asset.
deposits AS (
    SELECT
        d.evt_block_time,
        d.contract_address              AS vault_address,
        CAST(d.amount AS DOUBLE)        AS amount
    FROM {{chain}}.KernelVault_evt_Deposit d
    INNER JOIN deployed_vaults v
        ON d.contract_address = v.vault_address
),

-- CTE 3: All withdraw events from deployed vaults.
-- Each withdrawal decreases the vault's TVL by `amount`.
withdrawals AS (
    SELECT
        w.evt_block_time,
        w.contract_address              AS vault_address,
        CAST(w.amount AS DOUBLE)        AS amount
    FROM {{chain}}.KernelVault_evt_Withdraw w
    INNER JOIN deployed_vaults v
        ON w.contract_address = v.vault_address
),

-- CTE 4: Combine deposits (+) and withdrawals (-) into a single net flow stream,
-- bucketed by day and vault.
daily_flows AS (
    SELECT
        DATE_TRUNC('day', evt_block_time)   AS day,
        vault_address,
        SUM(amount)                         AS net_flow
    FROM (
        SELECT evt_block_time, vault_address, amount FROM deposits
        UNION ALL
        SELECT evt_block_time, vault_address, -amount FROM withdrawals
    ) combined
    GROUP BY 1, 2
),

-- CTE 5: Generate a continuous date spine from the first vault deployment to today.
-- This ensures every day appears even if there were no deposits/withdrawals.
date_spine AS (
    SELECT day
    FROM UNNEST(
        SEQUENCE(
            (SELECT MIN(DATE_TRUNC('day', evt_block_time)) FROM deployed_vaults),
            CURRENT_DATE,
            INTERVAL '1' DAY
        )
    ) AS t(day)
),

-- CTE 6: Cross-join vaults with date spine, then left-join daily flows.
-- Compute cumulative TVL per vault using a running sum of daily net flows.
vault_daily_tvl AS (
    SELECT
        ds.day,
        v.vault_address,
        v.agent_id,
        v.asset_address,
        COALESCE(df.net_flow, 0)                                        AS daily_net_flow,
        SUM(COALESCE(df.net_flow, 0)) OVER (
            PARTITION BY v.vault_address
            ORDER BY ds.day
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )                                                               AS cumulative_tvl
    FROM date_spine ds
    CROSS JOIN (SELECT DISTINCT vault_address, agent_id, asset_address FROM deployed_vaults) v
    LEFT JOIN daily_flows df
        ON df.day = ds.day
        AND df.vault_address = v.vault_address
    WHERE ds.day >= DATE_TRUNC('day', (
        SELECT MIN(evt_block_time)
        FROM deployed_vaults dv2
        WHERE dv2.vault_address = v.vault_address
    ))
)

-- Final output: daily total TVL across all vaults, plus per-vault breakdown.
SELECT
    day,
    vault_address,
    agent_id,
    asset_address,
    daily_net_flow,
    cumulative_tvl,
    -- Protocol-wide TVL: sum across all vaults for this day
    SUM(cumulative_tvl) OVER (PARTITION BY day)     AS protocol_tvl
FROM vault_daily_tvl
ORDER BY day DESC, cumulative_tvl DESC
