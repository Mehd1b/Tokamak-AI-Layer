-- ============================================================================
-- 06_agent_metrics.sql
-- Per-agent: vault count, total TVL, avg vault size, total executions,
-- unique depositors
-- Chain parameter: {{chain}} (e.g., ethereum, arbitrum, base)
-- ============================================================================
-- Event signatures used:
--   IAgentRegistry.AgentRegistered(bytes32 indexed agentId, address indexed author, bytes32 indexed imageId, bytes32 agentCodeHash)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
--   KernelVault.Deposit(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.Withdraw(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.ExecutionApplied(bytes32 indexed agentId, uint64 indexed executionNonce, bytes32 actionCommitment, uint256 actionCount)
-- ============================================================================

WITH

-- CTE 1: All registered agents with their author and registration time.
agents AS (
    SELECT
        agentId         AS agent_id,
        author          AS agent_author,
        evt_block_time  AS registered_at
    FROM {{chain}}.AgentRegistry_evt_AgentRegistered
),

-- CTE 2: All deployed vaults mapped to their agent.
deployed_vaults AS (
    SELECT
        vault           AS vault_address,
        agentId         AS agent_id,
        asset           AS asset_address,
        evt_block_time  AS deploy_time
    FROM {{chain}}.VaultFactory_evt_VaultDeployed
),

-- CTE 3: Vault count per agent.
agent_vault_count AS (
    SELECT
        agent_id,
        COUNT(DISTINCT vault_address) AS vault_count
    FROM deployed_vaults
    GROUP BY agent_id
),

-- CTE 4: TVL per vault = cumulative deposits - cumulative withdrawals.
vault_tvl AS (
    SELECT
        vault_address,
        SUM(net_amount) AS tvl
    FROM (
        SELECT contract_address AS vault_address, CAST(amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Deposit d
        INNER JOIN deployed_vaults v ON d.contract_address = v.vault_address
        UNION ALL
        SELECT contract_address AS vault_address, -CAST(amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Withdraw w
        INNER JOIN deployed_vaults v ON w.contract_address = v.vault_address
    ) flows
    GROUP BY vault_address
),

-- CTE 5: Aggregate TVL by agent (sum across all agent's vaults).
agent_tvl AS (
    SELECT
        v.agent_id,
        SUM(COALESCE(tvl.tvl, 0))                      AS total_tvl,
        AVG(COALESCE(tvl.tvl, 0))                      AS avg_vault_tvl
    FROM deployed_vaults v
    LEFT JOIN vault_tvl tvl ON v.vault_address = tvl.vault_address
    GROUP BY v.agent_id
),

-- CTE 6: Total executions per agent (across all vaults).
agent_executions AS (
    SELECT
        e.agentId                       AS agent_id,
        COUNT(*)                        AS total_executions,
        SUM(CAST(e.actionCount AS BIGINT)) AS total_actions
    FROM {{chain}}.KernelVault_evt_ExecutionApplied e
    INNER JOIN deployed_vaults v ON e.contract_address = v.vault_address
    GROUP BY e.agentId
),

-- CTE 7: Unique depositors per agent (a depositor in any of the agent's vaults).
agent_depositors AS (
    SELECT
        v.agent_id,
        COUNT(DISTINCT d.sender)        AS unique_depositors
    FROM {{chain}}.KernelVault_evt_Deposit d
    INNER JOIN deployed_vaults v ON d.contract_address = v.vault_address
    GROUP BY v.agent_id
)

-- Final output: one row per agent with all metrics.
SELECT
    a.agent_id,
    a.agent_author,
    a.registered_at,
    COALESCE(vc.vault_count, 0)         AS vault_count,
    COALESCE(at.total_tvl, 0)           AS total_tvl,
    COALESCE(at.avg_vault_tvl, 0)       AS avg_vault_size,
    COALESCE(ae.total_executions, 0)    AS total_executions,
    COALESCE(ae.total_actions, 0)       AS total_actions,
    COALESCE(ad.unique_depositors, 0)   AS unique_depositors
FROM agents a
LEFT JOIN agent_vault_count vc  ON a.agent_id = vc.agent_id
LEFT JOIN agent_tvl at          ON a.agent_id = at.agent_id
LEFT JOIN agent_executions ae   ON a.agent_id = ae.agent_id
LEFT JOIN agent_depositors ad   ON a.agent_id = ad.agent_id
ORDER BY total_tvl DESC
