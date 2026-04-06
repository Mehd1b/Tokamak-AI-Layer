-- ============================================================================
-- 07_referral_funnel.sql
-- Referral funnel: codes created, referrals registered, referred deposits,
-- referral-attributed TVL
-- Chain parameter: {{chain}} (e.g., ethereum, arbitrum, base)
-- ============================================================================
-- Event signatures used:
--   ReferralManager.CodeRegistered(address indexed referrer, bytes32 indexed codeHash)
--   ReferralManager.ReferralRecorded(address indexed depositor, address indexed referrer, bytes32 indexed codeHash, uint256 points)
--   KernelVault.Deposit(address indexed sender, uint256 amount, uint256 shares)
--   KernelVault.Withdraw(address indexed sender, uint256 amount, uint256 shares)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
-- ============================================================================

WITH

-- CTE 1: Deployed vaults for scoping deposit events.
deployed_vaults AS (
    SELECT vault AS vault_address
    FROM {{chain}}.VaultFactory_evt_VaultDeployed
),

-- CTE 2: All referral codes created over time.
-- Each CodeRegistered event = one new referral code.
codes_created AS (
    SELECT
        evt_block_time,
        referrer,
        codeHash                        AS code_hash
    FROM {{chain}}.ReferralManager_evt_CodeRegistered
),

-- CTE 3: All referral recordings.
-- Each ReferralRecorded event = one depositor was attributed to a referrer.
referrals_recorded AS (
    SELECT
        evt_block_time,
        depositor,
        referrer,
        codeHash                        AS code_hash,
        CAST(points AS BIGINT)          AS points_awarded
    FROM {{chain}}.ReferralManager_evt_ReferralRecorded
),

-- CTE 4: Net TVL per referred depositor.
-- For each referred depositor, calculate their total deposits minus withdrawals
-- across all Tokamak vaults. This is the "referral-attributed TVL".
referred_depositor_tvl AS (
    SELECT
        depositor,
        SUM(net_amount) AS depositor_tvl
    FROM (
        SELECT d.sender AS depositor, CAST(d.amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Deposit d
        INNER JOIN deployed_vaults v ON d.contract_address = v.vault_address
        INNER JOIN referrals_recorded rr ON d.sender = rr.depositor

        UNION ALL

        SELECT w.sender AS depositor, -CAST(w.amount AS DOUBLE) AS net_amount
        FROM {{chain}}.KernelVault_evt_Withdraw w
        INNER JOIN deployed_vaults v ON w.contract_address = v.vault_address
        INNER JOIN referrals_recorded rr ON w.sender = rr.depositor
    ) ref_flows
    GROUP BY depositor
),

-- CTE 5: Aggregate metrics per referrer.
referrer_metrics AS (
    SELECT
        rr.referrer,
        COUNT(DISTINCT rr.depositor)                AS referred_users,
        SUM(rr.points_awarded)                      AS total_points,
        COALESCE(SUM(dt.depositor_tvl), 0)          AS attributed_tvl
    FROM referrals_recorded rr
    LEFT JOIN referred_depositor_tvl dt ON rr.depositor = dt.depositor
    GROUP BY rr.referrer
),

-- CTE 6: Daily funnel metrics for time-series visualization.
daily_funnel AS (
    SELECT
        day,
        SUM(codes) AS daily_codes_created,
        SUM(referrals) AS daily_referrals_recorded
    FROM (
        SELECT DATE_TRUNC('day', evt_block_time) AS day, 1 AS codes, 0 AS referrals
        FROM codes_created
        UNION ALL
        SELECT DATE_TRUNC('day', evt_block_time) AS day, 0 AS codes, 1 AS referrals
        FROM referrals_recorded
    ) events
    GROUP BY day
)

-- Final output part 1: Overall funnel summary (single row).
-- Uncomment the query you need on Dune.

-- === FUNNEL SUMMARY (use as a counter/scorecard widget) ===
-- SELECT
--     (SELECT COUNT(*) FROM codes_created)         AS total_codes_created,
--     (SELECT COUNT(*) FROM referrals_recorded)     AS total_referrals_recorded,
--     (SELECT COUNT(DISTINCT depositor) FROM referrals_recorded) AS unique_referred_depositors,
--     (SELECT COALESCE(SUM(depositor_tvl), 0) FROM referred_depositor_tvl) AS total_referred_tvl

-- === PER-REFERRER LEADERBOARD ===
SELECT
    rm.referrer,
    cc.code_hash,
    rm.referred_users,
    rm.total_points,
    rm.attributed_tvl
FROM referrer_metrics rm
LEFT JOIN codes_created cc ON rm.referrer = cc.referrer
ORDER BY rm.attributed_tvl DESC
LIMIT 50

-- === DAILY FUNNEL TIME SERIES (uncomment to use) ===
-- SELECT
--     day,
--     daily_codes_created,
--     daily_referrals_recorded,
--     SUM(daily_codes_created) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_codes,
--     SUM(daily_referrals_recorded) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_referrals
-- FROM daily_funnel
-- ORDER BY day DESC
