use std::sync::Arc;
use tokio::time::{self, Duration};
use tracing::{error, info};

use crate::prover::Prover;
use crate::queue::JobQueue;

/// Configuration for the background proof worker pool.
#[derive(Debug, Clone)]
pub struct WorkerConfig {
    /// Number of concurrent proving tasks.
    pub concurrency: usize,
    /// How often to poll the queue when idle (milliseconds).
    pub poll_interval_ms: u64,
    /// How often to run the stale-job expiry sweep (seconds).
    pub expiry_sweep_secs: u64,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            concurrency: 1,
            poll_interval_ms: 500,
            expiry_sweep_secs: 60,
        }
    }
}

/// Spawn the background worker pool.
///
/// This function spawns `config.concurrency` Tokio tasks, each polling the
/// queue for QUEUED jobs and invoking the prover. It also spawns a periodic
/// sweep task that expires stale PROVING jobs.
///
/// All spawned tasks respect the provided `shutdown` token and will exit
/// cleanly when it is cancelled.
pub fn spawn_workers(
    queue: JobQueue,
    prover: Arc<dyn Prover>,
    config: WorkerConfig,
    shutdown: tokio_util::sync::CancellationToken,
) {
    // Spawn proving workers.
    for worker_id in 0..config.concurrency {
        let q = queue.clone();
        let p = Arc::clone(&prover);
        let token = shutdown.clone();
        let poll_ms = config.poll_interval_ms;

        tokio::spawn(async move {
            info!(worker_id, "Proof worker started");

            loop {
                if token.is_cancelled() {
                    info!(worker_id, "Proof worker shutting down");
                    return;
                }

                match q.process_next().await {
                    Some(job) => {
                        let job_id = job.id;
                        info!(%job_id, worker_id, "Proving job");

                        match p.prove(job.input.agent_image_id, job.input.kernel_input.clone()).await
                        {
                            Ok(result) => {
                                info!(%job_id, worker_id, seal_len = result.seal.len(), "Proof completed");
                                q.complete(job_id, result).await;
                            }
                            Err(e) => {
                                error!(%job_id, worker_id, error = %e, "Proof generation failed");
                                q.fail(job_id, e.to_string()).await;
                            }
                        }
                    }
                    None => {
                        // No work available — sleep before polling again.
                        tokio::select! {
                            _ = time::sleep(Duration::from_millis(poll_ms)) => {}
                            _ = token.cancelled() => {
                                info!(worker_id, "Proof worker shutting down (idle)");
                                return;
                            }
                        }
                    }
                }
            }
        });
    }

    // Spawn stale-job expiry sweep.
    {
        let q = queue;
        let token = shutdown;
        let sweep_secs = config.expiry_sweep_secs;

        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(sweep_secs));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        q.expire_stale_jobs().await;
                    }
                    _ = token.cancelled() => {
                        info!("Expiry sweep shutting down");
                        return;
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prover::MockProver;
    use crate::queue::{JobStatus, ProofInput};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_worker_processes_job() {
        let queue = JobQueue::new();
        let prover: Arc<dyn Prover> = Arc::new(MockProver);
        let shutdown = tokio_util::sync::CancellationToken::new();

        let job_id = queue
            .submit(ProofInput {
                agent_image_id: [0xBB; 32],
                kernel_input: vec![10, 20],
            })
            .await;

        spawn_workers(
            queue.clone(),
            prover,
            WorkerConfig {
                concurrency: 1,
                poll_interval_ms: 50,
                expiry_sweep_secs: 600,
            },
            shutdown.clone(),
        );

        // Wait for the mock prover (2s delay + margin).
        tokio::time::sleep(Duration::from_secs(4)).await;

        assert_eq!(queue.get_status(job_id).await, Some(JobStatus::Completed));
        let result = queue.get_result(job_id).await.unwrap();
        assert!(!result.seal.is_empty());

        shutdown.cancel();
    }
}
