use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Status of a proof generation job.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobStatus {
    Queued,
    Proving,
    Completed,
    Failed,
}

/// Result of a successful proof generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofResult {
    /// RISC Zero seal bytes.
    pub seal: Vec<u8>,
    /// RISC Zero journal bytes (KernelJournalV1 encoding).
    pub journal: Vec<u8>,
}

/// Input payload for a proof request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofInput {
    /// The image ID of the agent ELF (32 bytes).
    pub agent_image_id: [u8; 32],
    /// Encoded KernelInputV1 bytes.
    pub kernel_input: Vec<u8>,
}

/// A single proof generation job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: Uuid,
    pub status: JobStatus,
    pub input: ProofInput,
    /// SHA-256 of the canonical input (used for deduplication).
    pub input_hash: String,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<ProofResult>,
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum time a job is allowed to stay in PROVING before it is considered
/// timed out and marked FAILED.
const JOB_TIMEOUT_SECS: i64 = 20 * 60; // 20 minutes

// ---------------------------------------------------------------------------
// Queue implementation
// ---------------------------------------------------------------------------

/// Thread-safe in-memory job queue.
#[derive(Clone)]
pub struct JobQueue {
    jobs: Arc<RwLock<HashMap<Uuid, Job>>>,
    /// Maps input_hash -> job_id for deduplication.
    dedup: Arc<RwLock<HashMap<String, Uuid>>>,
}

impl JobQueue {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
            dedup: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Submit a new proof request. Returns the job ID.
    ///
    /// If an identical input is already queued or in-progress the existing
    /// job ID is returned (deduplication).
    pub async fn submit(&self, input: ProofInput) -> Uuid {
        let input_hash = Self::compute_input_hash(&input);

        // Check dedup first.
        {
            let dedup = self.dedup.read().await;
            if let Some(existing_id) = dedup.get(&input_hash) {
                let jobs = self.jobs.read().await;
                if let Some(job) = jobs.get(existing_id) {
                    // Only dedup against non-failed jobs.
                    if job.status != JobStatus::Failed {
                        return *existing_id;
                    }
                }
            }
        }

        let id = Uuid::new_v4();
        let job = Job {
            id,
            status: JobStatus::Queued,
            input,
            input_hash: input_hash.clone(),
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            result: None,
            error: None,
        };

        {
            let mut jobs = self.jobs.write().await;
            jobs.insert(id, job);
        }
        {
            let mut dedup = self.dedup.write().await;
            dedup.insert(input_hash, id);
        }

        id
    }

    /// Get the current status of a job.
    pub async fn get_status(&self, job_id: Uuid) -> Option<JobStatus> {
        let jobs = self.jobs.read().await;
        jobs.get(&job_id).map(|j| j.status)
    }

    /// Get the full job record.
    pub async fn get_job(&self, job_id: Uuid) -> Option<Job> {
        let jobs = self.jobs.read().await;
        jobs.get(&job_id).cloned()
    }

    /// Get the proof result for a completed job.
    pub async fn get_result(&self, job_id: Uuid) -> Option<ProofResult> {
        let jobs = self.jobs.read().await;
        jobs.get(&job_id)
            .filter(|j| j.status == JobStatus::Completed)
            .and_then(|j| j.result.clone())
    }

    /// Pick the next QUEUED job and transition it to PROVING.
    /// Returns `None` if the queue is empty.
    pub async fn process_next(&self) -> Option<Job> {
        let mut jobs = self.jobs.write().await;

        // Find the oldest QUEUED job.
        let next_id = jobs
            .values()
            .filter(|j| j.status == JobStatus::Queued)
            .min_by_key(|j| j.created_at)
            .map(|j| j.id);

        if let Some(id) = next_id {
            if let Some(job) = jobs.get_mut(&id) {
                job.status = JobStatus::Proving;
                job.started_at = Some(Utc::now());
                return Some(job.clone());
            }
        }

        None
    }

    /// Mark a job as completed with a proof result.
    pub async fn complete(&self, job_id: Uuid, result: ProofResult) {
        let mut jobs = self.jobs.write().await;
        if let Some(job) = jobs.get_mut(&job_id) {
            job.status = JobStatus::Completed;
            job.completed_at = Some(Utc::now());
            job.result = Some(result);
        }
    }

    /// Mark a job as failed with an error message.
    pub async fn fail(&self, job_id: Uuid, error: String) {
        let mut jobs = self.jobs.write().await;
        if let Some(job) = jobs.get_mut(&job_id) {
            job.status = JobStatus::Failed;
            job.completed_at = Some(Utc::now());
            job.error = Some(error);
        }
    }

    /// Return queue depth (number of QUEUED jobs).
    pub async fn queue_depth(&self) -> usize {
        let jobs = self.jobs.read().await;
        jobs.values()
            .filter(|j| j.status == JobStatus::Queued)
            .count()
    }

    /// Return number of currently proving jobs.
    pub async fn proving_count(&self) -> usize {
        let jobs = self.jobs.read().await;
        jobs.values()
            .filter(|j| j.status == JobStatus::Proving)
            .count()
    }

    /// Expire timed-out PROVING jobs (> 20 minutes).
    pub async fn expire_stale_jobs(&self) {
        let now = Utc::now();
        let mut jobs = self.jobs.write().await;

        for job in jobs.values_mut() {
            if job.status == JobStatus::Proving {
                if let Some(started) = job.started_at {
                    let elapsed = now.signed_duration_since(started).num_seconds();
                    if elapsed > JOB_TIMEOUT_SECS {
                        job.status = JobStatus::Failed;
                        job.completed_at = Some(now);
                        job.error = Some(format!(
                            "Job timed out after {} seconds",
                            elapsed
                        ));
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    fn compute_input_hash(input: &ProofInput) -> String {
        let mut hasher = Sha256::new();
        hasher.update(input.agent_image_id);
        hasher.update(&input.kernel_input);
        hex::encode(hasher.finalize())
    }
}

impl Default for JobQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_input() -> ProofInput {
        ProofInput {
            agent_image_id: [0xAA; 32],
            kernel_input: vec![1, 2, 3, 4],
        }
    }

    #[tokio::test]
    async fn test_submit_and_get_status() {
        let queue = JobQueue::new();
        let id = queue.submit(sample_input()).await;
        assert_eq!(queue.get_status(id).await, Some(JobStatus::Queued));
    }

    #[tokio::test]
    async fn test_deduplication() {
        let queue = JobQueue::new();
        let id1 = queue.submit(sample_input()).await;
        let id2 = queue.submit(sample_input()).await;
        assert_eq!(id1, id2, "Identical inputs should return the same job ID");
    }

    #[tokio::test]
    async fn test_process_next_transitions_to_proving() {
        let queue = JobQueue::new();
        let id = queue.submit(sample_input()).await;
        let job = queue.process_next().await.unwrap();
        assert_eq!(job.id, id);
        assert_eq!(queue.get_status(id).await, Some(JobStatus::Proving));
    }

    #[tokio::test]
    async fn test_complete_job() {
        let queue = JobQueue::new();
        let id = queue.submit(sample_input()).await;
        let _ = queue.process_next().await;

        let result = ProofResult {
            seal: vec![0xDE, 0xAD],
            journal: vec![0xBE, 0xEF],
        };
        queue.complete(id, result.clone()).await;

        assert_eq!(queue.get_status(id).await, Some(JobStatus::Completed));
        let r = queue.get_result(id).await.unwrap();
        assert_eq!(r.seal, vec![0xDE, 0xAD]);
    }

    #[tokio::test]
    async fn test_fail_job() {
        let queue = JobQueue::new();
        let id = queue.submit(sample_input()).await;
        let _ = queue.process_next().await;
        queue.fail(id, "boom".to_string()).await;
        assert_eq!(queue.get_status(id).await, Some(JobStatus::Failed));
    }

    #[tokio::test]
    async fn test_queue_depth() {
        let queue = JobQueue::new();
        assert_eq!(queue.queue_depth().await, 0);

        queue
            .submit(ProofInput {
                agent_image_id: [1; 32],
                kernel_input: vec![1],
            })
            .await;
        queue
            .submit(ProofInput {
                agent_image_id: [2; 32],
                kernel_input: vec![2],
            })
            .await;
        assert_eq!(queue.queue_depth().await, 2);
    }

    #[tokio::test]
    async fn test_dedup_allows_retry_after_failure() {
        let queue = JobQueue::new();
        let id1 = queue.submit(sample_input()).await;
        let _ = queue.process_next().await;
        queue.fail(id1, "error".to_string()).await;

        // Same input should create a new job because the old one failed.
        let id2 = queue.submit(sample_input()).await;
        assert_ne!(id1, id2);
    }
}
