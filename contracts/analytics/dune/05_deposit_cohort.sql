-- ============================================================================
-- 05_deposit_cohort.sql
-- Weekly deposit cohort retention: of users who deposited in week N,
-- what % still have a position in weeks N+1 through N+12
-- Chain parameter: {{chain}} (e.g., ethereum, arbitrum, base)
-- ============================================================================
-- Event signatures used:
--   KernelVault.Deposit(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.Withdraw(address indexed sender, uint256 amount, uint256 shares)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
-- ============================================================================
-- Logic:
--   A user "still has a position" in a given week if their cumulative deposits
--   minus cumulative withdrawals is > 0 at any point during that week.
--   We track this across all vaults (a user is retained if they hold in ANY vault).
-- ============================================================================

WITH

-- CTE 1: Deployed vaults for scoping.
deployed_vaults AS (
    SELECT vault AS vault_address
    FROM {{chain}}.VaultFactory_evt_VaultDeployed
),

-- CTE 2: All deposit and withdrawal flows per user per week.
-- Positive = deposit, negative = withdrawal.
user_weekly_flows AS (
    SELECT
        sender                              AS depositor,
        DATE_TRUNC('week', evt_block_time)  AS week,
        SUM(CAST(amount AS DOUBLE))         AS net_flow
    FROM (
        SELECT sender, evt_block_time, amount
        FROM {{chain}}.KernelVault_evt_Deposit d
        INNER JOIN deployed_vaults v ON d.contract_address = v.vault_address

        UNION ALL

        SELECT sender, evt_block_time, -amount
        FROM {{chain}}.KernelVault_evt_Withdraw w
        INNER JOIN deployed_vaults v ON w.contract_address = v.vault_address
    ) all_flows
    GROUP BY 1, 2
),

-- CTE 3: Running cumulative balance per user per week.
-- If the running sum > 0, the user still has a position.
user_weekly_balance AS (
    SELECT
        depositor,
        week,
        SUM(net_flow) OVER (
            PARTITION BY depositor
            ORDER BY week
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_balance
    FROM user_weekly_flows
),

-- CTE 4: First deposit week = cohort assignment for each user.
user_cohort AS (
    SELECT
        depositor,
        MIN(week) AS cohort_week
    FROM user_weekly_flows
    WHERE net_flow > 0
    GROUP BY depositor
),

-- CTE 5: For each user, determine which weeks they had a positive balance.
-- Join cohort info to compute the "week offset" (0 = cohort week, 1 = week after, etc.)
user_retention AS (
    SELECT
        uc.depositor,
        uc.cohort_week,
        uwb.week                                                        AS activity_week,
        CAST(DATE_DIFF('week', uc.cohort_week, uwb.week) AS BIGINT)    AS week_offset
    FROM user_cohort uc
    INNER JOIN user_weekly_balance uwb
        ON uc.depositor = uwb.depositor
    WHERE uwb.cumulative_balance > 0
      AND DATE_DIFF('week', uc.cohort_week, uwb.week) BETWEEN 0 AND 12
),

-- CTE 6: Count cohort size (total users in each cohort week).
cohort_sizes AS (
    SELECT
        cohort_week,
        COUNT(DISTINCT depositor) AS cohort_size
    FROM user_cohort
    GROUP BY cohort_week
),

-- CTE 7: Count retained users per cohort per week offset.
retention_counts AS (
    SELECT
        cohort_week,
        week_offset,
        COUNT(DISTINCT depositor) AS retained_users
    FROM user_retention
    GROUP BY cohort_week, week_offset
)

-- Final output: cohort retention matrix.
-- Each row = one cohort-week + one offset, showing the retention rate.
SELECT
    cs.cohort_week,
    cs.cohort_size,
    rc.week_offset,
    rc.retained_users,
    ROUND(100.0 * rc.retained_users / cs.cohort_size, 2) AS retention_pct
FROM cohort_sizes cs
INNER JOIN retention_counts rc
    ON cs.cohort_week = rc.cohort_week
ORDER BY cs.cohort_week, rc.week_offset
