//! Monitoring for pending optimistic executions.
//!
//! Polls on-chain state and alerts when executions are at risk of
//! missing their proof deadline (which would result in bond slashing).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Default poll interval for the monitor loop.
pub const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Default warning threshold: alert when deadline is within this duration.
pub const DEFAULT_WARNING_THRESHOLD: Duration = Duration::from_secs(1200); // 20 minutes

/// Configuration for the monitor.
pub struct MonitorConfig {
    pub rpc_url: String,
    pub vault_address: String,
    pub poll_interval: Duration,
    pub warning_threshold: Duration,
}

impl MonitorConfig {
    pub fn new(rpc_url: String, vault_address: String) -> Self {
        Self {
            rpc_url,
            vault_address,
            poll_interval: DEFAULT_POLL_INTERVAL,
            warning_threshold: DEFAULT_WARNING_THRESHOLD,
        }
    }
}

/// Status of a monitored execution.
#[derive(Debug)]
pub struct ExecutionStatus {
    pub nonce: u64,
    /// 0=empty, 1=pending, 2=finalized, 3=slashed
    pub status: u8,
    /// Unix timestamp of the deadline
    pub deadline: u64,
    /// Time remaining until deadline (None if already expired)
    pub time_remaining: Option<Duration>,
    /// True if time_remaining < warning_threshold
    pub at_risk: bool,
}

/// Poll all pending executions in the given nonce range and return their status.
///
/// Queries the vault for each nonce from `start_nonce` to `end_nonce`
/// and returns status for any that are still PENDING (status == 1).
#[cfg(feature = "onchain")]
pub async fn check_pending_executions(
    config: &MonitorConfig,
    start_nonce: u64,
    end_nonce: u64,
) -> Vec<ExecutionStatus> {
    use alloy::primitives::Address;
    use alloy::providers::ProviderBuilder;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IOptimisticKernelVault {
            struct PendingExecution {
                bytes32 journalHash;
                bytes32 actionCommitment;
                uint256 bondAmount;
                uint256 deadline;
                uint8 status;
            }
            function pendingExecutions(uint64 nonce) external view returns (PendingExecution);
        }
    }

    let vault = match Address::from_str(&config.vault_address) {
        Ok(a) => a,
        Err(_) => {
            eprintln!(
                "[monitor] Invalid vault address: {}",
                config.vault_address
            );
            return Vec::new();
        }
    };

    let url: reqwest::Url = match config.rpc_url.parse() {
        Ok(u) => u,
        Err(_) => {
            eprintln!("[monitor] Invalid RPC URL: {}", config.rpc_url);
            return Vec::new();
        }
    };

    let provider = ProviderBuilder::new().on_http(url);
    let contract = IOptimisticKernelVault::new(vault, &provider);

    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut results = Vec::new();

    for nonce in start_nonce..=end_nonce {
        let pending = match contract.pendingExecutions(nonce).call().await {
            Ok(p) => p._0,
            Err(e) => {
                eprintln!(
                    "[monitor] Failed to query nonce {}: {}",
                    nonce, e
                );
                continue;
            }
        };

        // Only report PENDING executions (status == 1)
        if pending.status != 1 {
            continue;
        }

        let deadline_u64: u64 = pending.deadline.try_into().unwrap_or(u64::MAX);
        let time_remaining = if deadline_u64 > now_ts {
            Some(Duration::from_secs(deadline_u64 - now_ts))
        } else {
            None
        };

        let at_risk = match time_remaining {
            Some(remaining) => remaining < config.warning_threshold,
            None => true, // Already expired
        };

        results.push(ExecutionStatus {
            nonce,
            status: pending.status,
            deadline: deadline_u64,
            time_remaining,
            at_risk,
        });
    }

    results
}

/// Stub for when onchain feature is not enabled.
#[cfg(not(feature = "onchain"))]
pub async fn check_pending_executions(
    _config: &MonitorConfig,
    _start_nonce: u64,
    _end_nonce: u64,
) -> Vec<ExecutionStatus> {
    Vec::new()
}

/// Log alerts for at-risk executions.
pub fn log_alerts(statuses: &[ExecutionStatus]) {
    for status in statuses {
        if status.at_risk {
            eprintln!(
                "[ALERT] Execution nonce {} at risk! {} remaining before deadline",
                status.nonce,
                status
                    .time_remaining
                    .map(|d| format!("{}s", d.as_secs()))
                    .unwrap_or_else(|| "EXPIRED".to_string())
            );
        }
    }
}

/// Run the monitor loop (for use in a background thread).
///
/// Polls all pending executions between `first_optimistic_nonce` and
/// `last_known_nonce`, logging alerts for any that are approaching
/// their proof deadline.
///
/// Requires the `onchain` feature for on-chain polling. Without it,
/// the monitor loop simply idles until shutdown.
pub fn run_monitor_loop(
    config: MonitorConfig,
    first_optimistic_nonce: u64,
    last_known_nonce: Arc<AtomicU64>,
    shutdown: Arc<AtomicBool>,
) {
    eprintln!(
        "[monitor] Monitor started (poll={}s, warn_threshold={}s)",
        config.poll_interval.as_secs(),
        config.warning_threshold.as_secs()
    );

    #[cfg(feature = "onchain")]
    {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("[monitor] Failed to create tokio runtime: {}", e);
                return;
            }
        };

        while !shutdown.load(Ordering::Relaxed) {
            let end_nonce = last_known_nonce.load(Ordering::Relaxed);

            if end_nonce >= first_optimistic_nonce {
                let statuses = rt.block_on(check_pending_executions(
                    &config,
                    first_optimistic_nonce,
                    end_nonce,
                ));

                if !statuses.is_empty() {
                    eprintln!(
                        "[monitor] {} pending execution(s) found.",
                        statuses.len()
                    );
                    log_alerts(&statuses);
                }
            }

            // Sleep in small increments to check shutdown flag
            let sleep_end = std::time::Instant::now() + config.poll_interval;
            while std::time::Instant::now() < sleep_end {
                if shutdown.load(Ordering::Relaxed) {
                    break;
                }
                std::thread::sleep(Duration::from_secs(1));
            }
        }
    }

    #[cfg(not(feature = "onchain"))]
    {
        // Suppress unused variable warnings
        let _ = (&config, first_optimistic_nonce, &last_known_nonce);
        eprintln!("[monitor] On-chain feature not enabled. Monitor idle.");
        while !shutdown.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(5));
        }
    }

    eprintln!("[monitor] Monitor thread shutting down.");
}
