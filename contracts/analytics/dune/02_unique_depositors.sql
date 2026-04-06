-- ============================================================================
-- 02_unique_depositors.sql
-- Cumulative unique depositors over time, by chain
-- Chain parameter: {{chain}} (e.g., ethereum, arbitrum, base)
-- ============================================================================
-- Event signatures used:
--   KernelVault.Deposit(address indexed sender, uint256 amount, uint256 shares)
--   IVaultFactory.VaultDeployed(address indexed vault, address indexed owner, bytes32 indexed agentId, address asset, bytes32 trustedImageId, bytes32 salt)
-- ============================================================================

WITH

-- CTE 1: Get all deployed vault addresses to scope deposit events
-- to only Tokamak protocol vaults.
deployed_vaults AS (
    SELECT vault AS vault_address
    FROM {{chain}}.VaultFactory_evt_VaultDeployed
),

-- CTE 2: Extract all deposit events, keeping only the depositor address
-- and the timestamp. Filter to only known Tokamak vaults.
all_deposits AS (
    SELECT
        d.evt_block_time,
        d.sender                        AS depositor,
        d.contract_address              AS vault_address
    FROM {{chain}}.KernelVault_evt_Deposit d
    INNER JOIN deployed_vaults v
        ON d.contract_address = v.vault_address
),

-- CTE 3: Find the first deposit date for each unique depositor.
-- This is when they "join" the protocol as a new unique depositor.
first_deposits AS (
    SELECT
        depositor,
        MIN(DATE_TRUNC('day', evt_block_time))  AS first_deposit_day
    FROM all_deposits
    GROUP BY depositor
),

-- CTE 4: Count how many new unique depositors joined each day.
daily_new_depositors AS (
    SELECT
        first_deposit_day               AS day,
        COUNT(DISTINCT depositor)       AS new_depositors
    FROM first_deposits
    GROUP BY first_deposit_day
),

-- CTE 5: Generate a continuous date spine so we don't have gaps.
date_spine AS (
    SELECT day
    FROM UNNEST(
        SEQUENCE(
            (SELECT MIN(first_deposit_day) FROM first_deposits),
            CURRENT_DATE,
            INTERVAL '1' DAY
        )
    ) AS t(day)
)

-- Final output: daily new depositors + running cumulative total.
SELECT
    ds.day,
    COALESCE(dnd.new_depositors, 0)     AS new_depositors,
    SUM(COALESCE(dnd.new_depositors, 0)) OVER (
        ORDER BY ds.day
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )                                   AS cumulative_unique_depositors
FROM date_spine ds
LEFT JOIN daily_new_depositors dnd
    ON ds.day = dnd.day
ORDER BY ds.day DESC
