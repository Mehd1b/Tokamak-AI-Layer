use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthenticatedKey;
use crate::queue::{JobStatus, ProofInput};
use crate::AppState;

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

/// POST /api/v1/prove request body.
#[derive(Debug, Deserialize)]
pub struct ProveRequest {
    /// 32-byte agent image ID as a hex string (64 chars).
    pub agent_image_id: String,
    /// Encoded KernelInputV1 bytes as a hex string.
    pub kernel_input: String,
}

/// POST /api/v1/prove response.
#[derive(Debug, Serialize)]
pub struct ProveResponse {
    pub job_id: Uuid,
    pub status: JobStatus,
}

/// GET /api/v1/proof/:job_id response.
#[derive(Debug, Serialize)]
pub struct JobStatusResponse {
    pub job_id: Uuid,
    pub status: JobStatus,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error: Option<String>,
}

/// GET /api/v1/proof/:job_id/result response.
#[derive(Debug, Serialize)]
pub struct ProofResultResponse {
    pub job_id: Uuid,
    /// Seal bytes as hex.
    pub seal: String,
    /// Journal bytes as hex.
    pub journal: String,
}

/// GET /health response.
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub queue_depth: usize,
    pub proving_count: usize,
}

/// Standard error response body.
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `POST /api/v1/prove` -- Submit a proof request.
pub async fn submit_proof(
    State(state): State<AppState>,
    _auth: AuthenticatedKey,
    Json(body): Json<ProveRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    // Parse agent_image_id.
    let image_id_bytes = hex::decode(&body.agent_image_id).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Invalid agent_image_id hex: {e}"),
            }),
        )
    })?;

    if image_id_bytes.len() != 32 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!(
                    "agent_image_id must be exactly 32 bytes (64 hex chars), got {} bytes",
                    image_id_bytes.len()
                ),
            }),
        ));
    }

    let mut agent_image_id = [0u8; 32];
    agent_image_id.copy_from_slice(&image_id_bytes);

    // Parse kernel_input.
    let kernel_input = hex::decode(&body.kernel_input).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Invalid kernel_input hex: {e}"),
            }),
        )
    })?;

    if kernel_input.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "kernel_input must not be empty".to_string(),
            }),
        ));
    }

    let input = ProofInput {
        agent_image_id,
        kernel_input,
    };

    let job_id = state.queue.submit(input).await;

    Ok((
        StatusCode::ACCEPTED,
        Json(ProveResponse {
            job_id,
            status: JobStatus::Queued,
        }),
    ))
}

/// `GET /api/v1/proof/:job_id` -- Poll job status.
pub async fn get_job_status(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<JobStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let job = state.queue.get_job(job_id).await.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Job {job_id} not found"),
            }),
        )
    })?;

    Ok(Json(JobStatusResponse {
        job_id: job.id,
        status: job.status,
        created_at: job.created_at.to_rfc3339(),
        started_at: job.started_at.map(|t| t.to_rfc3339()),
        completed_at: job.completed_at.map(|t| t.to_rfc3339()),
        error: job.error,
    }))
}

/// `GET /api/v1/proof/:job_id/result` -- Download proof result.
pub async fn get_proof_result(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<ProofResultResponse>, (StatusCode, Json<ErrorResponse>)> {
    let job = state.queue.get_job(job_id).await.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Job {job_id} not found"),
            }),
        )
    })?;

    match job.status {
        JobStatus::Completed => {
            let result = job.result.unwrap(); // Safe: COMPLETED always has a result.
            Ok(Json(ProofResultResponse {
                job_id,
                seal: hex::encode(&result.seal),
                journal: hex::encode(&result.journal),
            }))
        }
        JobStatus::Failed => Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorResponse {
                error: format!(
                    "Job {job_id} failed: {}",
                    job.error.unwrap_or_else(|| "unknown error".to_string())
                ),
            }),
        )),
        status => Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: format!("Job {job_id} is not complete yet (status: {status:?})"),
            }),
        )),
    }
}

/// `GET /health` -- Health check.
pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        queue_depth: state.queue.queue_depth().await,
        proving_count: state.queue.proving_count().await,
    })
}
