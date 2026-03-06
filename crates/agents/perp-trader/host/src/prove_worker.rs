//! Background proving worker for optimistic execution.
//!
//! Runs in a separate thread, dequeuing proof jobs and submitting
//! proofs on-chain as they complete. Monitors deadlines and alerts
//! when proofs are at risk of timing out.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Expected proving time for Groth16 proofs (used for deadline warnings).
const EXPECTED_PROVING_TIME: Duration = Duration::from_secs(600); // 10 minutes

/// Sleep duration when the proof queue is empty.
const IDLE_SLEEP: Duration = Duration::from_secs(5);

/// Maximum number of retries for a failed proof job.
const MAX_RETRIES: u32 = 1;

/// A pending proof job queued for the background worker.
#[derive(Debug, Clone)]
pub struct PendingProof {
    /// Execution nonce on-chain
    pub execution_nonce: u64,
    /// Raw input bytes for the prover
    pub input_bytes: Vec<u8>,
    /// Path to the agent-pack bundle directory
    pub bundle_path: String,
    /// RPC URL for proof submission
    pub rpc_url: String,
    /// Vault address for proof submission
    pub vault_address: String,
    /// Private key for proof submission
    pub private_key: String,
    /// Deadline instant (queued_at + challenge_window)
    pub deadline: Instant,
    /// When the job was queued
    pub queued_at: Instant,
    /// Use dev-mode proving (fast, not on-chain verifiable)
    pub dev_mode: bool,
    /// Number of retry attempts so far
    pub retry_count: u32,
}

/// Shared proof queue between main thread and worker.
pub type ProofQueue = Arc<Mutex<VecDeque<PendingProof>>>;

/// Create a new shared proof queue.
pub fn new_proof_queue() -> ProofQueue {
    Arc::new(Mutex::new(VecDeque::new()))
}

/// Status of the proving worker (exposed for monitoring).
pub struct WorkerStatus {
    pub jobs_completed: AtomicU64,
    pub jobs_failed: AtomicU64,
    /// Execution nonce currently being proved (0 = idle).
    pub currently_proving: AtomicU64,
}

impl WorkerStatus {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            jobs_completed: AtomicU64::new(0),
            jobs_failed: AtomicU64::new(0),
            currently_proving: AtomicU64::new(0),
        })
    }
}

/// Start the background proving worker.
///
/// This function runs in a loop, dequeuing proof jobs and processing them.
/// It should be spawned in a separate thread via `std::thread::spawn`.
///
/// The worker:
/// 1. Dequeues the next PendingProof from the queue
/// 2. Checks if deadline is approaching (warns if < 2x expected proving time)
/// 3. Generates Groth16 proof using risc0
/// 4. Submits proof on-chain via vault.submitProof()
/// 5. Logs success/failure
/// 6. Sleeps briefly if queue is empty
pub fn run_proving_worker(
    queue: ProofQueue,
    shutdown: Arc<AtomicBool>,
    status: Arc<WorkerStatus>,
) {
    eprintln!("[prove-worker] Worker thread started.");

    while !shutdown.load(Ordering::Relaxed) {
        // Try to dequeue a job
        let job = {
            let mut q = match queue.lock() {
                Ok(q) => q,
                Err(poisoned) => {
                    eprintln!("[prove-worker] Queue mutex poisoned, recovering.");
                    poisoned.into_inner()
                }
            };
            q.pop_front()
        };

        let job = match job {
            Some(j) => j,
            None => {
                // Queue empty -- sleep and retry
                std::thread::sleep(IDLE_SLEEP);
                continue;
            }
        };

        // Process the job, catching panics to keep the worker alive
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            process_proof_job(&job, &status)
        }));

        match result {
            Ok(Ok(())) => {
                status.jobs_completed.fetch_add(1, Ordering::Relaxed);
                status.currently_proving.store(0, Ordering::Relaxed);
            }
            Ok(Err(e)) => {
                eprintln!(
                    "[prove-worker] Job failed for nonce {}: {}",
                    job.execution_nonce, e
                );
                status.currently_proving.store(0, Ordering::Relaxed);

                // Retry logic: re-enqueue if under retry limit
                if job.retry_count < MAX_RETRIES {
                    let mut retry_job = job.clone();
                    retry_job.retry_count += 1;
                    eprintln!(
                        "[prove-worker] Re-queuing nonce {} (retry {}/{})",
                        retry_job.execution_nonce, retry_job.retry_count, MAX_RETRIES
                    );
                    if let Ok(mut q) = queue.lock() {
                        q.push_back(retry_job);
                    }
                } else {
                    eprintln!(
                        "[prove-worker] Nonce {} exceeded max retries ({}). Giving up.",
                        job.execution_nonce, MAX_RETRIES
                    );
                    status.jobs_failed.fetch_add(1, Ordering::Relaxed);
                }
            }
            Err(_panic) => {
                eprintln!(
                    "[prove-worker] PANIC while proving nonce {}! Worker continues.",
                    job.execution_nonce
                );
                status.jobs_failed.fetch_add(1, Ordering::Relaxed);
                status.currently_proving.store(0, Ordering::Relaxed);
            }
        }
    }

    eprintln!("[prove-worker] Worker thread shutting down.");
}

/// Process a single proof job: generate proof and submit on-chain.
fn process_proof_job(job: &PendingProof, status: &WorkerStatus) -> anyhow::Result<()> {
    let nonce = job.execution_nonce;
    status.currently_proving.store(nonce, Ordering::Relaxed);

    // Check deadline proximity
    let now = Instant::now();
    if now >= job.deadline {
        return Err(anyhow::anyhow!(
            "Deadline already passed for nonce {}! Skipping proof.",
            nonce
        ));
    }
    let remaining = job.deadline - now;
    if remaining < EXPECTED_PROVING_TIME * 2 {
        eprintln!(
            "[prove-worker] WARNING: Nonce {} has only {}s remaining (need ~{}s for proving).",
            nonce,
            remaining.as_secs(),
            EXPECTED_PROVING_TIME.as_secs()
        );
    }

    eprintln!(
        "[prove-worker] Starting proof for nonce {} ({}s until deadline, retry={})...",
        nonce,
        remaining.as_secs(),
        job.retry_count
    );

    let prove_start = Instant::now();

    // Load bundle and generate proof
    let bundle = reference_integrator::LoadedBundle::load(&job.bundle_path)
        .map_err(|e| anyhow::anyhow!("Failed to load bundle: {}", e))?;

    let proof_result = crate::prove::generate_proof(&bundle, &job.input_bytes, job.dev_mode)?;

    let prove_elapsed = prove_start.elapsed();
    eprintln!(
        "[prove-worker] Proof generated for nonce {} in {:.1}s (journal={} bytes, seal={} bytes)",
        nonce,
        prove_elapsed.as_secs_f64(),
        proof_result.journal_bytes.len(),
        proof_result.seal_bytes.len()
    );

    // Submit proof on-chain
    #[cfg(feature = "onchain")]
    {
        eprintln!("[prove-worker] Submitting proof for nonce {} on-chain...", nonce);
        let rt = tokio::runtime::Runtime::new()?;
        rt.block_on(submit_proof_onchain(
            &job.vault_address,
            &job.rpc_url,
            &job.private_key,
            nonce,
            &proof_result.seal_bytes,
            &proof_result.journal_bytes,
        ))?;
        eprintln!("[prove-worker] Proof for nonce {} submitted and confirmed.", nonce);
    }

    #[cfg(not(feature = "onchain"))]
    {
        eprintln!(
            "[prove-worker] Proof generated for nonce {} but on-chain submission disabled (no onchain feature).",
            nonce
        );
    }

    Ok(())
}

/// Submit a proof on-chain via vault.submitProof().
///
/// This calls the OptimisticKernelVault.submitProof(nonce, seal) function.
#[cfg(feature = "onchain")]
async fn submit_proof_onchain(
    vault_address: &str,
    rpc_url: &str,
    private_key: &str,
    execution_nonce: u64,
    seal_bytes: &[u8],
    _journal_bytes: &[u8],
) -> anyhow::Result<()> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, Bytes};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IOptimisticKernelVault {
            function submitProof(uint64 executionNonce, bytes calldata seal) external;
        }
    }

    let vault = Address::from_str(vault_address)
        .map_err(|_| anyhow::anyhow!("Invalid vault address: {}", vault_address))?;

    let url: reqwest::Url = rpc_url
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid RPC URL: {}", rpc_url))?;

    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid private key for proof submission"))?;

    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let contract = IOptimisticKernelVault::new(vault, provider);
    let seal = Bytes::copy_from_slice(seal_bytes);

    let tx = contract
        .submitProof(execution_nonce, seal)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("submitProof tx failed: {}", e))?;

    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get submitProof receipt: {}", e))?;

    if !receipt.status() {
        return Err(anyhow::anyhow!(
            "submitProof transaction reverted for nonce {}",
            execution_nonce
        ));
    }

    let tx_hash = format!("0x{}", hex::encode(receipt.transaction_hash.as_slice()));
    eprintln!(
        "[prove-worker] submitProof tx confirmed: {} (block {:?})",
        tx_hash, receipt.block_number
    );

    Ok(())
}
