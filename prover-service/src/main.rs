mod auth;
mod prover;
mod queue;
mod routes;
mod worker;

use std::sync::Arc;

use axum::{routing::get, routing::post, Router};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{fmt, EnvFilter};

use auth::ApiKeyStore;
use prover::{MockProver, Prover};
use queue::JobQueue;
use worker::{WorkerConfig, spawn_workers};

// ---------------------------------------------------------------------------
// Shared application state
// ---------------------------------------------------------------------------

/// Application state shared across all handlers via Axum's `State` extractor.
#[derive(Clone)]
pub struct AppState {
    pub queue: JobQueue,
    pub key_store: ApiKeyStore,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    // Initialise tracing.
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("prover_service=info,tower_http=info")),
        )
        .init();

    // Read configuration from environment.
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let concurrency: usize = std::env::var("WORKER_CONCURRENCY")
        .ok()
        .and_then(|c| c.parse().ok())
        .unwrap_or(1);
    let api_keys_raw = std::env::var("API_KEYS").ok();

    // Build shared state.
    let queue = JobQueue::new();
    let key_store = ApiKeyStore::new(api_keys_raw.as_deref());

    let state = AppState {
        queue: queue.clone(),
        key_store,
    };

    // Select prover backend.
    //
    // In a production deployment you would swap this for `RiscZeroProver`
    // (or choose based on an env var). The MockProver is the default so
    // the service is functional out of the box for integration testing.
    let prover: Arc<dyn Prover> = Arc::new(MockProver);

    // Cancellation token for graceful shutdown.
    let shutdown_token = tokio_util::sync::CancellationToken::new();

    // Spawn background workers.
    let worker_config = WorkerConfig {
        concurrency,
        ..Default::default()
    };
    spawn_workers(
        queue,
        prover,
        worker_config,
        shutdown_token.clone(),
    );

    // Build router.
    let app = Router::new()
        // Public endpoints.
        .route("/health", get(routes::health))
        // Authenticated proof API.
        .route("/api/v1/prove", post(routes::submit_proof))
        .route("/api/v1/proof/{job_id}", get(routes::get_job_status))
        .route(
            "/api/v1/proof/{job_id}/result",
            get(routes::get_proof_result),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let bind_addr = format!("{host}:{port}");
    info!("Prover service listening on {bind_addr}");

    let listener = TcpListener::bind(&bind_addr)
        .await
        .expect("Failed to bind TCP listener");

    // Serve with graceful shutdown on SIGINT / SIGTERM.
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_token))
        .await
        .expect("Server error");
}

/// Wait for a shutdown signal (Ctrl-C or SIGTERM) then cancel the token.
async fn shutdown_signal(token: tokio_util::sync::CancellationToken) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { info!("Received SIGINT, shutting down..."); }
        _ = terminate => { info!("Received SIGTERM, shutting down..."); }
    }

    token.cancel();
}
