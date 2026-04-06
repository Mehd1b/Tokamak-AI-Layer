-- ============================================================================
-- 04_execution_volume.sql
-- Daily and cumulative execution count with optimistic vs standard breakdown
-- Chain parameter: {{chain}} (e.g., ethereum, arbitrum, base)
-- ============================================================================
-- Event signatures used:
--   KernelVault.ExecutionApplied(bytes32 indexed agentId, uint64 indexed executionNonce, bytes32 actionCommitment, uint256 actionCount)
--   IOptimisticKernelVault.OptimisticExecutionSubmitted(uint64 indexed executionNonce, bytes32 journalHash, uint256 bondAmount, uint256 deadline)
--   IOptimisticKernelVault.ProofSubmitted(uint64 indexed executionNonce, address indexed submitter)
--   IOptimisticKernelVault.ExecutionSlashed(uint64 indexed executionNonce, address indexed slasher, uint256 bondAmount)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
-- ============================================================================

WITH

-- CTE 1: Deployed vaults for scoping events.
deployed_vaults AS (
    SELECT vault AS vault_address
    FROM {{chain}}.VaultFactory_evt_VaultDeployed
),

-- CTE 2: All standard (proof-verified) executions.
-- These are ExecutionApplied events that do NOT have a corresponding
-- OptimisticExecutionSubmitted event at the same vault + nonce.
all_executions AS (
    SELECT
        e.evt_block_time,
        e.contract_address                  AS vault_address,
        e.executionNonce                    AS execution_nonce,
        e.agentId                           AS agent_id,
        CAST(e.actionCount AS BIGINT)       AS action_count
    FROM {{chain}}.KernelVault_evt_ExecutionApplied e
    INNER JOIN deployed_vaults v ON e.contract_address = v.vault_address
),

-- CTE 3: Optimistic executions (submitted without upfront proof).
-- These are tracked separately via OptimisticExecutionSubmitted.
optimistic_executions AS (
    SELECT
        o.evt_block_time,
        o.contract_address                  AS vault_address,
        o.executionNonce                    AS execution_nonce,
        CAST(o.bondAmount AS DOUBLE)        AS bond_amount
    FROM {{chain}}.OptimisticKernelVault_evt_OptimisticExecutionSubmitted o
    INNER JOIN deployed_vaults v ON o.contract_address = v.vault_address
),

-- CTE 4: Tag each execution as 'optimistic' or 'standard'.
-- If there is a matching OptimisticExecutionSubmitted event for the same
-- vault and nonce, it is optimistic; otherwise standard (ZK-proved).
tagged_executions AS (
    SELECT
        ae.evt_block_time,
        ae.vault_address,
        ae.execution_nonce,
        ae.agent_id,
        ae.action_count,
        CASE WHEN oe.execution_nonce IS NOT NULL THEN 'optimistic' ELSE 'standard' END AS execution_type
    FROM all_executions ae
    LEFT JOIN optimistic_executions oe
        ON ae.vault_address = oe.vault_address
        AND ae.execution_nonce = oe.execution_nonce
),

-- CTE 5: Daily execution counts broken down by type.
daily_executions AS (
    SELECT
        DATE_TRUNC('day', evt_block_time)   AS day,
        execution_type,
        COUNT(*)                            AS execution_count,
        SUM(action_count)                   AS total_actions
    FROM tagged_executions
    GROUP BY 1, 2
),

-- CTE 6: Optimistic execution outcomes: how many were proved vs slashed.
optimistic_outcomes AS (
    SELECT
        DATE_TRUNC('day', p.evt_block_time) AS day,
        'proved' AS outcome,
        COUNT(*) AS count
    FROM {{chain}}.OptimisticKernelVault_evt_ProofSubmitted p
    INNER JOIN deployed_vaults v ON p.contract_address = v.vault_address
    GROUP BY 1

    UNION ALL

    SELECT
        DATE_TRUNC('day', s.evt_block_time) AS day,
        'slashed' AS outcome,
        COUNT(*) AS count
    FROM {{chain}}.OptimisticKernelVault_evt_ExecutionSlashed s
    INNER JOIN deployed_vaults v ON s.contract_address = v.vault_address
    GROUP BY 1
)

-- Final output: daily execution breakdown with cumulative totals.
SELECT
    de.day,
    de.execution_type,
    de.execution_count                                          AS daily_executions,
    de.total_actions                                            AS daily_actions,
    SUM(de.execution_count) OVER (
        PARTITION BY de.execution_type
        ORDER BY de.day
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )                                                           AS cumulative_executions,
    -- Optimistic outcome counts (only meaningful for optimistic rows)
    COALESCE(proved.count, 0)                                   AS daily_proved,
    COALESCE(slashed.count, 0)                                  AS daily_slashed
FROM daily_executions de
LEFT JOIN optimistic_outcomes proved
    ON de.day = proved.day AND proved.outcome = 'proved' AND de.execution_type = 'optimistic'
LEFT JOIN optimistic_outcomes slashed
    ON de.day = slashed.day AND slashed.outcome = 'slashed' AND de.execution_type = 'optimistic'
ORDER BY de.day DESC, de.execution_type
